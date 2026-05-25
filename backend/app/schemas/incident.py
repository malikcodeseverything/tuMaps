from pydantic import BaseModel
from typing import List, Dict, Any


class IncidentFeature(BaseModel):
    type: str = "Feature"
    geometry: Dict[str, Any]
    properties: Dict[str, Any]


class IncidentCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[IncidentFeature]
