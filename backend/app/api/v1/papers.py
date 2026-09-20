"""Discovery feed, paper detail, and saved papers."""

from typing import Annotated, Literal

from fastapi import APIRouter, Path, Query
from sqlalchemy import Text, func, or_, select

from app.api.deps import CurrentUser, DbSession, PageParams, ScholarClient
from app.core.errors import NotFoundError
from app.models import Paper, Swipe, SwipeDirection
from app.schemas.common import Page
from app.schemas.paper import (
    FeedPage,
    FeedPaperResponse,
    PaperResponse,
    SavedPaperResponse,
)
from app.services import papers as papers_service
from app.services.feed import build_feed

router = APIRouter(prefix="/papers", tags=["papers"])


def _paper_fields(paper: Paper) -> dict:
    return {
        "id": paper.id,
        "title": paper.title,
        "abstract": paper.abstract,
        "year": paper.year,
        "publication_date": paper.publication_date,
        "venue": paper.venue,
        "citation_count": paper.citation_count,
        "paper_url": paper.paper_url,
        "pdf_url": paper.pdf_url,
        "authors": paper.authors or [],
        "fields_of_study": paper.fields_of_study or [],
    }


@router.get(
    "/feed",
    response_model=FeedPage,
    summary="Ranked discovery feed",
    description=(
        "Papers matching the user's interests, ranked by interest match, recency "
        "and log-scaled citation count. Papers the user has already swiped on are "
        'never returned. `source` is "cache" when Semantic Scholar was '
        "unreachable and the results came from the local cache."
    ),
)
async def get_feed(
    user: CurrentUser,
    db: DbSession,
    client: ScholarClient,
    page: PageParams,
) -> FeedPage:
    scored, has_more, source = await build_feed(
        db, user, client, limit=page.limit, offset=page.offset
    )

    items = [
        FeedPaperResponse(
            **s.paper.to_row(),
            score=s.score,
            matched_interests=s.matched_interests,
        )
        for s in scored
    ]
    return FeedPage(
        items=items,
        # Null: the upstream result set is not fully enumerable, so a true
        # total would be a lie. The client uses `has_more` instead.
        total=None,
        limit=page.limit,
        offset=page.offset,
        has_more=has_more,
        source=source,
    )


@router.get(
    "/saved",
    response_model=Page[SavedPaperResponse],
    summary="Papers the user swiped right on",
)
async def get_saved_papers(
    user: CurrentUser,
    db: DbSession,
    page: PageParams,
    q: Annotated[str | None, Query(max_length=200, description="Search title or author")] = None,
    year: Annotated[int | None, Query(ge=1400, le=2200)] = None,
    sort: Annotated[
        Literal["newest", "oldest", "citations"],
        Query(description="newest/oldest = when saved; citations = most cited first"),
    ] = "newest",
) -> Page[SavedPaperResponse]:
    base = (
        select(Paper, Swipe.created_at.label("saved_at"))
        .join(Swipe, Swipe.paper_id == Paper.id)
        .where(Swipe.user_id == user.id, Swipe.direction == SwipeDirection.RIGHT)
    )

    if q:
        term = f"%{q.strip()}%"
        # Parameterized via SQLAlchemy — no string interpolation into SQL.
        # `authors` is JSONB; cast to text so a plain ILIKE covers author names.
        base = base.where(
            or_(
                Paper.title.ilike(term),
                Paper.authors.cast(Text).ilike(term),
            )
        )
    if year is not None:
        base = base.where(Paper.year == year)

    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0

    order = {
        "newest": Swipe.created_at.desc(),
        "oldest": Swipe.created_at.asc(),
        "citations": Paper.citation_count.desc(),
    }[sort]
    # Secondary key keeps pagination stable when the primary key ties.
    stmt = base.order_by(order, Paper.id).limit(page.limit).offset(page.offset)

    result = await db.execute(stmt)
    items = [
        SavedPaperResponse(**_paper_fields(paper), saved_at=saved_at)
        for paper, saved_at in result.all()
    ]

    return Page(
        items=items,
        total=total,
        limit=page.limit,
        offset=page.offset,
        has_more=page.offset + len(items) < total,
    )


@router.get(
    "/{paper_id}",
    response_model=PaperResponse,
    summary="Paper detail",
    description="Served from the local cache; falls back to Semantic Scholar on a miss.",
)
async def get_paper(
    paper_id: Annotated[str, Path(min_length=1, max_length=64)],
    user: CurrentUser,
    db: DbSession,
    client: ScholarClient,
) -> PaperResponse:
    paper = await papers_service.get_paper(db, paper_id)
    if paper is not None:
        return PaperResponse(**_paper_fields(paper))

    # Not cached yet (e.g. a deep link). Fetch once and cache it.
    fetched = await client.get_paper(paper_id)
    if fetched is None:
        raise NotFoundError("Paper not found.")

    await papers_service.upsert_papers(db, [fetched])
    await db.commit()
    return PaperResponse(**fetched.to_row())
