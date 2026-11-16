"""Store and load precomputed results as gzip-compressed JSON in Postgres."""
import gzip
import json
from typing import Any, Optional

from ..database import async_session_factory
from ..models.artifact import Artifact


async def save_artifact(name: str, data: Any) -> None:
    payload = gzip.compress(json.dumps(data, separators=(",", ":")).encode(), compresslevel=6)
    async with async_session_factory() as session:
        async with session.begin():
            await session.merge(Artifact(name=name, payload=payload))


async def load_artifact(name: str) -> Optional[Any]:
    async with async_session_factory() as session:
        row = await session.get(Artifact, name)
        if row is None:
            return None
        return json.loads(gzip.decompress(row.payload))
