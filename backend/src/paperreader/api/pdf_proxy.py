"""Proxy endpoint for fetching PDFs from external URLs (arXiv, Semantic Scholar, etc.)."""

import re
from urllib.parse import quote_plus, unquote

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/pdf")

# Semantic Scholar API base URL
S2_API_BASE = "https://api.semanticscholar.org/graph/v1"


def convert_arxiv_to_pdf_url(url: str) -> str:
    """
    Convert arXiv abstract URL to direct PDF URL.
    e.g., https://arxiv.org/abs/2105.00076 → https://arxiv.org/pdf/2105.00076.pdf
    """
    # Match arXiv abstract URLs
    abs_pattern = r"https?://arxiv\.org/abs/([0-9.]+)(v\d+)?"
    match = re.match(abs_pattern, url)
    if match:
        arxiv_id = match.group(1)
        version = match.group(2) or ""
        return f"https://arxiv.org/pdf/{arxiv_id}{version}.pdf"

    # Already a PDF URL
    if "arxiv.org/pdf/" in url:
        return url

    return url


def extract_doi_from_url(url: str) -> str | None:
    """Extract DOI from a URL if present."""
    # Match doi.org URLs
    doi_pattern = r"https?://(?:dx\.)?doi\.org/(10\.\d{4,}/[^\s]+)"
    match = re.match(doi_pattern, url)
    if match:
        return match.group(1)

    # Match DOI pattern directly
    doi_direct_pattern = r"(10\.\d{4,}/[^\s]+)"
    match = re.search(doi_direct_pattern, url)
    if match:
        return match.group(1)

    return None


async def get_pdf_url_from_semantic_scholar(
    identifier: str, id_type: str = "doi"
) -> str | None:
    """
    Query Semantic Scholar API to get open access PDF URL.

    Args:
        identifier: Paper identifier (DOI, arXiv ID, or title)
        id_type: Type of identifier - "doi", "arxiv", or "title"

    Returns:
        PDF URL if found, None otherwise
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Build the appropriate API URL
            if id_type == "doi":
                paper_id = f"DOI:{identifier}"
                url = f"{S2_API_BASE}/paper/{paper_id}?fields=title,openAccessPdf,isOpenAccess,externalIds"
            elif id_type == "arxiv":
                paper_id = f"ARXIV:{identifier}"
                url = f"{S2_API_BASE}/paper/{paper_id}?fields=title,openAccessPdf,isOpenAccess,externalIds"
            else:
                # Search by title
                url = f"{S2_API_BASE}/paper/search?query={quote_plus(identifier)}&fields=title,openAccessPdf,isOpenAccess&limit=1"

            print(f"[PDF Proxy] Querying Semantic Scholar: {url}")
            response = await client.get(url)

            if response.status_code != 200:
                print(f"[PDF Proxy] Semantic Scholar returned {response.status_code}")
                return None

            data = response.json()

            # Handle search results vs direct paper lookup
            if id_type == "title":
                results = data.get("data", [])
                if not results:
                    return None
                paper = results[0]
            else:
                paper = data

            # Check for open access PDF
            open_access_pdf = paper.get("openAccessPdf")
            if open_access_pdf and open_access_pdf.get("url"):
                pdf_url = open_access_pdf["url"]
                print(f"[PDF Proxy] Found open access PDF: {pdf_url}")
                return pdf_url

            # Check if paper has arXiv ID we can use
            external_ids = paper.get("externalIds", {})
            arxiv_id = external_ids.get("ArXiv")
            if arxiv_id:
                pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
                print(f"[PDF Proxy] Using arXiv ID from Semantic Scholar: {pdf_url}")
                return pdf_url

            print(f"[PDF Proxy] No open access PDF found for: {identifier}")
            return None

    except Exception as e:
        print(f"[PDF Proxy] Semantic Scholar API error: {e}")
        return None


@router.get("/proxy")
async def proxy_pdf(url: str, title: str = None):
    """
    Fetch a PDF from an external URL and return it as a stream.

    This endpoint acts as a proxy to bypass CORS restrictions when
    fetching PDFs from external sources like arXiv or via Semantic Scholar.

    Args:
        url: The URL of the PDF or reference link (DOI, arXiv, etc.)
        title: Optional paper title for Semantic Scholar search fallback

    Returns:
        StreamingResponse with the PDF content
    """
    if not url:
        raise HTTPException(status_code=400, detail="URL parameter is required")

    # URL decode the parameter
    decoded_url = unquote(url)
    print(f"[PDF Proxy] Processing URL: {decoded_url}")

    # Try to find actual PDF URL
    pdf_url = None

    # 1. Check if it's already an arXiv abstract URL - convert to PDF
    if "arxiv.org/abs/" in decoded_url:
        pdf_url = convert_arxiv_to_pdf_url(decoded_url)
        print(f"[PDF Proxy] Converted arXiv URL to: {pdf_url}")

    # 2. Check if it's already a direct PDF URL
    elif decoded_url.endswith(".pdf") or "arxiv.org/pdf/" in decoded_url:
        pdf_url = decoded_url
        print(f"[PDF Proxy] Using direct PDF URL: {pdf_url}")

    # 3. Check if it's a DOI URL - use Semantic Scholar
    elif "doi.org" in decoded_url or decoded_url.startswith("10."):
        doi = extract_doi_from_url(decoded_url)
        if doi:
            print(f"[PDF Proxy] Found DOI: {doi}, querying Semantic Scholar...")
            pdf_url = await get_pdf_url_from_semantic_scholar(doi, "doi")

    # 4. Try Semantic Scholar with title if provided and no PDF found yet
    if not pdf_url and title:
        print(f"[PDF Proxy] Trying Semantic Scholar search with title: {title}")
        pdf_url = await get_pdf_url_from_semantic_scholar(title, "title")

    # 5. If still no PDF URL, return error with helpful message
    if not pdf_url:
        raise HTTPException(
            status_code=404,
            detail="Could not find a PDF for this reference. It may not be open access.",
        )

    # Fetch the PDF
    print(f"[PDF Proxy] Fetching PDF from: {pdf_url}")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            response = await client.get(pdf_url)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to fetch PDF: {response.status_code}",
                )

            # Check if response is actually a PDF
            content_type = response.headers.get("content-type", "")
            if "pdf" not in content_type.lower() and not pdf_url.endswith(".pdf"):
                raise HTTPException(
                    status_code=400,
                    detail=f"URL does not point to a PDF file (content-type: {content_type})",
                )

            # Extract filename from URL or use default
            filename = pdf_url.split("/")[-1]
            if not filename.endswith(".pdf"):
                filename = "reference.pdf"

            print(
                f"[PDF Proxy] Successfully fetched PDF: {filename} ({len(response.content)} bytes)"
            )

            return StreamingResponse(
                iter([response.content]),
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "Content-Length": str(len(response.content)),
                },
            )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout while fetching PDF")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Error fetching PDF: {str(e)}")


@router.get("/resolve-pdf")
async def resolve_pdf_url(url: str, title: str = None):
    """
    Resolve a reference URL to a PDF URL without fetching the PDF.
    Useful for checking if a PDF is available before attempting to fetch.

    Args:
        url: The reference URL (DOI, arXiv, etc.)
        title: Optional paper title for fallback search

    Returns:
        JSON with pdf_url if found, or error message
    """
    if not url:
        raise HTTPException(status_code=400, detail="URL parameter is required")

    decoded_url = unquote(url)
    pdf_url = None
    source = None

    # 1. arXiv
    if "arxiv.org/abs/" in decoded_url:
        pdf_url = convert_arxiv_to_pdf_url(decoded_url)
        source = "arxiv"

    # 2. Direct PDF
    elif decoded_url.endswith(".pdf") or "arxiv.org/pdf/" in decoded_url:
        pdf_url = decoded_url
        source = "direct"

    # 3. DOI → Semantic Scholar
    elif "doi.org" in decoded_url or decoded_url.startswith("10."):
        doi = extract_doi_from_url(decoded_url)
        if doi:
            pdf_url = await get_pdf_url_from_semantic_scholar(doi, "doi")
            source = "semantic_scholar"

    # 4. Title search fallback
    if not pdf_url and title:
        pdf_url = await get_pdf_url_from_semantic_scholar(title, "title")
        source = "semantic_scholar_search"

    if pdf_url:
        return {"pdf_url": pdf_url, "source": source}
    else:
        return {"pdf_url": None, "error": "No open access PDF found"}
