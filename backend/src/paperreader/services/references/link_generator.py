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
    
    # Title is most important - use quotes for exact phrase matching
    if reference.title and len(reference.title) > 10:
        # Use the title as the main query (Scholar will match this best)
        query_parts.append(f'"{reference.title}"')
    
    # Add first author surname for disambiguation
    if reference.authors and len(reference.authors) > 0:
        first_author = reference.authors[0]
        # Extract likely surname (last word in name, or everything for single-word names)
        surname = first_author.split()[-1] if ' ' in first_author else first_author
        # Remove initials and punctuation
        surname = surname.strip('.,')
        if len(surname) > 2:
            query_parts.append(surname)

    # Add year for filtering
    if reference.year:
        query_parts.append(str(reference.year))

    # If we still don't have a good query, use cleaned raw text
    if len(query_parts) == 0 or (len(query_parts) == 1 and reference.year and str(reference.year) in query_parts):
        # Extract meaningful text from raw reference
        raw_text = reference.raw_text
        # Remove reference number
        import re
        raw_text = re.sub(r'^[\[\(]?\d+[\]\)]?\.?\s*', '', raw_text)
        # Normalize whitespace
        raw_text = ' '.join(raw_text.split())
        # Take first 150 chars (likely contains title)
        raw_text = raw_text[:150]
        # Clean up special characters
        raw_text = raw_text.replace('[', '').replace(']', '')
        raw_text = raw_text.replace('(', '').replace(')', '')
        if raw_text:
            query_parts = [raw_text]  # Replace with raw text

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
