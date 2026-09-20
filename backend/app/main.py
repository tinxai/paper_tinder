"""FastAPI application entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.db.session import SessionLocal, engine

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.environment == "production" and settings.secret_key.startswith("dev-insecure"):
        raise RuntimeError(
            "SECRET_KEY is still the development default. Set a real SECRET_KEY "
            "before running in production."
        )
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "Backend for PaperSwipe — swipe through academic papers matched to your "
        "research interests. Paper metadata comes from the Semantic Scholar "
        "Academic Graph API."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Origins are environment-controlled; the default "*" is for local development only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=settings.cors_origins.strip() != "*",
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

register_exception_handlers(app)
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/health", tags=["meta"], summary="Liveness + database check")
async def health() -> dict:
    database_ok = True
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Health check: database unreachable")
        database_ok = False

    return {
        "status": "ok" if database_ok else "degraded",
        "environment": settings.environment,
        "database": "ok" if database_ok else "unavailable",
        "version": "0.1.0",
    }


@app.get("/", tags=["meta"], include_in_schema=False)
async def root() -> dict:
    return {"name": settings.app_name, "docs": "/docs", "health": "/health"}
