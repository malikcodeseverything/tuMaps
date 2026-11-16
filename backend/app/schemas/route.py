from typing import Annotated, Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field

# Real coordinates only: NaN and Infinity are valid JSON floats in Python's
# parser and would otherwise reach the nearest-node lookup.
Longitude = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
Latitude = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]


class RouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    origin: Tuple[Longitude, Latitude]
    destination: Tuple[Longitude, Latitude]


class RouteSegment(BaseModel):
    geometry: Dict[str, Any]
    risk: float


class RouteResult(BaseModel):
    geometry: Dict[str, Any]
    distance_m: float
    duration_s: float
    risk_score: float
    segments: List[RouteSegment]


class RoutesResponse(BaseModel):
    safest: Optional[RouteResult] = None
    fastest: Optional[RouteResult] = None
    balanced: Optional[RouteResult] = None
