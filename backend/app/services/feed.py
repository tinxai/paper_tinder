"""Discovery-feed assembly.

Pipeline (v1 — deterministic, no embeddings, no LLM):

    1. Read the user's interests.
    2. Search Semantic Scholar once per interest (bounded, concurrent).
    3. Merge + de-duplicate the results.
    4. Upsert the metadata into PostgreSQL so detail/saved views never
       depend on the upstream being reachable.
    5. Drop every paper this user has already swiped on.
    6. Rank the remainder (app.services.ranking).
    7. Return an offset-paginated slice.

Failure policy, in order of preference:

  * Some interest queries succeeded -> serve what we got. One flaky query must
    not blank the feed.
  * Every query failed, but PostgreSQL has cached papers matching this user's
    interests -> serve those, flagged `source="cache"`. This matters in
    practice: the *unauthenticated* Semantic Scholar endpoint is rate-limited
    to roughly one request per second across all anonymous callers, so a 429
    is a normal condition, not an outage. Falling back to the cache keeps the
    app usable without an API key.
  * Every query failed and the cache has nothing to offer -> raise, so the app
    can show its retry state.
"""

from __future__ import annotations

import asyncio
import logging
from enum import StrEnum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError, ExternalServiceError
from app.models import Interest, Paper, Swipe, User, UserInterest
from app.services.papers import upsert_papers
from app.services.ranking import ScoredPaper, rank_papers
from app.services.semantic_scholar import NormalizedPaper, SemanticScholarClient

logger = logging.getLogger(__name__)

# Cap on interests queried per feed request, so a user with 25 interests does
# not fan out 25 upstream calls on every page load.
MAX_INTERESTS_PER_REQUEST = 5

# Upstream searches run concurrently but bounded, to stay well inside the
# public rate limit and avoid a retry storm.
_CONCURRENCY = 2

# How many cached papers to consider when falling back to PostgreSQL.
CACHE_FALLBACK_POOL = 500


class FeedSource(StrEnum):
    LIVE = "live"  # fresh from Semantic Scholar
    CACHE = "cache"  # upstream unavailable; served from the local cache


async def get_user_interest_names(db: AsyncSession, user: User) -> list[str]:
    result = await db.execute(
        select(Interest.name)
        .join(UserInterest, UserInterest.interest_id == Interest.id)
        .where(UserInterest.user_id == user.id)
        .order_by(Interest.name)
    )
    return list(result.scalars().all())


async def get_swiped_paper_ids(db: AsyncSession, user: User) -> set[str]:
    result = await db.execute(select(Swipe.paper_id).where(Swipe.user_id == user.id))
    return set(result.scalars().all())


async def _search_one(
    client: SemanticScholarClient,
    interest: str,
    limit: int,
    semaphore: asyncio.Semaphore,
) -> list[NormalizedPaper]:
    async with semaphore:
        return await client.search_papers(interest, limit=limit)


async def fetch_candidates(
    client: SemanticScholarClient,
    interests: list[str],
    limit_per_interest: int,
) -> tuple[list[NormalizedPaper], int, BaseException | None]:
    """Fan out one search per interest.

    Returns (deduped papers, failure count, first error). The error is kept so
    the caller can surface a *specific* cause — a rate limit should reach the
    client as `upstream_rate_limited`, not a generic outage.
    """
    if not interests:
        return [], 0, None

    semaphore = asyncio.Semaphore(_CONCURRENCY)
    results = await asyncio.gather(
        *(_search_one(client, i, limit_per_interest, semaphore) for i in interests),
        return_exceptions=True,
    )

    merged: dict[str, NormalizedPaper] = {}
    failures = 0
    first_error: BaseException | None = None
    for interest, result in zip(interests, results, strict=True):
        if isinstance(result, BaseException):
            failures += 1
            if first_error is None:
                first_error = result
            logger.warning("Feed search failed for interest %r: %s", interest, result)
            continue
        for paper in result:
            # First occurrence wins; identical IDs across queries are the same paper.
            merged.setdefault(paper.id, paper)

    return list(merged.values()), failures, first_error


def _row_to_normalized(row: Paper) -> NormalizedPaper:
    """Adapt a cached DB row back into the shape the ranker expects."""
    return NormalizedPaper(
        id=row.id,
        title=row.title,
        abstract=row.abstract,
        year=row.year,
        publication_date=row.publication_date,
        venue=row.venue,
        citation_count=row.citation_count,
        paper_url=row.paper_url,
        pdf_url=row.pdf_url,
        authors=list(row.authors or []),
        fields_of_study=list(row.fields_of_study or []),
    )


async def load_cached_candidates(
    db: AsyncSession, user: User, pool_size: int = CACHE_FALLBACK_POOL
) -> list[NormalizedPaper]:
    """Papers already in PostgreSQL that this user has not swiped on.

    Ordered by citation count so the pool skews toward papers worth showing;
    the ranker then re-sorts by interest match. Zero-match papers are filtered
    out by the caller, so an unrelated cached paper never reaches the user.
    """
    swiped = select(Swipe.paper_id).where(Swipe.user_id == user.id)
    result = await db.execute(
        select(Paper)
        .where(Paper.id.not_in(swiped))
        .order_by(Paper.citation_count.desc(), Paper.id)
        .limit(pool_size)
    )
    return [_row_to_normalized(row) for row in result.scalars().all()]


async def build_feed(
    db: AsyncSession,
    user: User,
    client: SemanticScholarClient,
    limit: int,
    offset: int,
) -> tuple[list[ScoredPaper], bool, FeedSource]:
    """Return (page of ranked papers, has_more, where the papers came from)."""
    interests = await get_user_interest_names(db, user)
    if not interests:
        # No interests yet — onboarding is incomplete. An empty feed, not an error.
        return [], False, FeedSource.LIVE

    queried = interests[:MAX_INTERESTS_PER_REQUEST]
    candidates, failures, first_error = await fetch_candidates(
        client, queried, settings.semantic_scholar_batch_limit
    )

    source = FeedSource.LIVE
    upstream_failed_entirely = failures == len(queried)

    if candidates:
        # Cache metadata before filtering: a paper the user swipes on must exist
        # in `papers` for the swipe's foreign key, and saved papers must render
        # without the upstream.
        await upsert_papers(db, candidates)
        await db.commit()
    elif upstream_failed_entirely:
        source = FeedSource.CACHE
        candidates = await load_cached_candidates(db, user)
        if not candidates:
            # Nothing live, nothing cached — the app should show Retry.
            # Re-raise the original error when it is one of ours, so a rate
            # limit stays distinguishable from a plain outage.
            if isinstance(first_error, AppError):
                raise first_error
            raise ExternalServiceError(
                "Could not load papers right now. Please check your connection and try again."
            ) from first_error
    else:
        # Upstream answered, it just had nothing. A genuinely empty feed.
        return [], False, source

    already_swiped = await get_swiped_paper_ids(db, user)
    fresh = [p for p in candidates if p.id not in already_swiped]

    ranked = rank_papers(fresh, interests)

    if source is FeedSource.CACHE:
        # The cache pool is not interest-filtered in SQL, so drop anything the
        # ranker found no interest overlap for rather than showing noise.
        ranked = [s for s in ranked if s.interest_match > 0]

    page = ranked[offset : offset + limit]
    has_more = len(ranked) > offset + limit
    return page, has_more, source
