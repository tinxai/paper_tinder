"""Recording and undoing swipes."""

from typing import Annotated

from fastapi import APIRouter, Path, status
from sqlalchemy import delete, select

from app.api.deps import CurrentUser, DbSession, ScholarClient
from app.core.errors import NotFoundError
from app.models import Paper, Swipe
from app.schemas.swipe import SwipeCreate, SwipeResponse
from app.services import papers as papers_service

router = APIRouter(prefix="/swipes", tags=["swipes"])


@router.post(
    "",
    response_model=SwipeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a swipe",
    description=(
        "Idempotent per (user, paper): swiping the same paper again updates the "
        "existing record's direction rather than failing, so a client retry after "
        "a dropped response is safe."
    ),
)
async def create_swipe(
    payload: SwipeCreate,
    user: CurrentUser,
    db: DbSession,
    client: ScholarClient,
) -> SwipeResponse:
    paper = await db.get(Paper, payload.paper_id)
    if paper is None:
        # The client may have a paper the cache lost (or a deep link). Fetch it
        # so the swipe's foreign key resolves.
        fetched = await client.get_paper(payload.paper_id)
        if fetched is None:
            raise NotFoundError("Paper not found.")
        await papers_service.upsert_papers(db, [fetched])

    existing = await db.scalar(
        select(Swipe).where(Swipe.user_id == user.id, Swipe.paper_id == payload.paper_id)
    )
    if existing is not None:
        existing.direction = payload.direction
        await db.commit()
        await db.refresh(existing)
        return SwipeResponse.model_validate(existing)

    swipe = Swipe(user_id=user.id, paper_id=payload.paper_id, direction=payload.direction)
    db.add(swipe)
    await db.commit()
    await db.refresh(swipe)
    return SwipeResponse.model_validate(swipe)


@router.delete(
    "/{paper_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Undo a swipe",
    description="Removes the paper from Saved and makes it eligible for the feed again.",
)
async def delete_swipe(
    paper_id: Annotated[str, Path(min_length=1, max_length=64)],
    user: CurrentUser,
    db: DbSession,
) -> None:
    result = await db.execute(
        delete(Swipe).where(Swipe.user_id == user.id, Swipe.paper_id == paper_id)
    )
    if result.rowcount == 0:
        raise NotFoundError("No swipe found for that paper.")
    await db.commit()
