"""Reference parsing logic to extract metadata from reference text."""
import re
from typing import List, Optional
from .models import Reference


def parse_references(raw_text: str) -> List[Reference]:
    """
    Parse a block of references text into structured Reference objects.

    Args:
        raw_text: Raw text from references section

    Returns:
        List of Reference objects with extracted metadata
    """
    if not raw_text or not raw_text.strip():
        return []

    # Split into individual references
    references = split_references(raw_text)

    # Parse each reference
    parsed_refs = []
    for idx, ref_text in enumerate(references, start=1):
        ref = parse_single_reference(idx, ref_text)
        parsed_refs.append(ref)

    return parsed_refs


def split_references(raw_text: str) -> List[str]:
    """
    Split raw references text into individual reference entries.

    Supports various numbering formats:
    - [1], [2], [3]
    - (1), (2), (3)
    - 1., 2., 3.
    - 1 Author et al...
    """
    # Try numbered format with brackets [1]
    if re.search(r'\[\d+\]', raw_text):
        refs = re.split(r'\n(?=\[\d+\])', raw_text)
        return [ref.strip() for ref in refs if ref.strip()]

    # Try numbered format with parentheses (1)
    if re.search(r'\(\d+\)', raw_text):
        refs = re.split(r'\n(?=\(\d+\))', raw_text)
        return [ref.strip() for ref in refs if ref.strip()]

    # Try numbered format with period 1.
    if re.search(r'^\d+\.', raw_text, re.MULTILINE):
        refs = re.split(r'\n(?=\d+\.)', raw_text)
        return [ref.strip() for ref in refs if ref.strip()]

    # Fallback: split by double newlines or look for author patterns
    refs = re.split(r'\n\s*\n', raw_text)
    return [ref.strip() for ref in refs if ref.strip() and len(ref.strip()) > 20]


def parse_single_reference(ref_id: int, raw_text: str) -> Reference:
    """
    Extract metadata from a single reference string.

    Args:
        ref_id: Reference number
        raw_text: Raw reference text

    Returns:
        Reference object with extracted metadata
    """
    ref = Reference(id=ref_id, raw_text=raw_text)

    # Extract DOI
    ref.doi = extract_doi(raw_text)

    # Extract arXiv ID
    ref.arxiv_id = extract_arxiv_id(raw_text)

    # Extract URL
    ref.url = extract_url(raw_text)

    # Extract year
    ref.year = extract_year(raw_text)

    # Extract title
    ref.title = extract_title(raw_text)

    # Extract authors
    ref.authors = extract_authors(raw_text)

    return ref


def extract_doi(text: str) -> Optional[str]:
    """Extract DOI from reference text."""
    # Pattern 1: doi:10.xxxx/yyyy or DOI:10.xxxx/yyyy
    match = re.search(r'doi:\s*(10\.\d{4,}/[^\s,]+)', text, re.IGNORECASE)
    if match:
        return match.group(1).rstrip('.,;')

    # Pattern 2: https://doi.org/10.xxxx/yyyy
    match = re.search(r'doi\.org/(10\.\d{4,}/[^\s,]+)', text, re.IGNORECASE)
    if match:
        return match.group(1).rstrip('.,;')

    # Pattern 3: Standalone 10.xxxx/yyyy pattern
    match = re.search(r'\b(10\.\d{4,}/[^\s,]+)', text)
    if match:
        doi = match.group(1).rstrip('.,;')
        # Validate it looks like a real DOI (contains letters/numbers)
        if re.search(r'[a-zA-Z0-9]', doi.split('/')[1]):
            return doi

    return None


def extract_arxiv_id(text: str) -> Optional[str]:
    """Extract arXiv ID from reference text."""
    # Pattern 1: arXiv:YYMM.NNNNN or arXiv:YYMM.NNNNNvN
    match = re.search(r'arXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?)', text, re.IGNORECASE)
    if match:
        return match.group(1)

    # Pattern 2: arxiv.org/abs/YYMM.NNNNN
    match = re.search(r'arxiv\.org/abs/(\d{4}\.\d{4,5}(?:v\d+)?)', text, re.IGNORECASE)
    if match:
        return match.group(1)

    # Pattern 3: Old arXiv format (e.g., cs/0506085)
    match = re.search(r'arXiv:\s*([a-z\-]+/\d{7})', text, re.IGNORECASE)
    if match:
        return match.group(1)

    return None


def extract_url(text: str) -> Optional[str]:
    """Extract URL from reference text (excluding DOI and arXiv URLs)."""
    # Find all URLs
    urls = re.findall(r'https?://[^\s,)\]]+', text, re.IGNORECASE)

    # Filter out DOI and arXiv URLs (those are handled separately)
    for url in urls:
        url = url.rstrip('.,;')
        if 'doi.org' not in url.lower() and 'arxiv.org' not in url.lower():
            return url

    return None


def extract_year(text: str) -> Optional[int]:
    """Extract publication year from reference text."""
    # Look for 4-digit year in parentheses (common in citations)
    match = re.search(r'\((\d{4})\)', text)
    if match:
        year = int(match.group(1))
        # Validate reasonable year range
        if 1900 <= year <= 2030:
            return year

    # Look for standalone 4-digit year
    matches = re.findall(r'\b(19\d{2}|20[0-3]\d)\b', text)
    if matches:
        # Return the first valid year found
        return int(matches[0])

    return None


def extract_title(text: str) -> Optional[str]:
    """Extract paper title from reference text."""
    # Remove reference number prefix [1], (1), 1.
    cleaned = re.sub(r'^[\[\(]?\d+[\]\)]?\.?\s*', '', text)

    # Strategy 1: Title in quotes
    match = re.search(r'["""]([^"""]+)["""]', cleaned)
    if match:
        return match.group(1).strip()

    # Strategy 2: Title between author and year (heuristic)
    # Look for text after authors (ends with period or comma) and before year
    match = re.search(r'(?:et al\.|[A-Z]\.\s|[A-Z][a-z]+,\s)+([^.]+?)\.?\s*(?:\(?\d{4}|\d{4}\))', cleaned)
    if match:
        title = match.group(1).strip()
        if len(title) > 10:  # Reasonable title length
            return title

    # Strategy 3: First sentence after author names
    # Look for first capital letter sequence that looks like a title
    match = re.search(r'(?:[A-Z]\.\s*)+([A-Z][^.]+\.)', cleaned)
    if match:
        title = match.group(1).strip().rstrip('.')
        if len(title) > 10 and not title.endswith(('et al', 'eds', 'ed')):
            return title

    return None


def extract_authors(text: str) -> Optional[List[str]]:
    """Extract author names from reference text."""
    # Remove reference number prefix
    cleaned = re.sub(r'^[\[\(]?\d+[\]\)]?\.?\s*', '', text)

    # Look for author patterns before year or title
    # Pattern: Last, F., Last, F., and Last, F.
    match = re.search(r'^([^.]+?)(?:\.|,)\s+(?:[A-Z]\.?\s*)+', cleaned)
    if match:
        author_text = match.group(1)
        # Split by common delimiters
        authors = re.split(r',\s*and\s+|,\s+|\s+and\s+', author_text)
        # Clean up and filter
        authors = [a.strip() for a in authors if a.strip() and len(a.strip()) > 1]
        if authors and len(authors) <= 20:  # Sanity check
            return authors[:5]  # Return first 5 authors max

    return None
