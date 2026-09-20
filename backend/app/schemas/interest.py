from pydantic import BaseModel, ConfigDict, Field, field_validator


class InterestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    normalized_name: str
    is_suggested: bool


class UserInterestsResponse(BaseModel):
    items: list[InterestResponse]


class UserInterestsUpdate(BaseModel):
    """Full replacement of the user's interest set.

    Accepts free-text names (not IDs) so the client can send suggested and custom
    interests through one code path; unknown names are created on the fly.
    """

    names: list[str] = Field(min_length=1, max_length=25)

    @field_validator("names")
    @classmethod
    def _clean(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in values:
            name = " ".join(raw.strip().split())
            if not name:
                continue
            if len(name) > 120:
                raise ValueError("Interest names must be 120 characters or fewer.")
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(name)
        if not cleaned:
            raise ValueError("Select at least one research interest.")
        return cleaned
