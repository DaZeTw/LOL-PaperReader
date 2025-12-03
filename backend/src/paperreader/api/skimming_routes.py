"""
API routes for skimming/highlighting functionality.

Integrates with external highlighting API and provides caching.
"""

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from paperreader.services.qa.config import PipelineConfig
from paperreader.services.skimming import (
    process_paper_v2,
    get_highlights,
    process_and_highlight,
    get_preset_params,
    PresetType,
)

router = APIRouter()

# Get cache directory from config
cfg = PipelineConfig()
SKIMMING_CACHE_DIR = Path(cfg.data_dir) / ".skimming_cache"
SKIMMING_CACHE_DIR.mkdir(parents=True, exist_ok=True)


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
async def get_skimming_highlights(
    file_name: str,
    preset: Optional[PresetType] = "medium",
    alpha: Optional[float] = None,
    ratio: Optional[float] = None,
):
    """
    Get highlights for a processed paper (calls /get_highlight).

    The paper must be processed first using /process endpoint.

    Args:
        file_name: Name of the PDF file (with or without .pdf extension)
        preset: Preset mode (light/medium/heavy) - overridden by alpha/ratio if provided
        alpha: Custom alpha parameter (overrides preset)
        ratio: Custom ratio parameter (overrides preset)
    """
    # Remove .pdf extension if present - API expects stem only
    file_stem = Path(file_name).stem

    # Use preset values if alpha/ratio not provided
    if alpha is None or ratio is None:
        preset_params = get_preset_params(preset or "medium")
        alpha = alpha if alpha is not None else preset_params["alpha"]
        ratio = ratio if ratio is not None else preset_params["ratio"]

    try:
        result = await get_highlights(
            file_name=file_stem,
            alpha=alpha,
            ratio=ratio,
            cache_dir=SKIMMING_CACHE_DIR
        )
        return {"status": "ok", "file_name": file_name, "highlights": result.get("highlights", []), "preset": preset}
    except Exception as e:
        print(f"[SkimmingAPI] Error getting highlights: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get highlights: {str(e)}")


@router.post("/process-and-highlight")
async def process_and_get_highlights(
    file: UploadFile = File(...),
    preset: PresetType = Form("medium"),
    alpha: Optional[float] = Form(None),
    ratio: Optional[float] = Form(None),
):
    """
    Process a paper and get highlights in one call (calls /process_and_highlight).

    This is a convenience endpoint that combines processing and highlight retrieval.
    It's slower than calling /process and /get_highlights separately, but simpler.

    Args:
        file: PDF file to process
        preset: Preset mode (light/medium/heavy) - overridden by alpha/ratio if provided
        alpha: Custom alpha parameter (overrides preset)
        ratio: Custom ratio parameter (overrides preset)
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    # Use preset values if alpha/ratio not provided
    if alpha is None or ratio is None:
        preset_params = get_preset_params(preset)
        alpha = alpha if alpha is not None else preset_params["alpha"]
        ratio = ratio if ratio is not None else preset_params["ratio"]

    try:
        pdf_bytes = await file.read()

        # Remove .pdf extension - API expects stem only (e.g., "paper" not "paper.pdf")
        file_stem = Path(file.filename).stem

        result = await process_and_highlight(
            file_name=file_stem,
            pdf_file=pdf_bytes,
            alpha=alpha,
            ratio=ratio,
            cache_dir=SKIMMING_CACHE_DIR
        )
        return {
            "status": "ok",
            "file_name": file.filename,
            "highlights": result.get("highlights", []),
            "preset": preset,
            "alpha": alpha,
            "ratio": ratio
        }
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
