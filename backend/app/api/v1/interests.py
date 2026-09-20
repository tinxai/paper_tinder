"""Suggested interests and the signed-in user's interest set."""

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.interest import (
    InterestResponse,
    UserInterestsResponse,
    UserInterestsUpdate,
)
from app.services import interests as interests_service

router = APIRouter(tags=["interests"])


@router.get(
    "/interests",
    response_model=UserInterestsResponse,
    summary="List selectable research interests",
)
async def list_interests(
    db: DbSession,
    suggested_only: bool = Query(default=False, description="Return only the curated suggestions."),
) -> UserInterestsResponse:
    rows = await interests_service.list_interests(db, suggested_only=suggested_only)
    return UserInterestsResponse(items=[InterestResponse.model_validate(r) for r in rows])


@router.get(
    "/users/me/interests",
    response_model=UserInterestsResponse,
    summary="Get the signed-in user's interests",
)
async def get_my_interests(user: CurrentUser, db: DbSession) -> UserInterestsResponse:
    rows = await interests_service.get_user_interests(db, user)
    return UserInterestsResponse(items=[InterestResponse.model_validate(r) for r in rows])


@router.put(
    "/users/me/interests",
    response_model=UserInterestsResponse,
    summary="Replace the signed-in user's interests",
)
async def set_my_interests(
    payload: UserInterestsUpdate, user: CurrentUser, db: DbSession
) -> UserInterestsResponse:
    rows = await interests_service.set_user_interests(db, user, payload.names)
    return UserInterestsResponse(items=[InterestResponse.model_validate(r) for r in rows])
