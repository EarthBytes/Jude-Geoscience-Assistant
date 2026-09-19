from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List, Optional
import base64

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(BASE_DIR / ".env"), str(BASE_DIR / ".env.clerk")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = "development"

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
    max_history_messages: int = 32
    llm_timeout_seconds: float = 60.0

    rate_limit_enabled: bool = True
    guest_chat_per_minute: int = 8
    member_chat_per_minute: int = 30

    clerk_issuer: str = ""
    clerk_jwks_url: str = ""
    clerk_audience: str = ""
    clerk_authorized_parties: str = ""
    clerk_publishable_key: str = ""
    clerk_secret_key: str = ""

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

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
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def clerk_authorized_party_list(self) -> List[str]:
        return [
            party.strip()
            for party in self.clerk_authorized_parties.split(",")
            if party.strip()
        ]

    @property
    def resolved_clerk_issuer(self) -> str:
        if self.clerk_issuer.strip():
            return self.clerk_issuer.strip().rstrip("/")
        frontend_api = self._frontend_api_from_publishable_key()
        return f"https://{frontend_api}" if frontend_api else ""

    @property
    def resolved_clerk_jwks_url(self) -> str:
        if self.clerk_jwks_url.strip():
            return self.clerk_jwks_url.strip()
        issuer = self.resolved_clerk_issuer
        return f"{issuer}/.well-known/jwks.json" if issuer else ""

    def _frontend_api_from_publishable_key(self) -> str:
        key = self.clerk_publishable_key.strip()
        if not key or "_" not in key:
            return ""
        payload = key.split("_", 2)[-1]
        padded = payload + "=" * ((4 - len(payload) % 4) % 4)
        try:
            decoded = base64.urlsafe_b64decode(padded).decode("utf-8")
        except Exception:  # noqa: BLE001
            return ""
        return decoded.split("$", 1)[0].strip()

    @property
    def sqlite_path(self) -> Path:
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
