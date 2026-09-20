"""SQLAlchemy models. Importing this package registers every table on Base.metadata."""

from app.models.interest import Interest, UserInterest
from app.models.paper import Paper
from app.models.swipe import Swipe, SwipeDirection
from app.models.user import User

__all__ = [
    "Interest",
    "Paper",
    "Swipe",
    "SwipeDirection",
    "User",
    "UserInterest",
]
