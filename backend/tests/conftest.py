"""Shared pytest fixtures.

Tests run against a real PostgreSQL database (`paperswipe_test`) because the
schema uses Postgres-specific types — JSONB, UUID, ENUM — that SQLite cannot
model faithfully. `docker compose up -d db` creates that database for you.

Every test gets a clean schema: tables are created once per session and
truncated between tests, which is much faster than re-running migrations.

Semantic Scholar is ALWAYS mocked. No test touches the live API.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncGenerator
from typing import Any

import pytest

# Settings are cached at import time, so the environment must be set first.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://paperswipe:paperswipe@localhost:5432/paperswipe_test",
)
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-used-in-production")
os.environ.setdefault("ENVIRONMENT", "test")

import httpx  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool  # noqa: E402

import app.models  # noqa: F401,E402  (registers tables on Base.metadata)
from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.services.interests import seed_suggested_interests  # noqa: E402
from app.services.semantic_scholar import (  # noqa: E402
    SemanticScholarClient,
    get_semantic_scholar_client,
)

TEST_DATABASE_URL = settings.database_url


async def _recreate_schema() -> None:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    finally:
        await engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def database_schema() -> None:
    """Build the test schema once, in its own event loop.

    Deliberately a *sync* fixture running `asyncio.run`: pytest-asyncio gives
    every test its own event loop, and an asyncpg connection cannot be shared
    across loops. Doing setup in a throwaway loop keeps the two apart.
    """
    asyncio.run(_recreate_schema())


@pytest.fixture
async def engine(database_schema) -> AsyncGenerator[AsyncEngine, None]:
    """A per-test engine bound to this test's event loop.

    NullPool: connections are never reused across tests, so no pooled asyncpg
    connection can leak into a different loop.
    """
    eng = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    yield eng
    await eng.dispose()


@pytest.fixture
async def db(engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """A session against a freshly truncated database."""
    table_names = ", ".join(f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables))
    async with engine.begin() as conn:
        # RESTART IDENTITY so interest IDs are predictable across tests.
        await conn.execute(text(f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"))

    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


class FakeScholarClient(SemanticScholarClient):
    """Stand-in for the real client.

    `search_results` maps a query substring -> raw upstream records. `error` (if
    set) is raised by every call, to exercise the failure paths.
    """

    def __init__(
        self,
        search_results: list[dict[str, Any]] | None = None,
        detail_result: dict[str, Any] | None = None,
        error: Exception | None = None,
    ) -> None:
        super().__init__()
        self.raw_search_results = search_results if search_results is not None else []
        self.raw_detail_result = detail_result
        self.error = error
        self.search_calls: list[str] = []
        self.detail_calls: list[str] = []

    async def search_papers(self, query: str, limit: int = 20, offset: int = 0):
        self.search_calls.append(query)
        if self.error is not None:
            raise self.error
        from app.services.semantic_scholar import normalize_paper

        out = []
        seen = set()
        for raw in self.raw_search_results:
            normalized = normalize_paper(raw)
            if normalized is None or normalized.id in seen:
                continue
            seen.add(normalized.id)
            out.append(normalized)
        return out[:limit]

    async def get_paper(self, paper_id: str):
        self.detail_calls.append(paper_id)
        if self.error is not None:
            raise self.error
        from app.services.semantic_scholar import normalize_paper

        if self.raw_detail_result is not None:
            return normalize_paper(self.raw_detail_result)
        for raw in self.raw_search_results:
            if isinstance(raw, dict) and raw.get("paperId") == paper_id:
                return normalize_paper(raw)
        return None


@pytest.fixture
def scholar() -> FakeScholarClient:
    return FakeScholarClient()


@pytest.fixture
async def client(db: AsyncSession, scholar: FakeScholarClient) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client bound to the app, with DB + Semantic Scholar overridden."""

    async def _get_db():
        yield db

    def _get_scholar():
        return scholar

    fastapi_app.dependency_overrides[get_db] = _get_db
    fastapi_app.dependency_overrides[get_semantic_scholar_client] = _get_scholar

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    fastapi_app.dependency_overrides.clear()


# --- Convenience helpers -------------------------------------------------


@pytest.fixture
async def seeded_interests(db: AsyncSession) -> int:
    return await seed_suggested_interests(db)


async def register_user(
    client: AsyncClient, email: str = "researcher@example.com", password: str = "sup3rsecret!"
) -> dict:
    response = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": password}
    )
    assert response.status_code == 201, response.text
    return response.json()


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def auth_client(client: AsyncClient) -> AsyncClient:
    """A client already authenticated as a fresh user."""
    data = await register_user(client)
    client.headers.update(auth_headers(data["access_token"]))
    return client


def make_raw_paper(**overrides: Any) -> dict[str, Any]:
    """A well-formed upstream record; override any field per test."""
    raw: dict[str, Any] = {
        "paperId": "paper-001",
        "title": "Attention Is All You Need",
        "abstract": "We propose the Transformer, a model architecture based on attention.",
        "authors": [{"authorId": "1", "name": "Ashish Vaswani"}],
        "year": 2017,
        "publicationDate": "2017-06-12",
        "venue": "NeurIPS",
        "citationCount": 100000,
        "url": "https://www.semanticscholar.org/paper/paper-001",
        "openAccessPdf": {"url": "https://arxiv.org/pdf/1706.03762.pdf"},
        "fieldsOfStudy": ["Computer Science"],
    }
    raw.update(overrides)
    return raw


@pytest.fixture
def raw_paper_factory():
    return make_raw_paper


@pytest.fixture
def mock_transport():
    """Build an httpx client backed by a caller-supplied handler."""

    def _build(handler):
        return httpx.AsyncClient(transport=httpx.MockTransport(handler))

    return _build
