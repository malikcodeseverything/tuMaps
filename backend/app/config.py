import logging
from typing import List
from urllib.parse import urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


def mask_database_url(url: str) -> str:
    """Return a log-safe version of a database URL."""
    try:
        parts = urlsplit(url)
        if not parts.password:
            return url
        host = parts.hostname or ""
        port = f":{parts.port}" if parts.port else ""
        username = parts.username or ""
        netloc = f"{username}:***@{host}{port}"
        return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
    except Exception:
        return "<unparseable database url>"


def normalize_database_url(value: str) -> str:
    """Normalize Railway/local Postgres URLs for SQLAlchemy's asyncpg dialect."""
    value = value.strip().strip('"').strip("'")
    if value.startswith("DATABASE_URL="):
        value = value.removeprefix("DATABASE_URL=").strip().strip('"').strip("'")

    if "${{" in value or "}}" in value:
        raise ValueError(
            "DATABASE_URL still contains Railway template syntax. "
            "Set it as a backend service reference such as ${{Postgres.DATABASE_URL}}."
        )

    if value.startswith("postgres://"):
        value = value.replace("postgres://", "postgresql+asyncpg://", 1)
    elif value.startswith("postgresql://"):
        value = value.replace("postgresql://", "postgresql+asyncpg://", 1)

    return value


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://tumaps:tumaps_dev@localhost/tumaps"
    cors_origins: List[str] = ["http://localhost:3000"]

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        return normalize_database_url(str(value))

    class Config:
        env_file = ".env"


settings = Settings()


def log_runtime_config() -> None:
    logger.info("Using DATABASE_URL=%s", mask_database_url(settings.database_url))
