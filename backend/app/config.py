import logging
from typing import List, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

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

    if value.startswith("postgresql+asyncpg://"):
        value = _asyncpg_query_params(value)

    return value


def _asyncpg_query_params(url: str) -> str:
    """Translate libpq-style query params (as in Neon connection strings) for asyncpg.

    Hosted Postgres providers hand out URLs like
    ...?sslmode=require&channel_binding=require. asyncpg rejects those keyword
    arguments; it takes `ssl` instead and negotiates channel binding itself.
    """
    parts = urlsplit(url)
    params = []
    for key, val in parse_qsl(parts.query, keep_blank_values=True):
        if key == "sslmode":
            params.append(("ssl", val))
        elif key == "channel_binding":
            continue
        else:
            params.append((key, val))
    return urlunsplit(parts._replace(query=urlencode(params)))


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://tumaps:tumaps_dev@localhost/tumaps"
    cors_origins: List[str] = [
        "http://localhost:3000",
        "https://tu-maps.vercel.app",
    ]
    # Matches the production domain plus Vercel preview deployments,
    # e.g. https://tu-maps-git-feature-x.vercel.app
    cors_origin_regex: Optional[str] = r"https://tu-maps(-[a-z0-9-]+)?\.vercel\.app"

    # Incident data refresh. The API re-ingests Philly Open Data in the
    # background when the newest stored incident is older than
    # incident_max_age_days, checking every incident_refresh_hours.
    # Set incident_refresh_hours=0 to disable (e.g. local dev).
    incident_refresh_hours: int = 24
    incident_max_age_days: int = 2
    incident_years_back: int = 3

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        return normalize_database_url(str(value))

    class Config:
        env_file = ".env"


settings = Settings()


def log_runtime_config() -> None:
    logger.info("Using DATABASE_URL=%s", mask_database_url(settings.database_url))
    host = urlsplit(settings.database_url).hostname or ""
    if "-pooler." in host:
        logger.warning(
            "DATABASE_URL points at a connection pooler (PgBouncer). asyncpg's prepared "
            "statements can fail behind it; use the direct (non-pooled) connection string."
        )
