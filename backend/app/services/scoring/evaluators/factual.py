"""Evaluator for Type B checks: factual accuracy vs. CRM data / rate card.

Entirely config-driven via `check.evaluation_config`, which is expected to contain:
    crm_fields: list[str]        -- keys into lead.crm_data whose values are "ground truth"
    rate_card_reference: dict    -- optional static reference data (e.g. official rate card)
    comparison_rules: str        -- free-text rules describing how to compare
    speaker: str                 -- which party ("agent" or "customer") must state the fact

No check-specific logic is hardcoded here — new factual checks for any retailer
require only a new check_library row with an appropriate evaluation_config.
"""

from app.models.models import CheckLibrary, Lead
from app.services.scoring.evaluators.base import BaseEvaluator


class FactualEvaluator(BaseEvaluator):
    def build_system_prompt(self, check: CheckLibrary, lead: Lead) -> str:
        return (
            "You are a QA auditor verifying factual accuracy of information "
            "communicated during Australian energy/broadband sales calls. Compare "
            "what the agent told the customer against CRM data and rate card values."
        )

    def build_user_prompt(self, check: CheckLibrary, lead: Lead, transcript: list[dict]) -> str:
        config = check.evaluation_config or {}
        crm_fields = config.get("crm_fields", [])
        rate_card_reference = config.get("rate_card_reference", {})
        comparison_rules = config.get("comparison_rules", "")
        speaker = config.get("speaker", "agent")

        crm_data = lead.crm_data or {}
        crm_truth = {field: crm_data.get(field) for field in crm_fields}
        crm_truth_lines = "\n".join(f"  - {k}: {v!r}" for k, v in crm_truth.items()) or "  (none)"

        rate_card_lines = (
            "\n".join(f"  - {k}: {v!r}" for k, v in rate_card_reference.items())
            if rate_card_reference
            else "  (no rate card reference provided for this check)"
        )

        formatted_transcript = self.format_transcript(transcript)

        return f"""# Check to evaluate

Check code: {check.code}
Check name: {check.name}
Description: {check.description or "(none provided)"}

# Ground truth (CRM data for this lead)

{crm_truth_lines}

# Ground truth (rate card reference)

{rate_card_lines}

# Comparison rules

{comparison_rules or "(no specific rules provided — use general accuracy judgement)"}

# Call transcript

Each line is formatted as: [utterance index] [start-end seconds] Speaker: text

{formatted_transcript}

# Your task

1. Search the transcript for what the {speaker} told the customer regarding the fields
   above ({", ".join(crm_fields) if crm_fields else "the relevant subject matter"}).
2. Compare what was actually said against the CRM ground truth and/or rate card
   reference, applying the comparison rules above.
3. If the {speaker} stated something that is inconsistent with the ground truth in a
   way that would matter to the customer (per the comparison rules), this is a FAIL.
4. If the {speaker} never addressed the required fact at all, this is a FAIL, unless
   the comparison rules indicate otherwise.
5. If the statement is accurate and consistent with the ground truth, this is a PASS.
6. If it is unclear, partially addressed, or borderline under the comparison rules,
   use NOTE.
7. Call the record_check_result tool with your determination. The
   transcript_utterance_index, audio_timestamp_start, and audio_timestamp_end must
   point to the single utterance containing the strongest evidence (the utterance
   where the fact was stated, or the closest relevant utterance if it was never
   stated at all — or utterance 0 if nothing at all is relevant).
"""
