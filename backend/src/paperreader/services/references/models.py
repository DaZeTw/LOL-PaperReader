"""Data models for reference extraction."""
from dataclasses import dataclass, asdict
from typing import Optional, List


@dataclass
class Reference:
    """Represents a single bibliographic reference."""

    id: int
    raw_text: str
    title: Optional[str] = None
    authors: Optional[List[str]] = None
    year: Optional[int] = None
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    url: Optional[str] = None
    venue: Optional[str] = None
    link: Optional[str] = None
    link_type: Optional[str] = None

    def to_dict(self):
        """Convert to dictionary for JSON serialization."""
        return asdict(self)
