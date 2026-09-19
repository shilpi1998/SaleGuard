from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import GateDecision
from app.models import models
from app.schemas import schemas

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _default_date_range(from_date: date | None, to_date: date | None) -> tuple[date, date]:
    resolved_to = to_date or date.today()
    resolved_from = from_date or (resolved_to - timedelta(days=30))
    return resolved_from, resolved_to


@router.get("/summary", response_model=schemas.DashboardSummary)
def get_summary(
    retailer_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
):
    resolved_from, resolved_to = _default_date_range(from_date, to_date)

    query = db.query(models.Scorecard).filter(
        func.date(models.Scorecard.created_at) >= resolved_from,
        func.date(models.Scorecard.created_at) <= resolved_to,
    )
    if retailer_id is not None:
        query = query.filter(models.Scorecard.retailer_id == retailer_id)

    scorecards = query.all()

    total_scored = len(scorecards)

    if total_scored == 0:
        return schemas.DashboardSummary(
            total_scored=0,
            total_passed=0,
            total_failed=0,
            pass_rate=0.0,
            critical_fail_rate=0.0,
            first_pass_yield=0.0,
            avg_weighted_score=0.0,
            avg_weighted_score_excl_fatal=0.0,
            avg_confidence=0.0,
        )

    total_passed = sum(
        1 for sc in scorecards if sc.gate_decision == GateDecision.AUTO_SUBMIT.value
    )
    total_failed = total_scored - total_passed
    critical_fail_count = sum(
        1 for sc in scorecards if (sc.critical_total - sc.critical_passed) > 0
    )

    pass_rate = total_passed / total_scored
    critical_fail_rate = critical_fail_count / total_scored
    first_pass_yield = total_passed / total_scored
    avg_weighted_score = sum(sc.weighted_score for sc in scorecards) / total_scored
    avg_weighted_score_excl_fatal = (
        sum(sc.weighted_score_excl_fatal for sc in scorecards) / total_scored
    )

    lead_ids = [sc.lead_id for sc in scorecards]
    avg_confidence_row = (
        db.query(func.avg(models.ScoreResult.confidence))
        .filter(models.ScoreResult.lead_id.in_(lead_ids))
        .scalar()
    )
    avg_confidence = float(avg_confidence_row) if avg_confidence_row is not None else 0.0

    return schemas.DashboardSummary(
        total_scored=total_scored,
        total_passed=total_passed,
        total_failed=total_failed,
        pass_rate=pass_rate,
        critical_fail_rate=critical_fail_rate,
        first_pass_yield=first_pass_yield,
        avg_weighted_score=avg_weighted_score,
        avg_weighted_score_excl_fatal=avg_weighted_score_excl_fatal,
        avg_confidence=avg_confidence,
    )


@router.get("/critical-fails", response_model=list[schemas.CriticalFailBreakdown])
def get_critical_fails(
    retailer_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
):
    resolved_from, resolved_to = _default_date_range(from_date, to_date)

    base_query = (
        db.query(models.ScoreResult, models.CheckLibrary, models.Retailer)
        .join(models.CheckLibrary, models.ScoreResult.check_id == models.CheckLibrary.id)
        .join(models.Lead, models.ScoreResult.lead_id == models.Lead.id)
        .join(models.Retailer, models.Lead.retailer_id == models.Retailer.id)
        .filter(models.CheckLibrary.is_critical.is_(True))
        .filter(
            func.date(models.ScoreResult.created_at) >= resolved_from,
            func.date(models.ScoreResult.created_at) <= resolved_to,
        )
    )
    if retailer_id is not None:
        base_query = base_query.filter(models.Lead.retailer_id == retailer_id)

    rows = base_query.all()

    breakdown: dict[tuple[str, str, str], dict] = {}
    for score_result, check, retailer in rows:
        key = (check.check_type.value, retailer.name, check.code)
        if key not in breakdown:
            breakdown[key] = {
                "check_id": check.id,
                "check_code": check.code,
                "check_name": check.name,
                "check_type": check.check_type.value,
                "retailer_name": retailer.name,
                "fail_count": 0,
                "total_scored": 0,
            }
        breakdown[key]["total_scored"] += 1
        if score_result.result == models.ResultEnum.FAIL.value:
            breakdown[key]["fail_count"] += 1

    results: list[schemas.CriticalFailBreakdown] = []
    for entry in breakdown.values():
        total = entry["total_scored"]
        fail_rate = entry["fail_count"] / total if total else 0.0
        results.append(
            schemas.CriticalFailBreakdown(
                check_id=entry["check_id"],
                check_code=entry["check_code"],
                check_name=entry["check_name"],
                check_type=entry["check_type"],
                retailer_name=entry["retailer_name"],
                fail_count=entry["fail_count"],
                total_scored=total,
                fail_rate=fail_rate,
            )
        )

    results.sort(key=lambda r: r.fail_count, reverse=True)
    return results


@router.get("/gate-distribution", response_model=list[schemas.GateDistribution])
def get_gate_distribution(
    retailer_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
):
    resolved_from, resolved_to = _default_date_range(from_date, to_date)
    query = db.query(models.Scorecard).filter(
        func.date(models.Scorecard.created_at) >= resolved_from,
        func.date(models.Scorecard.created_at) <= resolved_to,
    )
    if retailer_id is not None:
        query = query.filter(models.Scorecard.retailer_id == retailer_id)

    scorecards = query.all()
    counts: dict[str, int] = {}
    for sc in scorecards:
        d = sc.gate_decision or "unknown"
        counts[d] = counts.get(d, 0) + 1
    return [
        schemas.GateDistribution(gate_decision=k, count=v)
        for k, v in counts.items()
    ]


@router.get("/retailers", response_model=list[schemas.RetailerOut])
def get_retailers(db: Session = Depends(get_db)):
    return db.query(models.Retailer).filter(models.Retailer.active.is_(True)).all()


@router.get("/repeat-offenders", response_model=list[schemas.RepeatOffender])
def get_repeat_offenders(
    window_days: int = Query(default=7, ge=1),
    min_occurrences: int = Query(default=3, ge=1),
    db: Session = Depends(get_db),
):
    window_start = datetime.utcnow() - timedelta(days=window_days)

    rows = (
        db.query(models.ScoreResult, models.CheckLibrary, models.Lead, models.Agent)
        .join(models.CheckLibrary, models.ScoreResult.check_id == models.CheckLibrary.id)
        .join(models.Lead, models.ScoreResult.lead_id == models.Lead.id)
        .join(models.Agent, models.Lead.agent_id == models.Agent.id)
        .filter(models.CheckLibrary.is_critical.is_(True))
        .filter(models.ScoreResult.created_at >= window_start)
        .all()
    )

    agent_stats: dict[int, dict] = {}
    agent_leads: dict[int, set[int]] = {}

    for score_result, check, lead, agent in rows:
        stats = agent_stats.setdefault(
            agent.id,
            {
                "agent_id": agent.id,
                "agent_name": agent.name,
                "employee_id": agent.employee_id,
                "critical_fail_count": 0,
            },
        )
        agent_leads.setdefault(agent.id, set()).add(lead.id)
        if score_result.result == models.ResultEnum.FAIL.value:
            stats["critical_fail_count"] += 1

    results: list[schemas.RepeatOffender] = []
    for agent_id, stats in agent_stats.items():
        if stats["critical_fail_count"] < min_occurrences:
            continue
        leads_scored = len(agent_leads.get(agent_id, set()))
        fail_rate = (
            stats["critical_fail_count"] / leads_scored if leads_scored else 0.0
        )
        results.append(
            schemas.RepeatOffender(
                agent_id=stats["agent_id"],
                agent_name=stats["agent_name"],
                employee_id=stats["employee_id"],
                critical_fail_count=stats["critical_fail_count"],
                leads_scored=leads_scored,
                fail_rate=fail_rate,
            )
        )

    results.sort(key=lambda r: r.critical_fail_count, reverse=True)
    return results


@router.get("/agent-performance", response_model=list[schemas.AgentPerformance])
def get_agent_performance(
    retailer_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
):
    resolved_from, resolved_to = _default_date_range(from_date, to_date)

    query = (
        db.query(models.Scorecard, models.Lead, models.Agent)
        .join(models.Lead, models.Scorecard.lead_id == models.Lead.id)
        .join(models.Agent, models.Lead.agent_id == models.Agent.id)
        .filter(
            func.date(models.Scorecard.created_at) >= resolved_from,
            func.date(models.Scorecard.created_at) <= resolved_to,
        )
    )
    if retailer_id is not None:
        query = query.filter(models.Scorecard.retailer_id == retailer_id)

    rows = query.all()

    agent_stats: dict[int, dict] = {}
    for scorecard, lead, agent in rows:
        stats = agent_stats.setdefault(
            agent.id,
            {
                "agent_id": agent.id,
                "agent_name": agent.name,
                "employee_id": agent.employee_id,
                "site": agent.site,
                "team_leader_name": agent.team_leader_name,
                "leads_scored": 0,
                "passed": 0,
                "failed": 0,
                "critical_fail_count": 0,
                "weighted_score_sum": 0.0,
                "weighted_score_excl_fatal_sum": 0.0,
            },
        )
        stats["leads_scored"] += 1
        if scorecard.gate_decision == GateDecision.AUTO_SUBMIT.value:
            stats["passed"] += 1
        else:
            stats["failed"] += 1
        if (scorecard.critical_total - scorecard.critical_passed) > 0:
            stats["critical_fail_count"] += 1
        stats["weighted_score_sum"] += scorecard.weighted_score
        stats["weighted_score_excl_fatal_sum"] += scorecard.weighted_score_excl_fatal

    results: list[schemas.AgentPerformance] = []
    for stats in agent_stats.values():
        leads_scored = stats["leads_scored"]
        pass_rate = stats["passed"] / leads_scored if leads_scored else 0.0
        critical_fail_rate = (
            stats["critical_fail_count"] / leads_scored if leads_scored else 0.0
        )
        avg_weighted_score = (
            stats["weighted_score_sum"] / leads_scored if leads_scored else 0.0
        )
        avg_weighted_score_excl_fatal = (
            stats["weighted_score_excl_fatal_sum"] / leads_scored if leads_scored else 0.0
        )
        results.append(
            schemas.AgentPerformance(
                agent_id=stats["agent_id"],
                agent_name=stats["agent_name"],
                employee_id=stats["employee_id"],
                site=stats["site"],
                team_leader_name=stats["team_leader_name"],
                leads_scored=leads_scored,
                passed=stats["passed"],
                failed=stats["failed"],
                pass_rate=pass_rate,
                critical_fail_count=stats["critical_fail_count"],
                critical_fail_rate=critical_fail_rate,
                avg_weighted_score=avg_weighted_score,
                avg_weighted_score_excl_fatal=avg_weighted_score_excl_fatal,
            )
        )

    results.sort(key=lambda r: r.leads_scored, reverse=True)
    return results


_BREAKDOWN_DIMENSIONS = {"campaign", "site", "team_leader"}


@router.get("/breakdown", response_model=list[schemas.DimensionBreakdown])
def get_breakdown(
    group_by: str = Query(default="campaign"),
    retailer_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
):
    if group_by not in _BREAKDOWN_DIMENSIONS:
        group_by = "campaign"

    resolved_from, resolved_to = _default_date_range(from_date, to_date)

    query = (
        db.query(models.Scorecard, models.Lead, models.Agent)
        .join(models.Lead, models.Scorecard.lead_id == models.Lead.id)
        .outerjoin(models.Agent, models.Lead.agent_id == models.Agent.id)
        .filter(
            func.date(models.Scorecard.created_at) >= resolved_from,
            func.date(models.Scorecard.created_at) <= resolved_to,
        )
    )
    if retailer_id is not None:
        query = query.filter(models.Scorecard.retailer_id == retailer_id)

    rows = query.all()

    group_stats: dict[str, dict] = {}
    for scorecard, lead, agent in rows:
        if group_by == "campaign":
            group_name = lead.campaign or "Unspecified"
        elif group_by == "site":
            group_name = (agent.site if agent else None) or "Unspecified"
        else:  # team_leader
            group_name = (agent.team_leader_name if agent else None) or "Unspecified"

        stats = group_stats.setdefault(
            group_name,
            {
                "group_name": group_name,
                "leads_scored": 0,
                "passed": 0,
                "failed": 0,
                "critical_fail_count": 0,
                "weighted_score_sum": 0.0,
            },
        )
        stats["leads_scored"] += 1
        if scorecard.gate_decision == GateDecision.AUTO_SUBMIT.value:
            stats["passed"] += 1
        else:
            stats["failed"] += 1
        if (scorecard.critical_total - scorecard.critical_passed) > 0:
            stats["critical_fail_count"] += 1
        stats["weighted_score_sum"] += scorecard.weighted_score

    results: list[schemas.DimensionBreakdown] = []
    for stats in group_stats.values():
        leads_scored = stats["leads_scored"]
        pass_rate = stats["passed"] / leads_scored if leads_scored else 0.0
        critical_fail_rate = (
            stats["critical_fail_count"] / leads_scored if leads_scored else 0.0
        )
        avg_weighted_score = (
            stats["weighted_score_sum"] / leads_scored if leads_scored else 0.0
        )
        results.append(
            schemas.DimensionBreakdown(
                group_name=stats["group_name"],
                leads_scored=leads_scored,
                passed=stats["passed"],
                failed=stats["failed"],
                pass_rate=pass_rate,
                critical_fail_rate=critical_fail_rate,
                avg_weighted_score=avg_weighted_score,
            )
        )

    results.sort(key=lambda r: r.leads_scored, reverse=True)
    return results


@router.get("/auditor-agreement", response_model=schemas.AuditorAgreement)
def get_auditor_agreement(
    retailer_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
):
    resolved_from, resolved_to = _default_date_range(from_date, to_date)

    override_query = db.query(models.Override).filter(
        func.date(models.Override.created_at) >= resolved_from,
        func.date(models.Override.created_at) <= resolved_to,
    )
    if retailer_id is not None:
        override_query = override_query.join(
            models.Lead, models.Override.lead_id == models.Lead.id
        ).filter(models.Lead.retailer_id == retailer_id)

    overrides = override_query.all()

    total_overrides = len(overrides)
    fail_to_pass_count = sum(
        1
        for o in overrides
        if o.original_result == models.ResultEnum.FAIL.value
        and o.new_result == models.ResultEnum.PASS.value
    )
    fail_to_note_count = sum(
        1
        for o in overrides
        if o.original_result == models.ResultEnum.FAIL.value
        and o.new_result == models.ResultEnum.NOTE.value
    )

    # Agreement rate: of all score results in range, what fraction ended up
    # with a final result matching the AI's original result (i.e. was never
    # overridden). Higher = better AI/human calibration.
    result_query = db.query(models.ScoreResult).filter(
        func.date(models.ScoreResult.created_at) >= resolved_from,
        func.date(models.ScoreResult.created_at) <= resolved_to,
    )
    if retailer_id is not None:
        result_query = result_query.join(
            models.Lead, models.ScoreResult.lead_id == models.Lead.id
        ).filter(models.Lead.retailer_id == retailer_id)

    total_results = result_query.count()
    agreement_rate = (
        (total_results - total_overrides) / total_results if total_results else 0.0
    )

    return schemas.AuditorAgreement(
        total_overrides=total_overrides,
        fail_to_pass_count=fail_to_pass_count,
        fail_to_note_count=fail_to_note_count,
        agreement_rate=agreement_rate,
    )
