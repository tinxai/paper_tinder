from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.swipe import SwipeDirection


class SwipeCreate(BaseModel):
    paper_id: str = Field(min_length=1, max_length=64)
    direction: SwipeDirection


class SwipeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    paper_id: str
    direction: SwipeDirection
    created_at: datetime
