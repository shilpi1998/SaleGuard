"""Evaluator for Type C checks: agent behaviour and call quality patterns.

Entirely config-driven via `check.evaluation_config`, which is expected to contain:
    behaviour_type: str              -- short label for the behaviour being assessed
    threshold_seconds: float | None  -- optional numeric threshold (e.g. dead-air gap length)
    max_occurrences: int | None      -- optional max allowed occurrences before FAIL
    instructions: str                -- free-text instructions describing exactly what
                                         to look for and how to judge PASS/FAIL/NOTE

No check-specific logic is hardcoded here — new behaviour checks for any retailer
require only a new check_library row with an appropriate evaluation_config.
"""

from app.models.models import CheckLibrary, Lead
from app.services.scoring.evaluators.base import BaseEvaluator


class BehaviourEvaluator(BaseEvaluator):
    def build_system_prompt(self, check: CheckLibrary, lead: Lead) -> str:
        return (
            "You are a QA auditor evaluating agent behaviour and call quality during "
            "Australian energy/broadband sales calls."
        )

    def build_user_prompt(self, check: CheckLibrary, lead: Lead, transcript: list[dict]) -> str:
        config = check.evaluation_config or {}
        behaviour_type = config.get("behaviour_type", "")
        threshold_seconds = config.get("threshold_seconds")
        max_occurrences = config.get("max_occurrences")
        instructions = config.get("instructions", "")

        formatted_transcript = self.format_transcript(transcript)

        threshold_line = (
            f"Threshold (seconds): {threshold_seconds}\n" if threshold_seconds is not None else ""
        )
        max_occ_line = (
            f"Maximum allowed occurrences: {max_occurrences}\n" if max_occurrences is not None else ""
        )

        return f"""# Check to evaluate

Check code: {check.code}
Check name: {check.name}
Description: {check.description or "(none provided)"}
Behaviour type: {behaviour_type}
{threshold_line}{max_occ_line}
# Evaluation instructions

{instructions or "(no specific instructions provided — use general judgement)"}

# Call transcript

Each line is formatted as: [utterance index] [start-end seconds] Speaker: text.
Timestamps let you compute gaps between utterances if relevant (e.g. for dead-air
analysis, compare the `end` of one utterance to the `start` of the next).

{formatted_transcript}

# Your task

1. Analyze the transcript for the behaviour pattern described above, following the
   evaluation instructions exactly (including any numeric thresholds or occurrence
   limits given).
2. If the behaviour pattern violates the instructions/thresholds, this is a FAIL.
3. If the behaviour is acceptable and meets the standard described, this is a PASS.
4. If the evidence is ambiguous, borderline, or only a minor/isolated instance not
   clearly rising to the level of a violation, use NOTE.
5. Call the record_check_result tool with your determination. The
   transcript_utterance_index, audio_timestamp_start, and audio_timestamp_end must
   point to the single utterance containing the strongest evidence (e.g. the
   utterance right before or after the most significant violation, or the most
   representative example of good/bad behaviour). If no specific utterance stands
   out, use utterance 0.
"""
