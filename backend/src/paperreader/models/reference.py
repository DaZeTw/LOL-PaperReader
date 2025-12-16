from datetime import datetime
from typing import Any, List, Optional

from bson import ObjectId
from pydantic import BaseModel, Field


class BoundingBoxSchema(BaseModel):
    """Bounding box coordinates on a PDF page."""

    page: int
    left: float
    top: float
    width: float
    height: float


class CitationMentionSchema(BaseModel):
    """In-text citation marker."""

    text: str
    boxes: List[BoundingBoxSchema] = []


class ReferenceSchema(BaseModel):
    """Bibliographic reference extracted from PDF."""

    id: Optional[str] = Field(default=None, alias="_id")
    document_id: str
    ref_id: str

    # Bibliographic information
    title: Optional[str] = None
    venue: Optional[str] = None
    authors: List[str] = []
    year: Optional[str] = None
    volume: Optional[str] = None
    issue: Optional[str] = None
    pages: Optional[str] = None

    # Identifiers
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None

    # Location in PDF
    bib_location: List[BoundingBoxSchema] = []
    mentions: List[CitationMentionSchema] = []

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @classmethod
    def from_mongo(cls, data: dict) -> "ReferenceSchema":
        """Convert MongoDB document to Pydantic model."""
        if not data:
            return None
        # Convert ObjectId to string
        if "_id" in data and isinstance(data["_id"], ObjectId):
            data["_id"] = str(data["_id"])
        return cls(**data)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}
        json_schema_extra = {
            "example": {
                "_id": "507f1f77bcf86cd799439011",
                "document_id": "doc_123",
                "ref_id": "b0",
                "title": "Sample Paper Title",
                "authors": ["John Doe", "Jane Smith"],
                "year": "2023",
                "venue": "Conference Name",
            }
        }


class ReferenceCreate(BaseModel):
    """Schema for creating a new reference."""

    document_id: str
    ref_id: str
    title: Optional[str] = None
    venue: Optional[str] = None
    authors: List[str] = []
    year: Optional[str] = None
    volume: Optional[str] = None
    issue: Optional[str] = None
    pages: Optional[str] = None
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    bib_location: List[BoundingBoxSchema] = []
    mentions: List[CitationMentionSchema] = []


class ReferenceUpdate(BaseModel):
    """Schema for updating a reference."""

    title: Optional[str] = None
    venue: Optional[str] = None
    authors: Optional[List[str]] = None
    year: Optional[str] = None
    volume: Optional[str] = None
    issue: Optional[str] = None
    pages: Optional[str] = None
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    bib_location: Optional[List[BoundingBoxSchema]] = None
    mentions: Optional[List[CitationMentionSchema]] = None


class ReferenceBatchCreate(BaseModel):
    """Schema for batch creating references."""

    document_id: str
    references: List[ReferenceCreate]
