import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from paperreader.models.reference import ReferenceSchema, ReferenceUpdate
from paperreader.services.references.pdf_link_resolver import resolve_pdf_link
from paperreader.services.references.reference_service import ReferenceService
from pydantic import BaseModel

router = APIRouter(prefix="/references", tags=["references"])
reference_service = ReferenceService()


# Request/Response schemas for PDF link endpoint
class PdfLinkRequest(BaseModel):
    """Request schema for PDF link resolution."""

    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    title: Optional[str] = None
    authors: Optional[List[str]] = None
    year: Optional[int] = None


class PdfLinkResponse(BaseModel):
    """Response schema for PDF link resolution."""

    pdf_url: Optional[str] = None
    source: Optional[str] = None
    is_open_access: bool = False


@router.post("/extract", response_model=List[ReferenceSchema])
async def extract_references_from_pdf(
    file: UploadFile = File(...),
    document_id: str = Query(
        ..., description="Document ID to associate references with"
    ),
):
    """Extract references from PDF and save to database."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    temp_dir = Path(tempfile.mkdtemp(prefix="ref_extract_"))
    pdf_path = temp_dir / file.filename

    try:
        # Save uploaded PDF
        with pdf_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        # Extract and save references
        references = await reference_service.extract_and_save_references(
            pdf_path, document_id
        )

        return references

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to extract references: {str(e)}"
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/extract-annotations", response_model=List[Dict[str, Any]])
async def extract_and_match_annotations(
    file: UploadFile = File(...),
    document_id: str = Query(..., description="Document ID to match annotations with"),
):
    """
    Extract citation annotations from PDF and match with reference metadata.

    This endpoint:
    1. Extracts citation link annotations from the PDF
    2. Matches them with stored reference metadata using spatial proximity
    3. Returns enriched annotations with full reference information
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    temp_dir = Path(tempfile.mkdtemp(prefix="ann_extract_"))
    pdf_path = temp_dir / file.filename

    try:
        # Save uploaded PDF
        with pdf_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        # Extract annotations and match with references
        enriched_annotations = await reference_service.extract_and_match_annotations(
            pdf_path, document_id
        )

        return enriched_annotations

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to extract annotations: {str(e)}"
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.get("/document/{document_id}", response_model=List[ReferenceSchema])
async def get_document_references(
    document_id: str, skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500)
):
    """Get all references for a document."""
    references = await reference_service.get_document_references(
        document_id, skip, limit
    )
    return references


@router.get("/{reference_id}", response_model=ReferenceSchema)
async def get_reference(reference_id: str):
    """Get a single reference by ID."""
    reference = await reference_service.get_reference(reference_id)
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")
    return reference


@router.put("/{reference_id}", response_model=ReferenceSchema)
async def update_reference(reference_id: str, update_data: ReferenceUpdate):
    """Update a reference."""
    reference = await reference_service.update_reference(reference_id, update_data)
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")
    return reference


@router.delete("/{reference_id}")
async def delete_reference(reference_id: str):
    """Delete a reference."""
    success = await reference_service.delete_reference(reference_id)
    if not success:
        raise HTTPException(status_code=404, detail="Reference not found")
    return {"status": "deleted", "reference_id": reference_id}


@router.delete("/document/{document_id}")
async def delete_document_references(document_id: str):
    """Delete all references for a document."""
    count = await reference_service.delete_document_references(document_id)
    return {"status": "deleted", "document_id": document_id, "deleted_count": count}


@router.get("/search/", response_model=List[ReferenceSchema])
async def search_references(
    q: str = Query(..., min_length=1, description="Search query"),
    document_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    """Search references by title, authors, or venue."""
    references = await reference_service.search_references(q, document_id, skip, limit)
    return references


@router.get("/document/{document_id}/count")
async def get_reference_count(document_id: str):
    """Get reference count for a document."""
    count = await reference_service.get_reference_count(document_id)
    return {"document_id": document_id, "count": count}


@router.post("/pdf-link", response_model=PdfLinkResponse)
async def get_pdf_link(request: PdfLinkRequest):
    """
    Resolve PDF link from paper metadata.

    Searches multiple sources to find an open access PDF link:
    1. arXiv (if arxiv_id provided)
    2. Unpaywall (if DOI provided)
    3. Semantic Scholar (DOI or title search)
    4. CrossRef (if DOI provided)

    Returns the PDF URL, source, and open access status.
    """
    if not any([request.doi, request.arxiv_id, request.title]):
        raise HTTPException(
            status_code=400,
            detail="At least one of doi, arxiv_id, or title must be provided",
        )

    result = await resolve_pdf_link(
        doi=request.doi,
        arxiv_id=request.arxiv_id,
        title=request.title,
        authors=request.authors,
        year=request.year,
    )

    return PdfLinkResponse(
        pdf_url=result.pdf_url,
        source=result.source,
        is_open_access=result.is_open_access,
    )
