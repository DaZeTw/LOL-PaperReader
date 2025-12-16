import shutil
import tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from paperreader.models.reference import ReferenceSchema, ReferenceUpdate
from paperreader.services.references.reference_service import ReferenceService

router = APIRouter(prefix="/references", tags=["references"])
reference_service = ReferenceService()


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
