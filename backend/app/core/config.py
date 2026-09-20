"""Application settings, loaded from environment variables / .env."""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    app_name: str = "PaperSwipe API"
    api_v1_prefix: str = "/api/v1"
    environment: str = "development"
    debug: bool = False

    # --- Database ---
    # Async driver (asyncpg) is used by the app; Alembic swaps in a sync driver.
    database_url: str = "postgresql+asyncpg://paperswipe:paperswipe@localhost:5432/paperswipe"

    # --- Security ---
    # MUST be overridden in production via the SECRET_KEY env var.
    secret_key: str = "dev-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # --- CORS ---
    # Comma-separated list, e.g. "http://localhost:8081,https://app.example.com"
    cors_origins: str = "*"

    # --- Semantic Scholar ---
    semantic_scholar_base_url: str = "https://api.semanticscholar.org/graph/v1"
    # Optional. The public endpoint works without a key (at a lower rate limit).
    semantic_scholar_api_key: str | None = None
    semantic_scholar_timeout_seconds: float = 12.0
    semantic_scholar_max_retries: int = 2
    # Papers requested per interest query.
    semantic_scholar_batch_limit: int = 40

    # --- Feed ---
    feed_default_page_size: int = 10
    feed_max_page_size: int = 50

    testing: bool = Field(default=False)

    @field_validator("database_url")
    @classmethod
    def _force_async_driver(cls, v: str) -> str:
        """Accept a plain `postgresql://` URL (what Render/Railway hand out)."""
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql://", 1)
        if v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
