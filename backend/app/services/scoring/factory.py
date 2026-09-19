"""Factory that maps a CheckLibrary's check_type to the correct evaluator class.

This is the only place in the codebase that ties a `CheckType` enum value to a
concrete evaluator implementation. Everything else about a check's behaviour comes
from its `evaluation_config` JSONB — adding a new retailer's checks never requires
touching this file, only adding new `check_library` rows of an existing check_type.
"""

from app.models.models import CheckType
from app.services.scoring.evaluators.base import BaseEvaluator
from app.services.scoring.evaluators.behaviour import BehaviourEvaluator
from app.services.scoring.evaluators.factual import FactualEvaluator
from app.services.scoring.evaluators.verbatim import VerbatimEvaluator


class EvaluatorFactory:
    _REGISTRY: dict[CheckType, type[BaseEvaluator]] = {
        CheckType.A_VERBATIM: VerbatimEvaluator,
        CheckType.B_FACTUAL: FactualEvaluator,
        CheckType.C_BEHAVIOUR: BehaviourEvaluator,
    }

    @classmethod
    def get_evaluator(cls, check_type: str | CheckType) -> BaseEvaluator:
        key = CheckType(check_type) if not isinstance(check_type, CheckType) else check_type
        evaluator_cls = cls._REGISTRY.get(key)
        if evaluator_cls is None:
            raise ValueError(f"No evaluator registered for check_type={check_type!r}")
        return evaluator_cls()
