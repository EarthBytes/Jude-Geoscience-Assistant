from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Google AI Studio (Gemini). GOOGLE_API_KEY takes precedence over GEMINI_API_KEY.
    google_api_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_model_lite: str = "gemini-3.1-flash-lite"

    # Groq fallback
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    database_url: str = f"sqlite:///{DATA_DIR / 'jude.db'}"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    app_name: str = "Jude Geography Assistant"
    max_history_messages: int = 12

    @property
    def resolved_gemini_api_key(self) -> str:
        return (self.google_api_key or self.gemini_api_key).strip()

    @property
    def gemini_configured(self) -> bool:
        return bool(self.resolved_gemini_api_key)

    @property
    def groq_configured(self) -> bool:
        return bool(self.groq_api_key.strip())

    @property
    def llm_configured(self) -> bool:
        return self.gemini_configured or self.groq_configured

    @property
    def primary_model(self) -> Optional[str]:
        if self.gemini_configured:
            return self.gemini_model
        if self.groq_configured:
            return self.groq_model
        return None

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def sqlite_path(self) -> Path:
        # sqlite:///absolute/path or sqlite:///./relative
        raw = self.database_url
        if raw.startswith("sqlite:///"):
            path = Path(raw.replace("sqlite:///", "", 1))
            if not path.is_absolute():
                path = BASE_DIR / path
            return path
        return DATA_DIR / "jude.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
