import uuid

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


def normalize_interest(name: str) -> str:
    """Case/whitespace-insensitive key so 'Computer Vision' == 'computer  vision'."""
    return " ".join(name.strip().lower().split())


class Interest(Base, TimestampMixin):
    __tablename__ = "interests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Display form, e.g. "Human-Computer Interaction".
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Lookup form, e.g. "human-computer interaction".
    normalized_name: Mapped[str] = mapped_column(
        String(120), unique=True, index=True, nullable=False
    )
    # Suggested interests are seeded; user-created ones are not.
    is_suggested: Mapped[bool] = mapped_column(default=False, nullable=False)

    users = relationship("User", secondary="user_interests", back_populates="interests")


class UserInterest(Base):
    __tablename__ = "user_interests"
    __table_args__ = (UniqueConstraint("user_id", "interest_id", name="uq_user_interest"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    interest_id: Mapped[int] = mapped_column(
        ForeignKey("interests.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
