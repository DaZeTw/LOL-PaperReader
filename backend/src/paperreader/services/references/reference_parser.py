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
    # Normalize whitespace to handle DOIs split across lines
    text = ' '.join(text.split())
    
    # Pattern 1: doi:10.xxxx/yyyy or DOI:10.xxxx/yyyy
    match = re.search(r'doi:\s*(10\.\d{4,}/[^\s,\]]+)', text, re.IGNORECASE)
    if match:
        return match.group(1).rstrip('.,;)')
    
    # Pattern 2: https://doi.org/10.xxxx/yyyy (may have line breaks)
    match = re.search(r'(?:https?://)?(?:dx\.)?doi\.org/(10\.\d{4,}/[^\s,\]]+)', text, re.IGNORECASE)
    if match:
        return match.group(1).rstrip('.,;)')

    # Pattern 3: Standalone 10.xxxx/yyyy pattern
    match = re.search(r'\b(10\.\d{4,}/[^\s,\)\]]+)', text)
    if match:
        doi = match.group(1).rstrip('.,;)')
        # Validate it looks like a real DOI (contains letters/numbers after slash)
        if re.search(r'[a-zA-Z0-9]', doi.split('/', 1)[1] if '/' in doi else ''):
            return doi

    return None


def extract_arxiv_id(text: str) -> Optional[str]:
    """Extract arXiv ID from reference text."""
    # Normalize whitespace first
    text = ' '.join(text.split())
    
    # Pattern 1: arXiv:YYMM.NNNNN or arXiv:YYMM.NNNNNvN
    match = re.search(r'arXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?)', text, re.IGNORECASE)
    if match:
        return match.group(1)
    
    # Pattern 2: arxiv.org/abs/YYMM.NNNNN
    match = re.search(r'arxiv\.org/abs/(\d{4}\.\d{4,5}(?:v\d+)?)', text, re.IGNORECASE)
    if match:
        return match.group(1)
    
    # Pattern 3: ArXiv abs/YYMM.NNNNN or ArXiv/abs/YYMM.NNNNN
    match = re.search(r'arXiv\s*(?:/)?abs[/:]?\s*(\d{4}\.\d{4,5}(?:v\d+)?)', text, re.IGNORECASE)
    if match:
        return match.group(1)
    
    # Pattern 4: Old arXiv format (e.g., cs/0506085, hep-ph/9905221)
    match = re.search(r'arXiv:\s*([a-z\-]+/\d{7})', text, re.IGNORECASE)
    if match:
        return match.group(1)
    
    # Pattern 5: arxiv.org/pdf/YYMM.NNNNN
    match = re.search(r'arxiv\.org/pdf/(\d{4}\.\d{4,5}(?:v\d+)?)', text, re.IGNORECASE)
    if match:
        return match.group(1)
    
    # Pattern 6: Just a standalone arXiv ID pattern (common in "arXiv preprint arXiv:XXXX.XXXXX")
    match = re.search(r'arXiv\s+(?:preprint\s+)?(?:arXiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)', text, re.IGNORECASE)
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
    # Normalize text - join lines with spaces
    text_normalized = ' '.join(text.split())
    
    # Remove reference number prefix [1], (1), 1.
    cleaned = re.sub(r'^[\[\(]?\d+[\]\)]?\.?\s*', '', text_normalized)
    
    # Strategy 1: Title in quotes (various quote styles)
    match = re.search(r'[""\"\'`'']([^""\"\'`'']{15,})[""\"\'`'']', cleaned)
    if match:
        title = match.group(1).strip()
        if len(title) > 10 and len(title) < 300:
            return title
    
    # Strategy 2: Look for title after year in parentheses
    # Pattern: Author et al. YEAR. Title text. Venue
    match = re.search(r'(?:\d{4})[.)\s]+([A-Z][^.]+(?:\.[^.]+)?)\.\s*(?:In\s|Proceedings|arXiv|Journal|Trans|ACM|IEEE|Conference)', cleaned)
    if match:
        title = match.group(1).strip()
        # Filter out venue names mistakenly captured
        if len(title) > 15 and not title.lower().startswith(('in ', 'proceedings', 'journal')):
            return title
    
    # Strategy 3: Look for capitalized title phrase after authors
    # Authors usually end with: et al., a year, or multiple initials
    # Common patterns: "LastName YEAR. Title here." or "et al. YEAR. Title here."
    match = re.search(r'(?:et\s+al\.?|[A-Z][a-z]+)\s*[,.]?\s*(\d{4})[.)]*\s*([A-Z][^.]+)\.\s', cleaned)
    if match:
        title = match.group(2).strip()
        if len(title) > 15 and len(title) < 250:
            # Make sure it's not author names (author names have commas and single capitals)
            if ',' not in title[:30] or not re.match(r'^[A-Z][a-z]+\s*,\s*[A-Z]\.', title):
                return title
    
    # Strategy 4: Try to find title between author block and venue/year
    # Look for the longest sentence-like string that looks like a title
    sentences = re.split(r'\.\s+', cleaned)
    for sent in sentences[1:5]:  # Skip first (likely authors), check next few
        sent = sent.strip()
        # Title characteristics: starts with capital, reasonable length, not author-like
        if (len(sent) > 20 and len(sent) < 250 and 
            sent[0].isupper() and
            not re.match(r'^[A-Z][a-z]+,\s+[A-Z]\.', sent) and  # Not "LastName, F."
            not sent.lower().startswith(('in ', 'proceedings', 'journal', 'vol', 'pp'))):
            # Check it's not mostly author names (has "and" between single-word names)
            if not re.match(r'^[A-Z][a-z]+\s+and\s+[A-Z][a-z]+', sent):
                return sent.rstrip('.')
    
    return None


def extract_authors(text: str) -> Optional[List[str]]:
    """Extract author names from reference text."""
    # Normalize text
    text_normalized = ' '.join(text.split())
    
    # Remove reference number prefix
    cleaned = re.sub(r'^[\[\(]?\d+[\]\)]?\.?\s*', '', text_normalized)
    
    # Look for author block - text before the year
    # Pattern: Authors. Year. Title... or Authors (Year). Title...
    match = re.match(r'^(.+?)\s*[.,]?\s*(?:\(?\d{4}\)?)[.,\s]', cleaned)
    if not match:
        # Try alternative: text before first quoted string
        match = re.match(r'^(.+?)\s*["""\']', cleaned)
    
    if not match:
        return None
    
    author_text = match.group(1).strip()
    
    # Remove any trailing punctuation
    author_text = author_text.rstrip('.,;:')
    
    # Skip if too short or too long
    if len(author_text) < 5 or len(author_text) > 500:
        return None
    
    # Split by common delimiters
    # Handle: "Author1, Author2, and Author3" or "Author1; Author2; Author3"
    # First normalize "and" to comma
    author_text = re.sub(r',?\s+and\s+', ', ', author_text, flags=re.IGNORECASE)
    author_text = re.sub(r',?\s+&\s+', ', ', author_text)
    
    # Split by comma or semicolon
    parts = re.split(r'[;,]\s*', author_text)
    
    authors = []
    current_author = []
    
    for part in parts:
        part = part.strip()
        if not part:
            continue
        
        # Check if this looks like a name or initial
        # Initials: single capital letter optionally followed by period
        is_initial = re.match(r'^[A-Z]\.?$', part)
        
        if is_initial and current_author:
            # This is an initial belonging to previous name part
            current_author.append(part)
        else:
            # Start of new author name
            if current_author:
                # Save previous author
                author_name = ' '.join(current_author)
                if len(author_name) > 2:
                    authors.append(author_name)
            current_author = [part]
    
    # Don't forget the last author
    if current_author:
        author_name = ' '.join(current_author)
        if len(author_name) > 2:
            authors.append(author_name)
    
    # Clean up author names
    cleaned_authors = []
    for author in authors:
        # Remove any remaining odd characters
        author = re.sub(r'^\d+\.\s*', '', author)  # Remove leading numbers
        author = author.strip('.,;:')
        # Skip if it looks like a title or venue
        if (len(author) > 2 and 
            not author.lower().startswith(('in ', 'proceedings', 'journal', 'the '))):
            cleaned_authors.append(author)
    
    if cleaned_authors and len(cleaned_authors) <= 20:
        return cleaned_authors[:10]  # Return up to 10 authors
    
    return None
