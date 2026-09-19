import os
from functools import lru_cache

from pydantic_settings import BaseSettings

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://cimet:cimet@localhost:5432/cimet_qa"
    ANTHROPIC_API_KEY: str = ""
    DEEPGRAM_API_KEY: str = ""
    UPLOAD_DIR: str = os.path.join(_BACKEND_DIR, "uploads")
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001"]
    CONFIDENCE_THRESHOLD: float = 0.70
    RANDOM_SAMPLE_RATE: float = 0.05

    # LLM provider: "gateway" (free, default) or "anthropic" (paid, better quality)
    LLM_PROVIDER: str = "gateway"

    # Anthropic settings
    CLAUDE_MODEL: str = "claude-sonnet-4-20250514"

    # LLM Gateway settings (Salesforce)
    LLM_GATEWAY_URL: str = ""
    LLM_GATEWAY_API_KEY: str = ""
    LLM_GATEWAY_MODEL: str = "llmgateway__GPT4Omni_11_20"
    LLM_GATEWAY_API_VERSION: str = "v1.0"
    LLM_GATEWAY_SFDC_CORE_TENANT_ID: str = ""

    model_config = {"env_file": os.path.join(_BACKEND_DIR, ".env"), "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
