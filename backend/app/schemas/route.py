from pydantic import BaseModel
from typing import Optional, List, Tuple, Dict, Any


class RouteRequest(BaseModel):
    origin: Tuple[float, float]       # [lng, lat]
    destination: Tuple[float, float]  # [lng, lat]


class RouteSegment(BaseModel):
    geometry: Dict[str, Any]
    risk: float


class RouteResult(BaseModel):
    geometry: Dict[str, Any]
    distance_m: float
    duration_s: float
    risk_score: float
    risk_label: str
    risk_percentile: float
    max_segment_risk: float
    max_segment_risk_label: str
    max_segment_risk_percentile: float
    elevated_segment_count: int
    segments: List[RouteSegment]


class RoutesResponse(BaseModel):
    safest: Optional[RouteResult] = None
    fastest: Optional[RouteResult] = None
    balanced: Optional[RouteResult] = None
