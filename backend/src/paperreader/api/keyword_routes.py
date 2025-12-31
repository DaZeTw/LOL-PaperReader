"""
API routes for keyword extraction using YAKE.
"""

import asyncio
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel

from paperreader.services.documents.repository import (
    get_document_by_id,
    to_object_id,
    update_document,
)
from paperreader.services.keywords import (
    ExtractedKeyword,
    YakeKeywordExtractor,
    extract_keywords_from_pdf,
    extract_keywords_from_text,
)
from paperreader.services.qa.config import PipelineConfig

router = APIRouter()


class KeywordExtractionRequest(BaseModel):
    """Request body for text-based keyword extraction."""
    text: str
    top_n: int = 20
    max_ngram: int = 3


class KeywordResponse(BaseModel):
    """Response model for keyword extraction."""
    status: str
    keywords: List[Dict[str, Any]]
    count: int
    method: str = "YAKE"
    document_id: Optional[str] = None


@router.post("/extract", response_model=KeywordResponse)
async def extract_keywords_from_upload(
    file: UploadFile = File(...),
    top_n: int = Query(20, description="Number of keywords to extract"),
    document_id: Optional[str] = Header(default=None, alias="X-Document-Id"),
):
    """
    Extract keywords from an uploaded PDF file using YAKE.

    Args:
        file: PDF file to extract keywords from
        top_n: Number of keywords to return (default: 20)
        document_id: Optional document ID to associate keywords with

    Returns:
        KeywordResponse with extracted keywords
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    temp_dir = Path(tempfile.mkdtemp(prefix="kw_extract_"))
    pdf_path = temp_dir / file.filename

    try:
        # Save uploaded PDF
        with pdf_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        print(f"[KEYWORDS] Processing {file.filename} for keyword extraction...")

        # Extract keywords using YAKE
        keywords = await asyncio.to_thread(
            extract_keywords_from_pdf, pdf_path, top_n
        )

        print(f"[KEYWORDS] Extracted {len(keywords)} keywords from {file.filename}")

        # Convert to dict for JSON response
        keywords_dict = [kw.to_dict() for kw in keywords]

        # Optionally save keywords to document
        if document_id:
            await _save_keywords_to_document(document_id, keywords_dict)

        return KeywordResponse(
            status="ok",
            keywords=keywords_dict,
            count=len(keywords_dict),
            method="YAKE",
            document_id=document_id,
        )

    except Exception as e:
        print(f"[KEYWORDS] Error extracting keywords: {e}")
        import traceback
        print(f"[KEYWORDS] Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"Failed to extract keywords: {str(e)}"
        )
    finally:
        # Cleanup temporary files
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as e:
            print(f"[KEYWORDS] Failed to cleanup temp dir: {e}")


@router.post("/extract-text", response_model=KeywordResponse)
async def extract_keywords_from_text_endpoint(
    request: KeywordExtractionRequest,
    document_id: Optional[str] = Header(default=None, alias="X-Document-Id"),
):
    """
    Extract keywords from text using YAKE.

    Args:
        request: Request body with text and extraction parameters
        document_id: Optional document ID to associate keywords with

    Returns:
        KeywordResponse with extracted keywords
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        print(f"[KEYWORDS] Extracting keywords from text ({len(request.text)} chars)...")

        # Create extractor with custom max_ngram
        extractor = YakeKeywordExtractor(max_ngram=request.max_ngram)
        keywords = await asyncio.to_thread(
            extractor.extract_from_text, request.text, request.top_n
        )

        print(f"[KEYWORDS] Extracted {len(keywords)} keywords from text")

        # Convert to dict for JSON response
        keywords_dict = [kw.to_dict() for kw in keywords]

        # Optionally save keywords to document
        if document_id:
            await _save_keywords_to_document(document_id, keywords_dict)

        return KeywordResponse(
            status="ok",
            keywords=keywords_dict,
            count=len(keywords_dict),
            method="YAKE",
            document_id=document_id,
        )

    except Exception as e:
        print(f"[KEYWORDS] Error extracting keywords from text: {e}")
        import traceback
        print(f"[KEYWORDS] Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"Failed to extract keywords: {str(e)}"
        )


@router.get("/document/{document_id}", response_model=KeywordResponse)
async def get_document_keywords(
    document_id: str,
    top_n: int = Query(20, description="Number of keywords to extract"),
    force_refresh: bool = Query(False, description="Force re-extraction even if cached"),
):
    """
    Get keywords for a document.

    If keywords are already cached, returns cached keywords.
    Otherwise, extracts keywords from the document's PDF.

    Args:
        document_id: Document ID to get keywords for
        top_n: Number of keywords to return (default: 20)
        force_refresh: Force re-extraction even if cached

    Returns:
        KeywordResponse with extracted keywords
    """
    try:
        object_id = to_object_id(document_id)
        if not object_id:
            raise HTTPException(status_code=400, detail="Invalid document ID")

        # Get document from database
        document = await get_document_by_id(object_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Check if we have cached keywords and don't need refresh
        if not force_refresh and document.get("yake_keywords"):
            cached_keywords = document["yake_keywords"]
            print(f"[KEYWORDS] Returning {len(cached_keywords)} cached keywords for document {document_id}")
            return KeywordResponse(
                status="ok",
                keywords=cached_keywords[:top_n],
                count=len(cached_keywords[:top_n]),
                method="YAKE",
                document_id=document_id,
            )

        # Need to extract keywords - find the PDF file
        cfg = PipelineConfig()
        uploads_dir = Path(cfg.data_dir) / "uploads"

        # Try to find PDF by filename from document
        filename = document.get("filename") or document.get("name")
        if not filename:
            raise HTTPException(
                status_code=400,
                detail="Document has no associated filename"
            )

        pdf_path = uploads_dir / filename
        if not pdf_path.exists():
            # Try with .pdf extension
            if not filename.lower().endswith(".pdf"):
                pdf_path = uploads_dir / f"{filename}.pdf"

        if not pdf_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"PDF file not found for document: {filename}"
            )

        print(f"[KEYWORDS] Extracting keywords from {pdf_path} for document {document_id}...")

        # Extract keywords
        keywords = await asyncio.to_thread(
            extract_keywords_from_pdf, pdf_path, top_n * 2  # Extract more for caching
        )

        # Convert to dict
        keywords_dict = [kw.to_dict() for kw in keywords]

        # Cache keywords in document
        await _save_keywords_to_document(document_id, keywords_dict)

        print(f"[KEYWORDS] Extracted and cached {len(keywords_dict)} keywords for document {document_id}")

        return KeywordResponse(
            status="ok",
            keywords=keywords_dict[:top_n],
            count=len(keywords_dict[:top_n]),
            method="YAKE",
            document_id=document_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[KEYWORDS] Error getting document keywords: {e}")
        import traceback
        print(f"[KEYWORDS] Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get keywords: {str(e)}"
        )


async def _save_keywords_to_document(
    document_id: str,
    keywords: List[Dict[str, Any]]
) -> None:
    """Save extracted keywords to document in database."""
    try:
        object_id = to_object_id(document_id)
        if not object_id:
            return

        await update_document(
            object_id,
            {
                "yake_keywords": keywords,
                "yake_keywords_updated_at": datetime.utcnow(),
            }
        )
        print(f"[KEYWORDS] Saved {len(keywords)} keywords to document {document_id}")
    except Exception as e:
        print(f"[KEYWORDS] Failed to save keywords to document: {e}")
