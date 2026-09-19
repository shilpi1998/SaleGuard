"""Top-level orchestrator that scores a single lead end-to-end:

    load lead + transcript -> resolve active checks for the retailer/sale_date
    -> run each check through its evaluator -> aggregate into a scorecard
    -> apply gate logic -> persist everything -> update the lead's status

This is intentionally synchronous/sequential (no asyncio) — good enough for a
hackathon-scale volume of checks per call, and keeps the code simple.
"""

import time

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.models import (
    CheckLibrary,
    GateDecision,
    Lead,
    ResultEnum,
    ScoreResult,
    Scorecard,
    Transcript,
)
from app.services.scoring.factory import EvaluatorFactory
from app.services.scoring.gate import GateLogic


class ScoringOrchestrator:
    def score_lead(self, lead_id: int, db: Session) -> Scorecard:
        started_at = time.time()

        lead = db.query(Lead).filter(Lead.id == lead_id).one_or_none()
        if lead is None:
            raise ValueError(f"Lead {lead_id} not found")

        transcript = (
            db.query(Transcript).filter(Transcript.lead_id == lead_id).one_or_none()
        )
        if transcript is None:
            raise ValueError(f"Lead {lead_id} has no transcript to score")

        checks = self._get_active_checks(db, lead)

        score_results: list[ScoreResult] = []
        gate_inputs: list[dict] = []

        for check in checks:
            evaluator = EvaluatorFactory.get_evaluator(check.check_type)
            outcome = evaluator.evaluate(check, lead, transcript.utterances)

            score_result = ScoreResult(
                lead_id=lead.id,
                check_id=check.id,
                check_version=check.version,
                result=ResultEnum(outcome["result"]),
                confidence=outcome["confidence"],
                evidence_text=outcome["evidence_text"],
                transcript_utterance_index=outcome["transcript_utterance_index"],
                audio_timestamp_start=outcome["audio_timestamp_start"],
                audio_timestamp_end=outcome["audio_timestamp_end"],
                reasoning=outcome["reasoning"],
                raw_llm_response=outcome["raw_llm_response"],
                model_used=outcome["model_used"],
                prompt_tokens=outcome["prompt_tokens"],
                completion_tokens=outcome["completion_tokens"],
                latency_ms=outcome["latency_ms"],
            )
            score_result.check = check
            score_results.append(score_result)
            gate_inputs.append(
                {"check": check, "result": outcome["result"], "confidence": outcome["confidence"]}
            )

        aggregates = self._aggregate(checks, score_results)
        gate_decision, is_random_sample = GateLogic.decide(gate_inputs)

        scoring_duration_ms = int((time.time() - started_at) * 1000)

        scorecard = Scorecard(
            lead_id=lead.id,
            retailer_id=lead.retailer_id,
            total_checks=aggregates["total_checks"],
            passed=aggregates["passed"],
            failed=aggregates["failed"],
            noted=aggregates["noted"],
            critical_total=aggregates["critical_total"],
            critical_passed=aggregates["critical_passed"],
            weighted_score=aggregates["weighted_score"],
            weighted_score_excl_fatal=aggregates["weighted_score_excl_fatal"],
            gate_decision=GateDecision(gate_decision),
            is_random_sample=is_random_sample,
            scoring_duration_ms=scoring_duration_ms,
        )

        # Clear prior results for re-scoring idempotency.
        db.query(ScoreResult).filter(ScoreResult.lead_id == lead.id).delete()
        db.query(Scorecard).filter(Scorecard.lead_id == lead.id).delete()
        db.flush()

        for score_result in score_results:
            db.add(score_result)

        db.add(scorecard)

        lead.gate_decision = GateDecision(gate_decision)
        lead.status = "scored"

        db.commit()
        db.refresh(scorecard)

        return scorecard

    @staticmethod
    def _get_active_checks(db: Session, lead: Lead) -> list[CheckLibrary]:
        sale_date = lead.sale_date
        return (
            db.query(CheckLibrary)
            .filter(
                CheckLibrary.retailer_id == lead.retailer_id,
                CheckLibrary.effective_from <= sale_date,
                or_(
                    CheckLibrary.effective_to.is_(None),
                    CheckLibrary.effective_to >= sale_date,
                ),
            )
            .order_by(CheckLibrary.sort_order.asc())
            .all()
        )

    @staticmethod
    def _aggregate(checks: list[CheckLibrary], score_results: list[ScoreResult]) -> dict:
        total_checks = len(score_results)
        passed = sum(1 for r in score_results if r.result == ResultEnum.PASS)
        failed = sum(1 for r in score_results if r.result == ResultEnum.FAIL)
        noted = sum(1 for r in score_results if r.result == ResultEnum.NOTE)

        critical_results = [r for r in score_results if r.check.is_critical]
        critical_total = len(critical_results)
        critical_passed = sum(1 for r in critical_results if r.result == ResultEnum.PASS)

        total_weight = sum(r.check.weight for r in score_results)
        weighted_pass_sum = sum(r.check.weight for r in score_results if r.result == ResultEnum.PASS)
        weighted_score = (weighted_pass_sum / total_weight) if total_weight > 0 else 0.0

        non_fatal_results = [
            r for r in score_results if not (r.check.is_critical and r.result == ResultEnum.FAIL)
        ]
        total_weight_excl_fatal = sum(r.check.weight for r in non_fatal_results)
        weighted_pass_sum_excl_fatal = sum(
            r.check.weight for r in non_fatal_results if r.result == ResultEnum.PASS
        )
        weighted_score_excl_fatal = (
            (weighted_pass_sum_excl_fatal / total_weight_excl_fatal)
            if total_weight_excl_fatal > 0
            else 0.0
        )

        return {
            "total_checks": total_checks,
            "passed": passed,
            "failed": failed,
            "noted": noted,
            "critical_total": critical_total,
            "critical_passed": critical_passed,
            "weighted_score": weighted_score,
            "weighted_score_excl_fatal": weighted_score_excl_fatal,
        }
