from pydantic import BaseModel, Field


class Page[T](BaseModel):
    """Offset-paginated envelope used by every list endpoint."""

    items: list[T]
    total: int | None = Field(
        default=None,
        description="Total matching rows. Null for the feed, where the upstream "
        "result set is not fully enumerable.",
    )
    limit: int
    offset: int
    has_more: bool
