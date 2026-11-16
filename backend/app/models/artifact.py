from sqlalchemy import Column, DateTime, LargeBinary, String, func

from ..database import Base


class Artifact(Base):
    """Precomputed results (edge risk, heatmap) so startup can skip recomputing them."""

    __tablename__ = "artifacts"

    name = Column(String(50), primary_key=True)
    payload = Column(LargeBinary, nullable=False)  # gzip-compressed JSON
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
