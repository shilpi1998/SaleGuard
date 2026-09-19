"""Gate/escalation logic: decides whether a lead's score results can be auto-submitted
or must be held for human review.
"""

import random
from dataclasses import dataclass

from app.config import get_settings
from app.models.models import CheckLibrary, GateDecision, ResultEnum


@dataclass
class ScoredCheckResult:
    """Minimal view of a single check result needed by the gate, decoupled from the
    ORM/dict shape so `decide()` can be called with either ScoreResult-like objects
    or plain dicts, as long as they carry these attributes."""

    check: CheckLibrary
    result: str
    confidence: float


class GateLogic:
    CONFIDENCE_THRESHOLD: float = get_settings().CONFIDENCE_THRESHOLD
    RANDOM_SAMPLE_RATE: float = get_settings().RANDOM_SAMPLE_RATE

    @classmethod
    def decide(cls, results: list) -> tuple[str, bool]:
        """Decide the gate outcome for a set of check results belonging to one lead.

        `results` is a list of objects/dicts each exposing:
            - check: the CheckLibrary (or object with `.is_critical`)
            - result: "PASS" | "FAIL" | "NOTE"
            - confidence: float

        Returns a tuple of (gate_decision: str, is_random_sample: bool).
        """
        for item in results:
            check = cls._get(item, "check")
            result = cls._get(item, "result")
            is_critical = getattr(check, "is_critical", False) if check is not None else False
            if is_critical and cls._normalize_result(result) == ResultEnum.FAIL.value:
                return GateDecision.HELD_CRITICAL_FAIL.value, False

        for item in results:
            confidence = cls._get(item, "confidence")
            if confidence is not None and confidence < cls.CONFIDENCE_THRESHOLD:
                return GateDecision.HELD_LOW_CONFIDENCE.value, False

        if random.random() < cls.RANDOM_SAMPLE_RATE:
            return GateDecision.HELD_RANDOM_SAMPLE.value, True

        return GateDecision.AUTO_SUBMIT.value, False

    @staticmethod
    def _get(item, attr):
        if isinstance(item, dict):
            return item.get(attr)
        return getattr(item, attr, None)

    @staticmethod
    def _normalize_result(result) -> str:
        return result.value if isinstance(result, ResultEnum) else str(result)
