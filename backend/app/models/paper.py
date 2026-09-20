from datetime import date

from sqlalchemy import Date, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Paper(Base, TimestampMixin):
    """Cached Semantic Scholar paper metadata.

    `authors` and `fields_of_study` are JSONB rather than normalized tables: for this
    MVP they are only ever read back whole and rendered on a card, never queried or
    joined on. Normalizing them would add two tables and two joins for no query we
    actually run. If v2 adds "papers by this author", promote `authors` to its own
    table then.
    """

    __tablename__ = "papers"

    # Semantic Scholar paper ID is the natural primary key.
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    abstract: Mapped[str | None] = mapped_column(Text, nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    publication_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    venue: Mapped[str | None] = mapped_column(Text, nullable=True)
    citation_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    paper_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{"authorId": "1234", "name": "Ada Lovelace"}, ...]
    authors: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    # ["Computer Science", "Linguistics"]
    fields_of_study: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
