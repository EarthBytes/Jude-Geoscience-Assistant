from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app


@pytest.fixture(autouse=True)
def reset_sse_starlette_appstatus_event() -> None:
    """Recreate sse-starlette's loop-bound exit event for each test client loop.

    sse-starlette keeps a module-level ``AppStatus.should_exit_event``. Starlette's
    ``TestClient`` creates a fresh event loop per request context, so leaving the
    Event bound to a previous loop raises RuntimeError on later streaming tests.
    """
    from sse_starlette.sse import AppStatus

    AppStatus.should_exit_event = None


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("GOOGLE_API_KEY", "")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("GROQ_API_KEY", "")
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        yield test_client
    get_settings.cache_clear()
