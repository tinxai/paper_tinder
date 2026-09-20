"""Shared FastAPI dependencies: DB session, current user, pagination."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import UnauthorizedError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User
from app.services.semantic_scholar import SemanticScholarClient, get_semantic_scholar_client

# auto_error=False so a missing header raises our own JSON error shape,
# not Starlette's default {"detail": ...}.
bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError("Not authenticated.")

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise UnauthorizedError("Your session has expired. Please sign in again.")

    subject = payload.get("sub")
    try:
        user_id = UUID(str(subject))
    except (TypeError, ValueError) as exc:
        raise UnauthorizedError("Invalid authentication token.") from exc

    user = await db.get(User, user_id)
    if user is None:
        # Token is valid but the account was deleted.
        raise UnauthorizedError("Your session has expired. Please sign in again.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
ScholarClient = Annotated[SemanticScholarClient, Depends(get_semantic_scholar_client)]


class Pagination:
    def __init__(
        self,
        limit: Annotated[int, Query(ge=1, le=100)] = settings.feed_default_page_size,
        offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
    ) -> None:
        self.limit = min(limit, settings.feed_max_page_size)
        self.offset = offset


PageParams = Annotated[Pagination, Depends(Pagination)]
