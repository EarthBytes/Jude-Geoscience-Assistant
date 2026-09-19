from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Generator, Optional

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.models import Base

_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker[Session]] = None
_engine_url: Optional[str] = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sqlalchemy_url(raw: str) -> str:
    if raw.startswith("postgres://"):
        return raw.replace("postgres://", "postgresql+psycopg://", 1)
    if raw.startswith("postgresql://") and "+psycopg" not in raw:
        return raw.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw


def _apply_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.execute("PRAGMA journal_mode = WAL")
    cursor.execute("PRAGMA busy_timeout = 5000")
    cursor.close()


def configure_database(force: bool = False) -> Engine:
    global _engine, _SessionLocal, _engine_url
    url = sqlalchemy_url(get_settings().database_url)
    if _engine is not None and _engine_url == url and not force:
        return _engine
    if _engine is not None:
        _engine.dispose()

    kwargs: dict = {"future": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        kwargs["pool_pre_ping"] = True
        kwargs["pool_size"] = 5

    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        event.listen(engine, "connect", _apply_sqlite_pragmas)

    Base.metadata.create_all(engine)
    _engine = engine
    _engine_url = url
    _SessionLocal = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, future=True
    )
    return engine


def init_db() -> None:
    configure_database(force=True)


def ping_db() -> bool:
    try:
        engine = configure_database()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


@contextmanager
def db_session() -> Generator[Session, None, None]:
    if _SessionLocal is None:
        configure_database()
    assert _SessionLocal is not None
    session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
