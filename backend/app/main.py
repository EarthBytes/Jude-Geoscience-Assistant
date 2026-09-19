from contextlib import asynccontextmanager
import logging
import uuid

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import get_settings
from app.database import init_db, ping_db
from app.routers import chat, conversations, memory


class RequestIdMiddleware:
    """Pure ASGI middleware so SSE chat streams are not buffered."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())
        for key, value in scope.get("headers", []):
            if key == b"x-request-id" and value:
                request_id = value.decode("latin-1")
                break

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
            await send(message)

        await self.app(scope, receive, send_with_request_id)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    docs_url = None if settings.is_production else "/docs"
    redoc_url = None if settings.is_production else "/redoc"
    openapi_url = None if settings.is_production else "/openapi.json"
    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
    )

    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(conversations.router)
    app.include_router(memory.router)
    app.include_router(chat.router)

    @app.get("/")
    def root():
        payload = {
            "app": settings.app_name,
            "status": "running",
            "health": "/api/health",
        }
        if not settings.is_production:
            payload["docs"] = "/docs"
        return payload

    @app.get("/api/health")
    def health():
        database_ok = ping_db()
        return {
            "status": "ok" if database_ok else "degraded",
            "app": settings.app_name,
            "database": "ok" if database_ok else "error",
            "llm_configured": settings.llm_configured,
            "providers": {
                "gemini": settings.gemini_configured,
                "groq": settings.groq_configured,
            },
            "model": settings.primary_model,
        }

    return app


app = create_app()
