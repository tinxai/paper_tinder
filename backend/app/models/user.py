import uuid

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    interests = relationship(
        "Interest",
        secondary="user_interests",
        back_populates="users",
        lazy="selectin",
    )
    swipes = relationship(
        "Swipe",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
