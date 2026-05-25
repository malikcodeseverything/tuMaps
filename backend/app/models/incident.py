from datetime import date
from sqlalchemy import Column, Integer, String, Float, Date, UniqueConstraint
from ..database import Base


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(50), nullable=False)
    external_id = Column(String(100))
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    incident_date = Column(Date, nullable=False, index=True)
    ucr_code = Column(Integer)
    crime_type = Column(String(100))
    description = Column(String(500))

    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_incident_source_id"),
    )
