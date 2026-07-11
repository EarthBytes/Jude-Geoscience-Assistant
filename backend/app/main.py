from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.routers import chat, conversations


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(conversations.router)
    app.include_router(chat.router)

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "app": settings.app_name,
            "llm_configured": settings.llm_configured,
            "providers": {
                "gemini": settings.gemini_configured,
                "groq": settings.groq_configured,
            },
            "model": settings.primary_model,
            "gemini_model": settings.gemini_model if settings.gemini_configured else None,
            "groq_model": settings.groq_model if settings.groq_configured else None,
        }

    return app


app = create_app()
