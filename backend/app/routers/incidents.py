from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models.incident import Incident
from ..services.risk import SEVERITY

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("")
async def get_incidents(response: Response, session: AsyncSession = Depends(get_session)):
    response.headers["Cache-Control"] = "public, max-age=300"
    result = await session.execute(select(Incident))
    incidents = result.scalars().all()

    features = []
    for i in incidents:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [i.lng, i.lat]},
            "properties": {
                "severity": SEVERITY.get(i.ucr_code, 0.2),
                "type": i.crime_type or "",
                "date": i.incident_date.isoformat(),
            },
        })

    return {"type": "FeatureCollection", "features": features}
