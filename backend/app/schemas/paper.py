from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Page


class AuthorOut(BaseModel):
    author_id: str | None = None
    name: str


class PaperResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    abstract: str | None = None
    year: int | None = None
    publication_date: date | None = None
    venue: str | None = None
    citation_count: int = 0
    paper_url: str | None = None
    pdf_url: str | None = None
    authors: list[AuthorOut] = Field(default_factory=list)
    fields_of_study: list[str] = Field(default_factory=list)

    @property
    def has_pdf(self) -> bool:
        return bool(self.pdf_url)


class FeedPaperResponse(PaperResponse):
    """A feed card, with the ranking score exposed for debugging/explainability."""

    score: float | None = None
    matched_interests: list[str] = Field(default_factory=list)


class SavedPaperResponse(PaperResponse):
    saved_at: datetime


class FeedPage(Page[FeedPaperResponse]):
    """Feed page, annotated with where its papers came from.

    `source == "cache"` means Semantic Scholar was unreachable (most often
    rate-limited) and these results came from the local PostgreSQL cache. The
    app surfaces that so a stale feed is never passed off as a fresh one.
    """

    source: str = "live"
