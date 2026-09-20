"""Interest lookup / creation / assignment."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Interest, User, UserInterest
from app.models.interest import normalize_interest

# Seeded on first boot and by `python -m app.scripts.seed`. These are only
# defaults — users can add any custom interest.
SUGGESTED_INTERESTS: list[str] = [
    "Human-Computer Interaction",
    "Web Agents",
    "AI Agents",
    "Explainable AI",
    "Interpretable Machine Learning",
    "Vision-Language Models",
    "Human-AI Interaction",
    "Robotics",
    "Computer Vision",
    "Natural Language Processing",
]


async def list_interests(db: AsyncSession, suggested_only: bool = False) -> list[Interest]:
    stmt = select(Interest).order_by(Interest.is_suggested.desc(), Interest.name)
    if suggested_only:
        stmt = stmt.where(Interest.is_suggested.is_(True))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_or_create_interests(db: AsyncSession, names: list[str]) -> list[Interest]:
    """Resolve display names to Interest rows, creating any that are new."""
    if not names:
        return []

    normalized_to_name: dict[str, str] = {}
    for name in names:
        normalized_to_name.setdefault(normalize_interest(name), name)

    result = await db.execute(
        select(Interest).where(Interest.normalized_name.in_(list(normalized_to_name)))
    )
    existing = {interest.normalized_name: interest for interest in result.scalars().all()}

    created: list[Interest] = []
    for normalized, display_name in normalized_to_name.items():
        if normalized in existing:
            continue
        interest = Interest(name=display_name, normalized_name=normalized, is_suggested=False)
        db.add(interest)
        created.append(interest)

    if created:
        await db.flush()
        for interest in created:
            existing[interest.normalized_name] = interest

    return [existing[n] for n in normalized_to_name]


async def get_user_interests(db: AsyncSession, user: User) -> list[Interest]:
    result = await db.execute(
        select(Interest)
        .join(UserInterest, UserInterest.interest_id == Interest.id)
        .where(UserInterest.user_id == user.id)
        .order_by(Interest.name)
    )
    return list(result.scalars().all())


async def set_user_interests(db: AsyncSession, user: User, names: list[str]) -> list[Interest]:
    """Replace the user's interest set wholesale (PUT semantics)."""
    interests = await get_or_create_interests(db, names)

    await db.execute(delete(UserInterest).where(UserInterest.user_id == user.id))
    for interest in interests:
        db.add(UserInterest(user_id=user.id, interest_id=interest.id))

    await db.commit()
    return sorted(interests, key=lambda i: i.name)


async def seed_suggested_interests(db: AsyncSession) -> int:
    """Idempotently insert the suggested interests. Returns how many were created."""
    normalized = [normalize_interest(n) for n in SUGGESTED_INTERESTS]
    result = await db.execute(
        select(Interest.normalized_name).where(Interest.normalized_name.in_(normalized))
    )
    existing = set(result.scalars().all())

    created = 0
    for name in SUGGESTED_INTERESTS:
        key = normalize_interest(name)
        if key in existing:
            continue
        db.add(Interest(name=name, normalized_name=key, is_suggested=True))
        created += 1

    if created:
        await db.commit()
    return created
