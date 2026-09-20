"""Seed the suggested research interests.

Idempotent — safe to run on every deploy.

    python -m app.scripts.seed
"""

import asyncio
import logging

from app.db.session import SessionLocal, engine
from app.services.interests import seed_suggested_interests

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("seed")


async def main() -> None:
    async with SessionLocal() as session:
        created = await seed_suggested_interests(session)
    await engine.dispose()
    logger.info("Seed complete: %s new interest(s) created.", created)


if __name__ == "__main__":
    asyncio.run(main())
