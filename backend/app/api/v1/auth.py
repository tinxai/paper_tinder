"""Registration, login, current user, account deletion."""

from fastapi import APIRouter, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.core.errors import ConflictError, UnauthorizedError
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User, UserInterest
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

# Deliberately identical for "unknown email" and "wrong password" so the
# endpoint cannot be used to enumerate registered accounts.
_GENERIC_LOGIN_FAILURE = "Incorrect email or password."


def _normalize_email(email: str) -> str:
    return email.strip().lower()


async def _user_response(db: DbSession, user: User) -> UserResponse:
    count = await db.scalar(
        select(func.count()).select_from(UserInterest).where(UserInterest.user_id == user.id)
    )
    return UserResponse(
        id=user.id,
        email=user.email,
        created_at=user.created_at,
        has_completed_onboarding=bool(count),
    )


def _token_response(user: User, user_payload: UserResponse) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id),
        expires_in=settings.access_token_expire_minutes * 60,
        user=user_payload,
    )


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account",
)
async def register(payload: RegisterRequest, db: DbSession) -> TokenResponse:
    email = _normalize_email(payload.email)

    existing = await db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise ConflictError("An account with that email already exists.")

    user = User(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as exc:
        # Race: another request registered the same email between check and commit.
        await db.rollback()
        raise ConflictError("An account with that email already exists.") from exc

    await db.refresh(user)
    return _token_response(user, await _user_response(db, user))


@router.post("/login", response_model=TokenResponse, summary="Sign in")
async def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    email = _normalize_email(payload.email)
    user = await db.scalar(select(User).where(User.email == email))

    if user is None or not verify_password(payload.password, user.password_hash):
        raise UnauthorizedError(_GENERIC_LOGIN_FAILURE)

    return _token_response(user, await _user_response(db, user))


@router.get("/me", response_model=UserResponse, summary="Get the signed-in user")
async def read_me(user: CurrentUser, db: DbSession) -> UserResponse:
    return await _user_response(db, user)


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Permanently delete the signed-in account",
)
async def delete_me(user: CurrentUser, db: DbSession) -> None:
    # ON DELETE CASCADE removes the user's swipes and interest links.
    # Cached `papers` rows are shared, non-personal metadata and are kept.
    await db.delete(user)
    await db.commit()
