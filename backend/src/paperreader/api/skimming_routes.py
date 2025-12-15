"""
API routes for skimming/highlighting functionality.

Integrates with external highlighting API and provides caching.
"""

import os
from pathlib import Path
from typing import Optional, Tuple

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Query
from paperreader.services.qa.config import PipelineConfig
from paperreader.services.skimming import (
    process_paper_v2,
    get_highlights,
    process_and_highlight,
    get_preset_params,
    PresetType,
)
from paperreader.services.skimming.repository import (
    save_skimming_highlights,
    get_skimming_highlights as get_skimming_highlights_from_db,
)
from paperreader.services.documents.repository import get_document_by_id, to_object_id
from paperreader.services.documents.minio_client import download_bytes

router = APIRouter()

# Get cache directory from config
cfg = PipelineConfig()
SKIMMING_CACHE_DIR = Path(cfg.data_dir) / ".skimming_cache"
SKIMMING_CACHE_DIR.mkdir(parents=True, exist_ok=True)
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "pdf-documents")


async def _load_pdf_for_skimming(
    document_id: str,
    uploaded_file: UploadFile | None,
) -> Tuple[bytes, str]:
    """
    Load PDF bytes and filename either from uploaded file or from storage.
    """
    if uploaded_file:
        pdf_bytes = await uploaded_file.read()
        if not pdf_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        filename = uploaded_file.filename or f"{document_id}.pdf"
        return pdf_bytes, filename

    object_id = to_object_id(document_id)
    if object_id is None:
        raise HTTPException(status_code=400, detail=f"Invalid document_id: {document_id}")

    document = await get_document_by_id(object_id)
    if not document:
        raise HTTPException(status_code=404, detail=f"Document not found: {document_id}")

    stored_path = document.get("stored_path")
    if not stored_path:
        raise HTTPException(
            status_code=404,
            detail="Document file not found in storage. It may still be uploading."
        )

    try:
        pdf_bytes = await download_bytes(MINIO_BUCKET, stored_path)
    except Exception as exc:
        print(f"[SkimmingAPI] Failed to download PDF from MinIO: {exc}")
        raise HTTPException(status_code=500, detail="Failed to download document file") from exc

    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="Document file is empty")

    filename = document.get("original_filename") or f"{document_id}.pdf"
    return pdf_bytes, filename


@router.post("/process")
async def process_skimming_paper(
    file: UploadFile = File(...),
):
    """
    Process a paper for skimming (calls /process_paperv2).

    This endpoint should be called first to preprocess a paper.
    After processing, use /get_highlights to retrieve highlights.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    try:
        pdf_bytes = await file.read()

        # Remove .pdf extension - API expects stem only
        file_stem = Path(file.filename).stem

        result = await process_paper_v2(file_stem, pdf_bytes)
        return {"status": "ok", "file_name": file.filename, "file_stem": file_stem, "result": result}
    except Exception as e:
        print(f"[SkimmingAPI] Error processing paper: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process paper: {str(e)}")


@router.get("/highlights")
async def get_skimming_highlights_route(
    document_id: str = Query(..., description="Document ID (required)"),
    file_name: Optional[str] = Query(None, description="PDF filename (for API call if not in DB)"),
    preset: Optional[PresetType] = "medium",
    alpha: Optional[float] = None,
    ratio: Optional[float] = None,
):
    """
    Get highlights for a processed paper (calls /get_highlight).
    
    First checks MongoDB, then calls API if needed.

    The paper must be processed first using /process endpoint.

    Args:
        document_id: Document ID (required)
        file_name: Name of the PDF file (optional, used for API call if highlights not in DB)
        preset: Preset mode (light/medium/heavy) - overridden by alpha/ratio if provided
        alpha: Custom alpha parameter (overrides preset)
        ratio: Custom ratio parameter (overrides preset)
    """
    # Use preset values if alpha/ratio not provided
    if alpha is None or ratio is None:
        preset_params = get_preset_params(preset or "medium")
        alpha = alpha if alpha is not None else preset_params["alpha"]
        ratio = ratio if ratio is not None else preset_params["ratio"]

    # Try to get from MongoDB first
    db_highlights = await get_skimming_highlights_from_db(
        document_id=document_id,
        preset=preset or "medium"
    )
    if db_highlights and db_highlights.get("highlights"):
        print(f"[SkimmingAPI] Found highlights in MongoDB for document_id={document_id}, preset={preset}")
        return {
            "status": "ok",
            "file_name": db_highlights.get("file_name", file_name or ""),
            "highlights": db_highlights.get("highlights", []),
            "preset": preset
        }

    # If not in DB, need file_name to call API
    if not file_name:
        raise HTTPException(
            status_code=400,
            detail="file_name is required when highlights are not in database. Please process the paper first."
        )

    # Call API to get highlights
    file_stem = Path(file_name).stem
    try:
        result = await get_highlights(
            file_name=file_stem,
            alpha=alpha,
            ratio=ratio,
            cache_dir=None  # No file system cache - only use MongoDB
        )
        highlights = result.get("highlights", [])
        
        # Save to MongoDB
        if highlights:
            try:
                await save_skimming_highlights(
                    document_id=document_id,
                    file_name=file_name,
                    preset=preset or "medium",
                    alpha=alpha,
                    ratio=ratio,
                    highlights=highlights,
                )
                print(f"[SkimmingAPI] Saved {len(highlights)} highlights to MongoDB for document_id={document_id}")
            except Exception as save_exc:
                print(f"[SkimmingAPI] Warning: Failed to save highlights to MongoDB: {save_exc}")
                # Continue even if save fails
        
        return {"status": "ok", "file_name": file_name, "highlights": highlights, "preset": preset}
    except Exception as e:
        print(f"[SkimmingAPI] Error getting highlights: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get highlights: {str(e)}")


@router.post("/process-and-highlight")
async def process_and_get_highlights_route(
    document_id: str = Form(..., description="Document ID (required)"),
    preset: PresetType = Form("medium"),
    alpha: Optional[float] = Form(None),
    ratio: Optional[float] = Form(None),
    file: UploadFile | None = File(None),
):
    """
    Process a paper and get highlights in one call (calls /process_and_highlight).

    This is a convenience endpoint that combines processing and highlight retrieval.
    It's slower than calling /process and /get_highlights separately, but simpler.

    Args:
        file: PDF file to process
        document_id: Document ID (required)
        preset: Preset mode (light/medium/heavy) - overridden by alpha/ratio if provided
        alpha: Custom alpha parameter (overrides preset)
        ratio: Custom ratio parameter (overrides preset)
    """
    # Use preset values if alpha/ratio not provided
    if alpha is None or ratio is None:
        preset_params = get_preset_params(preset)
        alpha = alpha if alpha is not None else preset_params["alpha"]
        ratio = ratio if ratio is not None else preset_params["ratio"]

    # If highlights already exist for this document and preset, return them immediately
    try:
        existing = await get_skimming_highlights_from_db(document_id=document_id, preset=preset)
        if existing and existing.get("highlights"):
            print(f"[SkimmingAPI] Using existing highlights for document_id={document_id}, preset={preset}")
            return {
                "status": "ok",
                "file_name": existing.get("file_name") or (file.filename if file else ""),
                "highlights": existing.get("highlights", []),
                "preset": preset,
                "alpha": existing.get("alpha", alpha),
                "ratio": existing.get("ratio", ratio),
            }
    except Exception as db_exc:
        print(f"[SkimmingAPI] Warning: failed to load existing highlights: {db_exc}")

    try:
        pdf_bytes, filename = await _load_pdf_for_skimming(document_id=document_id, uploaded_file=file)
        file_stem = Path(filename).stem

        result = await process_and_highlight(
            file_name=file_stem,
            pdf_file=pdf_bytes,
            alpha=alpha,
            ratio=ratio,
            cache_dir=None  # No file system cache - only use MongoDB
        )
        highlights = result.get("highlights", [])
        
        # Save to MongoDB (required)
        if highlights:
            try:
                await save_skimming_highlights(
                    document_id=document_id,
                    file_name=filename,
                    preset=preset,
                    alpha=alpha,
                    ratio=ratio,
                    highlights=highlights,
                )
                print(f"[SkimmingAPI] Saved {len(highlights)} highlights to MongoDB for document_id={document_id}")
            except Exception as save_exc:
                print(f"[SkimmingAPI] Error: Failed to save highlights to MongoDB: {save_exc}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to save highlights to database: {str(save_exc)}"
                )
        
        return {
            "status": "ok",
            "file_name": file.filename,
            "highlights": highlights,
            "preset": preset,
            "alpha": alpha,
            "ratio": ratio
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[SkimmingAPI] Error processing and highlighting: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process and highlight: {str(e)}")


@router.get("/cache-status")
async def get_cache_status(file_name: str):
    """
    Check if highlights are cached for a given file.

    Returns cache status for all presets.
    """
    from paperreader.services.skimming.skimming_service import get_cache

    cache = get_cache(SKIMMING_CACHE_DIR)
    status = {}

    for preset_name, params in [("light", {"alpha": 0.3, "ratio": 0.3}),
                                 ("medium", {"alpha": 0.5, "ratio": 0.5}),
                                 ("heavy", {"alpha": 0.7, "ratio": 0.7})]:
        cached = cache.get(file_name, mode="sparse", alpha=params["alpha"], ratio=params["ratio"])
        status[preset_name] = {
            "cached": cached is not None,
            "highlight_count": len(cached.get("highlights", [])) if cached else 0
        }

    return {"status": "ok", "file_name": file_name, "cache_status": status}
