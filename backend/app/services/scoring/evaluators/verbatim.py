"""Evaluator for Type A checks: verbatim script / disclosure compliance.

Entirely config-driven via `check.evaluation_config`, which is expected to contain:
    approved_script: str   -- the exact wording the agent should have said
    key_phrases: list[str] -- key phrases that must be present in some form
    match_threshold: float -- minimum semantic similarity (0-1) to count as a match
    speaker: str           -- which party ("agent" or "customer") must say it

No check-specific logic is hardcoded here — new verbatim checks for any retailer
require only a new check_library row with an appropriate evaluation_config.
"""

from app.models.models import CheckLibrary, Lead
from app.services.scoring.evaluators.base import BaseEvaluator


class VerbatimEvaluator(BaseEvaluator):
    def build_system_prompt(self, check: CheckLibrary, lead: Lead) -> str:
        return (
            "You are a QA auditor for Australian energy/broadband sales calls. "
            "Evaluate whether the agent read the required script/disclosure verbatim. "
            "You must find the exact utterance where this was said."
        )

    def build_user_prompt(self, check: CheckLibrary, lead: Lead, transcript: list[dict]) -> str:
        config = check.evaluation_config or {}
        approved_script = config.get("approved_script", "")
        key_phrases = config.get("key_phrases", [])
        match_threshold = config.get("match_threshold", 0.7)
        speaker = config.get("speaker", "agent")

        formatted_transcript = self.format_transcript(transcript)
        key_phrases_str = ", ".join(f'"{p}"' for p in key_phrases) if key_phrases else "(none specified)"

        return f"""# Check to evaluate

Check code: {check.code}
Check name: {check.name}
Description: {check.description or "(none provided)"}

# Compliance requirement

The {speaker} must have said something that matches (semantically, not necessarily
word-for-word) the following approved script:

    "{approved_script}"

Key phrases that should be covered (in substance, not necessarily verbatim): {key_phrases_str}

Minimum acceptable semantic similarity / coverage threshold: {match_threshold}

# Call transcript

Each line is formatted as: [utterance index] [start-end seconds] Speaker: text

{formatted_transcript}

# Your task

1. Search the transcript for the utterance(s) spoken by the {speaker} that most closely
   correspond to the approved script above.
2. Judge whether the substance of the approved script was actually communicated —
   compare semantic meaning and coverage of the key phrases, not exact wording.
   Minor paraphrasing, reordering, or filler words are acceptable as long as the
   substantive meaning and required key phrases are conveyed.
3. If the {speaker} never said anything reasonably matching the approved script, or the
   key phrases are substantially missing, this is a FAIL.
4. If the match is close but something material is missing or ambiguous, use NOTE.
5. If you find a clear, adequate match meeting the threshold, this is a PASS.
6. Call the record_check_result tool with your determination. The
   transcript_utterance_index, audio_timestamp_start, and audio_timestamp_end must
   point to the single utterance containing the strongest evidence (the best matching
   utterance, or the last relevant utterance if the disclosure was never made — in
   that FAIL case, pick the utterance index/timestamps closest to where it should have
   occurred, or utterance 0 if nothing at all is relevant).
"""
