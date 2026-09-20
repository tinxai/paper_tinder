"""Paper persistence: upserting the Semantic Scholar cache into PostgreSQL."""

from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Paper
from app.services.semantic_scholar import NormalizedPaper


async def upsert_papers(db: AsyncSession, papers: list[NormalizedPaper]) -> None:
    """Insert-or-update paper metadata keyed on the Semantic Scholar ID.

    A single statement with ON CONFLICT DO UPDATE, so refreshing a 40-paper
    batch is one round trip and is safe under concurrent requests.
    """
    if not papers:
        return

    # De-duplicate within the batch: ON CONFLICT cannot touch the same row twice
    # in one statement.
    by_id = {paper.id: paper for paper in papers}
    rows = [paper.to_row() for paper in by_id.values()]

    stmt = pg_insert(Paper).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Paper.id],
        set_={
            "title": stmt.excluded.title,
            "abstract": stmt.excluded.abstract,
            "year": stmt.excluded.year,
            "publication_date": stmt.excluded.publication_date,
            "venue": stmt.excluded.venue,
            "citation_count": stmt.excluded.citation_count,
            "paper_url": stmt.excluded.paper_url,
            "pdf_url": stmt.excluded.pdf_url,
            "authors": stmt.excluded.authors,
            "fields_of_study": stmt.excluded.fields_of_study,
            "updated_at": stmt.excluded.updated_at,
        },
    )
    await db.execute(stmt)
    await db.flush()


async def get_paper(db: AsyncSession, paper_id: str) -> Paper | None:
    return await db.get(Paper, paper_id)
