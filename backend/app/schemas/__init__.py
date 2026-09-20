from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.schemas.common import Page
from app.schemas.interest import (
    InterestResponse,
    UserInterestsResponse,
    UserInterestsUpdate,
)
from app.schemas.paper import AuthorOut, PaperResponse, SavedPaperResponse
from app.schemas.swipe import SwipeCreate, SwipeResponse

__all__ = [
    "AuthorOut",
    "InterestResponse",
    "LoginRequest",
    "Page",
    "PaperResponse",
    "RegisterRequest",
    "SavedPaperResponse",
    "SwipeCreate",
    "SwipeResponse",
    "TokenResponse",
    "UserInterestsResponse",
    "UserInterestsUpdate",
    "UserResponse",
]
