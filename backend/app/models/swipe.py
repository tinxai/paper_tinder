import enum
import uuid

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class SwipeDirection(enum.StrEnum):
    LEFT = "left"  # dismissed
    RIGHT = "right"  # saved


class Swipe(Base, TimestampMixin):
    __tablename__ = "swipes"
    __table_args__ = (
        UniqueConstraint("user_id", "paper_id", name="uq_swipe_user_paper"),
        # Saved-papers listing: "this user's right swipes, newest first".
        Index("ix_swipes_user_direction_created", "user_id", "direction", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    paper_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    direction: Mapped[SwipeDirection] = mapped_column(
        SAEnum(
            SwipeDirection,
            name="swipe_direction",
            # Store the lowercase values ("left"/"right"), not the member names.
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
        ),
        nullable=False,
    )

    user = relationship("User", back_populates="swipes")
    paper = relationship("Paper", lazy="joined")
