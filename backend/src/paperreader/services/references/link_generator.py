"""Generate clickable links for references based on available metadata."""
from urllib.parse import quote_plus
from typing import Tuple
from .models import Reference


def generate_link(reference: Reference) -> Tuple[str, str]:
    """
    Generate the best available link for a reference.

    Priority order:
    1. DOI -> https://doi.org/{doi}
    2. arXiv ID -> https://arxiv.org/abs/{arxiv_id}
    3. URL -> Use direct URL
    4. Title/Year -> Google Scholar search

    Args:
        reference: Reference object with metadata

    Returns:
        Tuple of (link_url, link_type) where link_type is one of:
        'doi', 'arxiv', 'url', 'scholar'
    """
    # Priority 1: DOI
    if reference.doi:
        return f"https://doi.org/{reference.doi}", "doi"

    # Priority 2: arXiv
    if reference.arxiv_id:
        return f"https://arxiv.org/abs/{reference.arxiv_id}", "arxiv"

    # Priority 3: Direct URL
    if reference.url:
        return reference.url, "url"

    # Priority 4: Google Scholar fallback
    return generate_scholar_link(reference), "scholar"


def generate_scholar_link(reference: Reference) -> str:
    """
    Generate a Google Scholar search link.

    Args:
        reference: Reference object

    Returns:
        Google Scholar search URL
    """
    # Build search query from available metadata
    query_parts = []

    if reference.title:
        query_parts.append(reference.title)

    if reference.authors and len(reference.authors) > 0:
        # Add first author
        query_parts.append(reference.authors[0])

    if reference.year:
        query_parts.append(str(reference.year))

    # If no metadata extracted, use raw text (truncated)
    if not query_parts:
        # Use first 200 chars of raw text, remove numbers/brackets
        raw_cleaned = reference.raw_text[:200]
        raw_cleaned = raw_cleaned.replace('[', '').replace(']', '')
        raw_cleaned = raw_cleaned.replace('(', '').replace(')', '')
        query_parts.append(raw_cleaned)

    query = ' '.join(query_parts)
    encoded_query = quote_plus(query)

    return f"https://scholar.google.com/scholar?q={encoded_query}"


def update_reference_link(reference: Reference) -> Reference:
    """
    Update a reference object with generated link and link_type.

    Args:
        reference: Reference object to update

    Returns:
        Updated reference with link and link_type fields populated
    """
    link, link_type = generate_link(reference)
    reference.link = link
    reference.link_type = link_type
    return reference
