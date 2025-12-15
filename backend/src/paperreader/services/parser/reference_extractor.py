import re
from typing import Dict, List, Optional

from bs4 import BeautifulSoup

# ==========================================
# Data Models
# ==========================================


class BoundingBox:
    """Represents a bounding box coordinate on a PDF page."""

    def __init__(self, page: int, left: float, top: float, width: float, height: float):
        self.page = page
        self.left = left
        self.top = top
        self.width = width
        self.height = height

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        return {
            "page": self.page,
            "left": round(self.left, 4),
            "top": round(self.top, 4),
            "width": round(self.width, 4),
            "height": round(self.height, 4),
        }


class CitationMarker:
    """Represents an in-text citation marker."""

    def __init__(self, ref_id: str, text: str, boxes: List[BoundingBox]):
        self.ref_id = ref_id
        self.text = text
        self.boxes = boxes

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        return {"text": self.text, "boxes": [b.to_dict() for b in self.boxes]}


class Reference:
    """Represents a bibliographic reference."""

    def __init__(self, ref_id: str):
        self.id = ref_id
        self.title: Optional[str] = None
        self.venue: Optional[str] = None
        self.authors: List[str] = []
        self.year: Optional[str] = None
        self.volume: Optional[str] = None
        self.issue: Optional[str] = None
        self.pages: Optional[str] = None
        self.doi: Optional[str] = None
        self.arxiv_id: Optional[str] = None
        self.boxes: List[BoundingBox] = []
        self.citation_contexts: List[CitationMarker] = []

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        return {
            "id": self.id,
            "title": self.title,
            "venue": self.venue,
            "authors": self.authors,
            "year": self.year,
            "volume": self.volume,
            "issue": self.issue,
            "pages": self.pages,
            "doi": self.doi,
            "arxiv_id": self.arxiv_id,
            "bib_location": [b.to_dict() for b in self.boxes],
            "mentions": [c.to_dict() for c in self.citation_contexts],
        }


# ==========================================
# Reference Extractor Service
# ==========================================


class ReferenceExtractorService:
    """Service for extracting references from GROBID TEI XML."""

    def __init__(self, xml_content: str):
        """
        Initialize the reference extractor.

        Args:
            xml_content: TEI XML string from GROBID
        """
        self.soup = BeautifulSoup(xml_content, "xml")
        self.page_dimensions = self._parse_page_dimensions()

    def _parse_page_dimensions(self) -> Dict[int, Dict[str, float]]:
        """Parse page dimensions from TEI facsimile element."""
        dims = {}
        facsimile = self.soup.find("facsimile")

        if facsimile:
            for surface in facsimile.find_all("surface"):
                try:
                    page_num = int(surface.get("n"))
                    width = float(surface.get("lrx"))
                    height = float(surface.get("lry"))
                    dims[page_num] = {"w": width, "h": height}
                except (ValueError, TypeError):
                    continue

        return dims

    def _parse_coords(self, coords_str: str) -> List[BoundingBox]:
        """
        Parse coordinate string into BoundingBox objects.

        Args:
            coords_str: Coordinate string in format "page,x,y,w,h;..."

        Returns:
            List of normalized BoundingBox objects
        """
        if not coords_str:
            return []

        boxes = []
        groups = coords_str.split(";")

        for group in groups:
            parts = group.split(",")
            if len(parts) >= 5:
                try:
                    page = int(parts[0])
                    x, y, w, h = map(float, parts[1:5])

                    # Normalize coordinates
                    if page in self.page_dimensions:
                        page_width = self.page_dimensions[page]["w"]
                        page_height = self.page_dimensions[page]["h"]
                        x /= page_width
                        w /= page_width
                        y /= page_height
                        h /= page_height

                    boxes.append(BoundingBox(page, x, y, w, h))
                except ValueError:
                    continue

        return boxes

    def _extract_year_from_text(self, text: str) -> Optional[str]:
        """
        Extract 4-digit year from text (1900-2099).

        Args:
            text: Text to search for year

        Returns:
            Extracted year or None
        """
        if not text:
            return None

        match = re.search(r"\b(19\d{2}|20\d{2})\b", text)
        return match.group(1) if match else None

    def _clean_title(self, title: str) -> str:
        """
        Remove year, author names, and common prefixes from title.

        Args:
            title: Raw title string

        Returns:
            Cleaned title string
        """
        if not title:
            return title

        # Remove full names with year at start
        title = re.sub(
            r"^(?:[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)*(?:,\s*)?)+(?:and\s+[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)*)?\.\s*\d{4}\.\s*",
            "",
            title,
        )

        # Remove leading year with optional letter suffix
        title = re.sub(r"^\s*\d{4}[a-z]?\.\s+", "", title)

        # Remove author initials pattern
        title = re.sub(
            r"^(?:[A-Z]\.\s*)+[A-Z][a-z]+(?:(?:,\s*|\s+and\s+)(?:[A-Z]\.\s*)+[A-Z][a-z]+)*\.\s*\d{4}\.\s*",
            "",
            title,
        )

        # Remove trailing year at the end
        title = re.sub(r"\.\s*\d{4}\.$", ".", title)

        # Remove standalone year at the very beginning
        title = re.sub(r"^\s*\d{4}\s+", "", title)

        # Remove leading/trailing periods and spaces
        title = title.strip(". ")

        return title

    def _extract_authors_from_title(self, title: str) -> List[str]:
        """
        Extract author names if they appear at the start of title.

        Args:
            title: Title text that may contain author names

        Returns:
            List of extracted author names
        """
        if not title:
            return []

        authors = []
        pattern = r"^((?:[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)*(?:,\s*)?)+(?:and\s+[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)*)?)\.\s*(\d{4})\."
        match = re.match(pattern, title)

        if match:
            author_text = match.group(1)
            author_text = re.sub(r",\s*and\s+", ", ", author_text)
            author_text = re.sub(r"\s+and\s+", ", ", author_text)
            author_parts = [a.strip() for a in author_text.split(",")]
            authors = [a for a in author_parts if a and not a.isspace()]

        return authors

    def _validate_and_fix_reference(self, ref: Reference) -> None:
        """
        Validate and clean reference fields in-place.

        Args:
            ref: Reference object to validate and fix
        """
        # Extract year from title if present
        if ref.title:
            extracted_year = self._extract_year_from_text(ref.title)
            if extracted_year and not ref.year:
                ref.year = extracted_year

            # Extract authors from title if present
            extracted_authors = self._extract_authors_from_title(ref.title)
            if extracted_authors and not ref.authors:
                ref.authors = extracted_authors

            # Clean the title
            ref.title = self._clean_title(ref.title)

        # Validate year format
        if ref.year:
            year_match = re.search(r"\b(19\d{2}|20\d{2})\b", ref.year)
            if year_match:
                ref.year = year_match.group(1)
            else:
                ref.year = None

        # Remove empty strings from authors
        ref.authors = [a for a in ref.authors if a and a.strip()]

        # Clean venue
        if ref.venue:
            ref.venue = self._clean_title(ref.venue)

    def extract_references(self) -> List[Reference]:
        """
        Extract all references from the TEI XML.

        Returns:
            List of Reference objects with citation contexts
        """
        references_map = {}

        # Parse all biblStruct elements
        for bibl in self.soup.find_all("biblStruct"):
            ref_id = bibl.get("xml:id")
            if not ref_id:
                continue

            ref = Reference(ref_id)
            ref.boxes = self._parse_coords(bibl.get("coords"))

            # Extract title and venue
            analytic = bibl.find("analytic")
            monogr = bibl.find("monogr")

            if analytic:
                title_node = analytic.find(
                    "title", level="a", type="main"
                ) or analytic.find("title", level="a")
                if title_node:
                    ref.title = title_node.get_text(strip=True)

            if monogr:
                m_titles = monogr.find_all("title")
                for t in m_titles:
                    text = t.get_text(strip=True)
                    if not text:
                        continue
                    if ref.title is None:
                        ref.title = text
                    else:
                        ref.venue = text

            # Extract authors
            author_container = (
                analytic if (analytic and analytic.find("author")) else monogr
            )
            if author_container:
                for author_node in author_container.find_all("author"):
                    persName = author_node.find("persName")
                    if persName:
                        fore = persName.find("forename")
                        sur = persName.find("surname")
                        parts = [t.get_text(strip=True) for t in [fore, sur] if t]
                        if parts:
                            ref.authors.append(" ".join(parts))

            # Extract IDs (DOI / arXiv)
            for idno in bibl.find_all("idno"):
                id_type = idno.get("type")
                id_val = idno.get_text(strip=True)

                if id_type == "DOI":
                    ref.doi = id_val
                elif id_type == "arXiv":
                    ref.arxiv_id = id_val

            # Extract imprint info (year, volume, etc.)
            if monogr:
                imprint = monogr.find("imprint")
                if imprint:
                    date = imprint.find("date", type="published")
                    if date and date.has_attr("when"):
                        ref.year = date["when"]

                    vol = imprint.find("biblScope", unit="volume")
                    if vol:
                        ref.volume = vol.get_text(strip=True)

                    issue = imprint.find("biblScope", unit="issue")
                    if issue:
                        ref.issue = issue.get_text(strip=True)

                    pg = imprint.find("biblScope", unit="page")
                    if pg:
                        ref.pages = pg.get_text(strip=True)

            # Validate and fix reference
            self._validate_and_fix_reference(ref)
            references_map[ref_id] = ref

        # Link in-text citation markers
        for ref_node in self.soup.find_all("ref", type="bibr"):
            target_rid = ref_node.get("target")
            if not target_rid:
                continue

            clean_rid = target_rid.replace("#", "")

            if clean_rid in references_map:
                boxes = self._parse_coords(ref_node.get("coords"))
                text = ref_node.get_text(strip=True)
                marker = CitationMarker(clean_rid, text, boxes)
                references_map[clean_rid].citation_contexts.append(marker)

        return list(references_map.values())
