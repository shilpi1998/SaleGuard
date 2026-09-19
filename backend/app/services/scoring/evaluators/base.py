import json
import time
from abc import ABC, abstractmethod
from typing import Any

import requests

from app.config import get_settings
from app.models.models import CheckLibrary, Lead

TOOL_NAME = "record_check_result"

TOOL_PROPERTIES = {
    "result": {
        "type": "string",
        "enum": ["PASS", "FAIL", "NOTE"],
        "description": (
            "PASS if the check was satisfied, FAIL if it was clearly not "
            "satisfied, NOTE if the evidence is ambiguous, partial, or "
            "requires human judgement."
        ),
    },
    "confidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": (
            "Your confidence in this determination, from 0 (pure guess) to "
            "1 (certain), based on how clear and unambiguous the transcript "
            "evidence is."
        ),
    },
    "evidence_text": {
        "type": "string",
        "description": (
            "The exact verbatim quote(s) from the transcript that support "
            "your determination. Quote the transcript text exactly as written."
        ),
    },
    "transcript_utterance_index": {
        "type": "integer",
        "description": (
            "The `index` value of the single utterance in the transcript that "
            "contains the strongest/primary evidence for this determination."
        ),
    },
    "audio_timestamp_start": {
        "type": "number",
        "description": "The `start` timestamp (seconds) of that utterance.",
    },
    "audio_timestamp_end": {
        "type": "number",
        "description": "The `end` timestamp (seconds) of that utterance.",
    },
    "reasoning": {
        "type": "string",
        "description": (
            "A concise explanation of why you reached this result, referencing "
            "the specific evaluation criteria for this check."
        ),
    },
}

TOOL_REQUIRED = [
    "result",
    "confidence",
    "evidence_text",
    "transcript_utterance_index",
    "audio_timestamp_start",
    "audio_timestamp_end",
    "reasoning",
]

# Anthropic tool_use format
ANTHROPIC_TOOL = {
    "name": TOOL_NAME,
    "description": (
        "Record the outcome of evaluating a single QA check against a sales call "
        "transcript. You must always call this tool exactly once with your final "
        "determination — do not respond with plain text."
    ),
    "input_schema": {
        "type": "object",
        "properties": TOOL_PROPERTIES,
        "required": TOOL_REQUIRED,
    },
}

# OpenAI / Gateway function calling format
GATEWAY_TOOL = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "Record the outcome of evaluating a single QA check against a sales call "
            "transcript. You must always call this function exactly once with your final "
            "determination — do not respond with plain text."
        ),
        "parameters": {
            "type": "object",
            "properties": TOOL_PROPERTIES,
            "required": TOOL_REQUIRED,
        },
    },
}


class BaseEvaluator(ABC):

    def __init__(self) -> None:
        self._anthropic_client = None

    @property
    def anthropic_client(self):
        if self._anthropic_client is None:
            import anthropic
            self._anthropic_client = anthropic.Anthropic()
        return self._anthropic_client

    @abstractmethod
    def build_system_prompt(self, check: CheckLibrary, lead: Lead) -> str:
        raise NotImplementedError

    @abstractmethod
    def build_user_prompt(self, check: CheckLibrary, lead: Lead, transcript: list[dict]) -> str:
        raise NotImplementedError

    def evaluate(self, check: CheckLibrary, lead: Lead, transcript: list[dict]) -> dict[str, Any]:
        settings = get_settings()
        if settings.LLM_PROVIDER == "anthropic":
            return self._evaluate_anthropic(check, lead, transcript)
        return self._evaluate_gateway(check, lead, transcript)

    def _evaluate_anthropic(self, check: CheckLibrary, lead: Lead, transcript: list[dict]) -> dict[str, Any]:
        settings = get_settings()
        system_prompt = self.build_system_prompt(check, lead)
        user_prompt = self.build_user_prompt(check, lead, transcript)

        start = time.time()
        response = self.anthropic_client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=2048,
            system=system_prompt,
            tools=[ANTHROPIC_TOOL],
            tool_choice={"type": "tool", "name": TOOL_NAME},
            messages=[{"role": "user", "content": user_prompt}],
        )
        latency_ms = int((time.time() - start) * 1000)

        tool_use_block = next(
            (block for block in response.content if block.type == "tool_use"),
            None,
        )
        if tool_use_block is None:
            raise ValueError(
                f"Claude did not return a tool_use block for check {check.code!r}; "
                f"stop_reason={response.stop_reason!r}"
            )

        tool_input = tool_use_block.input

        return {
            "result": tool_input["result"],
            "confidence": float(tool_input["confidence"]),
            "evidence_text": tool_input["evidence_text"],
            "transcript_utterance_index": int(tool_input["transcript_utterance_index"]),
            "audio_timestamp_start": float(tool_input["audio_timestamp_start"]),
            "audio_timestamp_end": float(tool_input["audio_timestamp_end"]),
            "reasoning": tool_input["reasoning"],
            "raw_llm_response": {
                "id": response.id,
                "model": response.model,
                "stop_reason": response.stop_reason,
                "tool_input": tool_input,
            },
            "model_used": response.model,
            "prompt_tokens": response.usage.input_tokens,
            "completion_tokens": response.usage.output_tokens,
            "latency_ms": latency_ms,
        }

    def _evaluate_gateway(self, check: CheckLibrary, lead: Lead, transcript: list[dict]) -> dict[str, Any]:
        settings = get_settings()
        system_prompt = self.build_system_prompt(check, lead)
        user_prompt = self.build_user_prompt(check, lead, transcript)

        url = f"{settings.LLM_GATEWAY_URL}/{settings.LLM_GATEWAY_API_VERSION}/chat/generations"
        headers = {
            "authorization": f"API_KEY {settings.LLM_GATEWAY_API_KEY}",
            "x-sfdc-core-tenant-id": settings.LLM_GATEWAY_SFDC_CORE_TENANT_ID,
            "x-client-feature-id": "plannerservice",
            "content-type": "application/json",
        }

        body = {
            "model": settings.LLM_GATEWAY_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "generation_settings": {
                "num_generations": 1,
                "max_tokens": 2048,
                "temperature": 0,
            },
            "tools": [GATEWAY_TOOL],
            "tool_choice": {"type": "function", "function": {"name": TOOL_NAME}},
            "enable_pii_masking": False,
            "enable_input_safety_scoring": False,
            "enable_output_safety_scoring": False,
            "tags": {},
        }

        start = time.time()
        resp = requests.post(url, json=body, headers=headers, verify=False, timeout=90)
        resp.raise_for_status()
        latency_ms = int((time.time() - start) * 1000)

        event = resp.json()
        generation = event["generation_details"]["generations"][0]

        tool_invocations = generation.get("tool_invocations", [])
        if not tool_invocations:
            raise ValueError(
                f"Gateway did not return a function call for check {check.code!r}; "
                f"content={generation.get('content', '')!r}"
            )

        arguments_str = tool_invocations[0]["function"]["arguments"]
        tool_input = json.loads(arguments_str)

        usage = event.get("generation_details", {}).get("parameters", {}).get("usage", {})
        model_used = event.get("generation_details", {}).get("parameters", {}).get("model", settings.LLM_GATEWAY_MODEL)

        return {
            "result": tool_input["result"],
            "confidence": float(tool_input["confidence"]),
            "evidence_text": tool_input["evidence_text"],
            "transcript_utterance_index": int(tool_input["transcript_utterance_index"]),
            "audio_timestamp_start": float(tool_input["audio_timestamp_start"]),
            "audio_timestamp_end": float(tool_input["audio_timestamp_end"]),
            "reasoning": tool_input["reasoning"],
            "raw_llm_response": {
                "id": event.get("id"),
                "model": model_used,
                "tool_input": tool_input,
            },
            "model_used": model_used,
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "latency_ms": latency_ms,
        }

    @staticmethod
    def format_transcript(utterances: list[dict]) -> str:
        lines = []
        for utt in utterances:
            index = utt.get("index")
            start = utt.get("start")
            end = utt.get("end")
            speaker_label = utt.get("speaker_label") or f"Speaker {utt.get('speaker')}"
            text = utt.get("text", "")
            lines.append(f"[{index}] [{start:.2f}-{end:.2f}] {speaker_label}: {text}")
        return "\n".join(lines)
