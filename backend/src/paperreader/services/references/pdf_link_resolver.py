"""PDF Link Resolver - Find open access PDF links from paper metadata."""

import logging
from typing import Optional, Tuple
from dataclasses import dataclass
import httpx
from paperreader.config.settings import settings

logger = logging.getLogger(__name__)


@dataclass
class PdfLinkResult:
    """Result of PDF link resolution."""

    pdf_url: Optional[str] = None
    source: Optional[str] = None  # 'arxiv', 'unpaywall', 'semantic_scholar', 'crossref'
    is_open_access: bool = False


async def resolve_pdf_link(
    doi: Optional[str] = None,
    arxiv_id: Optional[str] = None,
    title: Optional[str] = None,
    authors: Optional[list[str]] = None,
    year: Optional[int] = None,
) -> PdfLinkResult:
    """
    Resolve PDF link from paper metadata with fallback strategy.

    Priority order:
    1. arXiv ID -> Direct PDF link
    2. DOI -> Unpaywall API
    3. DOI/Title -> Semantic Scholar API (openAccessPdf)
    4. DOI -> CrossRef API

    Args:
        doi: DOI identifier
        arxiv_id: arXiv identifier
        title: Paper title
        authors: Author names
        year: Publication year

    Returns:
        PdfLinkResult with pdf_url, source, and is_open_access flag
    """
    result = PdfLinkResult()

    # Priority 1: arXiv - always has free PDFs
    if arxiv_id:
        result = await get_arxiv_pdf_link(arxiv_id)
        if result.pdf_url:
            return result

    # Priority 2: Unpaywall - best source for legal open access PDFs
    if doi:
        result = await get_unpaywall_pdf_link(doi)
        if result.pdf_url:
            return result

    # Priority 3: Semantic Scholar - has openAccessPdf for many papers
    if doi or title:
        result = await get_semantic_scholar_pdf_link(doi, title, authors)
        if result.pdf_url:
            return result

    # Priority 4: CrossRef - sometimes has PDF links
    if doi:
        result = await get_crossref_pdf_link(doi)
        if result.pdf_url:
            return result

    logger.info(f"No PDF link found for doi={doi}, arxiv={arxiv_id}, title={title[:50] if title else None}")
    return PdfLinkResult()


async def get_arxiv_pdf_link(arxiv_id: str) -> PdfLinkResult:
    """
    Get direct PDF link from arXiv.

    arXiv IDs come in formats like:
    - 2301.00001
    - 2301.00001v1
    - hep-th/9901001

    Args:
        arxiv_id: arXiv paper identifier

    Returns:
        PdfLinkResult with arxiv PDF URL
    """
    # Clean up arxiv_id - remove 'arXiv:' prefix if present
    clean_id = arxiv_id.replace("arXiv:", "").replace("arxiv:", "").strip()

    # Construct PDF URL
    pdf_url = f"https://arxiv.org/pdf/{clean_id}.pdf"

    logger.info(f"[arXiv] Generated PDF link: {pdf_url}")
    return PdfLinkResult(pdf_url=pdf_url, source="arxiv", is_open_access=True)


async def get_unpaywall_pdf_link(doi: str) -> PdfLinkResult:
    """
    Get PDF link from Unpaywall API.

    Unpaywall provides free, legal access to scholarly articles.
    API docs: https://unpaywall.org/products/api

    Args:
        doi: DOI identifier

    Returns:
        PdfLinkResult with Unpaywall PDF URL if available
    """
    # Unpaywall requires an email for API access
    email = "paperreader@example.com"  # Replace with your email in production

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"https://api.unpaywall.org/v2/{doi}?email={email}"
            response = await client.get(url)

            if response.status_code != 200:
                logger.debug(f"[Unpaywall] No result for DOI {doi}: {response.status_code}")
                return PdfLinkResult()

            data = response.json()

            # Check for best open access location
            best_oa = data.get("best_oa_location")
            if best_oa and best_oa.get("url_for_pdf"):
                pdf_url = best_oa["url_for_pdf"]
                logger.info(f"[Unpaywall] Found PDF: {pdf_url}")
                return PdfLinkResult(
                    pdf_url=pdf_url, source="unpaywall", is_open_access=True
                )

            # Check other OA locations
            oa_locations = data.get("oa_locations", [])
            for loc in oa_locations:
                if loc.get("url_for_pdf"):
                    pdf_url = loc["url_for_pdf"]
                    logger.info(f"[Unpaywall] Found PDF from OA location: {pdf_url}")
                    return PdfLinkResult(
                        pdf_url=pdf_url, source="unpaywall", is_open_access=True
                    )

    except Exception as e:
        logger.warning(f"[Unpaywall] Error fetching {doi}: {e}")

    return PdfLinkResult()


async def get_semantic_scholar_pdf_link(
    doi: Optional[str] = None,
    title: Optional[str] = None,
    authors: Optional[list[str]] = None,
) -> PdfLinkResult:
    """
    Get PDF link from Semantic Scholar API.

    Semantic Scholar provides openAccessPdf field for papers with free PDFs.
    API docs: https://api.semanticscholar.org/api-docs/

    Args:
        doi: DOI identifier
        title: Paper title for search
        authors: Author names for better matching

    Returns:
        PdfLinkResult with Semantic Scholar PDF URL if available
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            paper_data = None

            # Try DOI lookup first (more precise)
            if doi:
                url = f"https://api.semanticscholar.org/graph/v1/paper/DOI:{doi}?fields=openAccessPdf,isOpenAccess,title"
                
                headers = {}
                if settings.SEMANTIC_SCHOLAR_KEY:
                    headers["x-api-key"] = settings.SEMANTIC_SCHOLAR_KEY

                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    paper_data = response.json()

            # Fall back to title search
            if not paper_data and title:
                # Build search query
                query = title
                if authors and len(authors) > 0:
                    query = f"{title} {authors[0]}"

                url = f"https://api.semanticscholar.org/graph/v1/paper/search?query={query}&limit=1&fields=openAccessPdf,isOpenAccess,title"
                
                headers = {}
                if settings.SEMANTIC_SCHOLAR_KEY:
                    headers["x-api-key"] = settings.SEMANTIC_SCHOLAR_KEY

                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    if data.get("data") and len(data["data"]) > 0:
                        paper_data = data["data"][0]

            # Extract PDF URL from paper data
            if paper_data:
                oa_pdf = paper_data.get("openAccessPdf")
                if oa_pdf and oa_pdf.get("url"):
                    pdf_url = oa_pdf["url"]
                    logger.info(f"[SemanticScholar] Found PDF: {pdf_url}")
                    return PdfLinkResult(
                        pdf_url=pdf_url,
                        source="semantic_scholar",
                        is_open_access=paper_data.get("isOpenAccess", True),
                    )

    except Exception as e:
        logger.warning(f"[SemanticScholar] Error: {e}")

    return PdfLinkResult()


async def get_crossref_pdf_link(doi: str) -> PdfLinkResult:
    """
    Get PDF link from CrossRef API.

    CrossRef sometimes includes links to PDFs in the 'link' field.
    API docs: https://api.crossref.org/swagger-ui/index.html

    Args:
        doi: DOI identifier

    Returns:
        PdfLinkResult with CrossRef PDF URL if available
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"https://api.crossref.org/works/{doi}"
            headers = {
                "User-Agent": "PaperReader/1.0 (mailto:paperreader@example.com)"
            }
            response = await client.get(url, headers=headers)

            if response.status_code != 200:
                logger.debug(f"[CrossRef] No result for DOI {doi}: {response.status_code}")
                return PdfLinkResult()

            data = response.json()
            message = data.get("message", {})

            # Check for PDF links
            links = message.get("link", [])
            for link in links:
                content_type = link.get("content-type", "")
                if "pdf" in content_type.lower():
                    pdf_url = link.get("URL")
                    if pdf_url:
                        logger.info(f"[CrossRef] Found PDF: {pdf_url}")
                        return PdfLinkResult(
                            pdf_url=pdf_url,
                            source="crossref",
                            is_open_access=False,  # CrossRef links may require subscription
                        )

    except Exception as e:
        logger.warning(f"[CrossRef] Error fetching {doi}: {e}")

    return PdfLinkResult()
