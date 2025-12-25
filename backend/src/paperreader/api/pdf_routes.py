import asyncio
import hashlib
import json
import mimetypes
import os
import re
import shutil
import tempfile
import threading
import time
import traceback
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from paperreader.api.summary_routes import (
    _extract_sections_from_pdf,
    _fill_summary_template,
    _generate_summary_template,
)
from paperreader.models.reference import (
    BoundingBoxSchema,
    CitationMentionSchema,
    ReferenceCreate,
)
from paperreader.services.documents.chunk_repository import replace_document_chunks
from paperreader.services.documents.minio_client import upload_bytes
from paperreader.services.documents.repository import (
    get_document_by_id,
    to_object_id,
    update_document,
    update_document_status,
)
from paperreader.services.documents.summary_repository import upsert_summary
from paperreader.services.parser.grobid_client import GrobidClient
from paperreader.services.parser.pdf_parser import parse_pdf_with_pymupdf
from paperreader.services.parser.pdf_parser_pymupdf import set_parse_cancel_flag
from paperreader.services.parser.reference_extractor import ReferenceExtractorService
from paperreader.services.qa.chunking import split_markdown_into_chunks
from paperreader.services.qa.config import PipelineConfig
from paperreader.services.qa.elasticsearch_client import index_chunks
from paperreader.services.qa.embeddings import get_embedder
from paperreader.services.qa.pipeline import (
    get_pipeline,
    pipeline_status,
    rebuild_pipeline,
    reset_pipeline_state,
    set_cancel_flag,
)
from paperreader.services.references import parse_references, update_reference_link

router = APIRouter()

# MinIO bucket configuration
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "pdf-documents")

# Directory for persisting debug markdown
DEBUG_CHUNKING_DIR = Path(__file__).resolve().parent.parent.parent / "debug_chunking"

# Global cancel flag to stop ongoing parse/embed/chunk operations
_PARSE_CANCEL_FLAG = threading.Event()

# Track files currently being parsed to avoid duplicate parsing
_PARSING_FILES: dict[str, threading.Lock] = {}  # Key: file path, Value: lock
_PARSING_LOCK = threading.Lock()  # Lock for _PARSING_FILES dict

# Simple in-memory job registry to track asynchronous PDF processing jobs
_PDF_JOBS: Dict[str, Dict[str, Any]] = {}
_PDF_JOBS_LOCK = threading.Lock()

_STATUS_EVENTS: Dict[str, asyncio.Event] = {}
_STATUS_EVENTS_LOCK = asyncio.Lock()
_LAST_STATUS_CHANGE: Dict[str, float] = {}


def _register_pdf_job(meta: Dict[str, Any]) -> str:
    job_id = str(uuid.uuid4())
    with _PDF_JOBS_LOCK:
        _PDF_JOBS[job_id] = {
            "status": "queued",
            "created_at": time.time(),
            **meta,
        }
    return job_id


def _update_pdf_job(job_id: str, **updates: Any) -> None:
    with _PDF_JOBS_LOCK:
        job = _PDF_JOBS.get(job_id)
        if not job:
            return
        job.update(**updates)


def _get_pdf_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _PDF_JOBS_LOCK:
        job = _PDF_JOBS.get(job_id)
        if not job:
            return None
        return job.copy()


async def _update_document_safe(
    document_id: Optional[str], updates: Dict[str, Any]
) -> None:
    if not document_id:
        return
    object_id = to_object_id(document_id)
    if not object_id:
        return
    await update_document(object_id, updates)


def _resolve_document_id(
    mapping: Optional[Dict[str, str]], pdf_path: Path
) -> Optional[str]:
    if not mapping:
        return None
    candidates = [pdf_path.name, pdf_path.stem]
    for key in candidates:
        if key in mapping:
            return mapping[key]
    return None


async def _notify_status_change(document_id: str):
    """Notify all SSE listeners that document status changed."""
    if not document_id:
        return

    async with _STATUS_EVENTS_LOCK:
        # Record timestamp of this change
        _LAST_STATUS_CHANGE[document_id] = time.time()

        # Fire event if any listeners exist
        if document_id in _STATUS_EVENTS:
            _STATUS_EVENTS[document_id].set()
            print(f"[EVENT] Notified status change for document {document_id}")
            # Give event loop a chance to process the notification
            await asyncio.sleep(0)
            _STATUS_EVENTS[document_id].clear()
        else:
            print(
                f"[EVENT] Recorded status change for document {document_id} (no active listeners)"
            )


async def _parse_and_chunk_pdf(
    pdf_path: Path,
    temp_output: Path,
    document_id: Optional[str],
    user_id: Optional[str],
    document_owner_cache: Dict[str, Optional[str]],
) -> Dict[str, Any]:
    """
    Complete PDF processing pipeline: Parse, chunk, embed, and index.
    This function handles ALL critical path operations to make document ready.

    Steps:
    1. Parse PDF with PyMuPDF
    2. Upload assets (images, tables) to MinIO
    3. Create chunks from markdown
    4. Save chunks to MongoDB
    5. Generate embeddings
    6. Index to Elasticsearch

    Returns:
        Dict containing:
        - chunks: List of processed chunks
        - metadata: PDF metadata
        - doc_key: Document key
        - result: Parse result with assets
        - embedding_count: Number of embeddings generated
        - elapsed: Total processing time
    """
    print(f"[PDF] 🔍 Starting complete PDF processing for {pdf_path.name}...")
    start_time = time.time()

    # Step 1: Parse PDF
    parse_start = time.time()
    result = await asyncio.to_thread(parse_pdf_with_pymupdf, pdf_path, temp_output)
    parse_elapsed = time.time() - parse_start
    print(
        f"[PDF] ✅ Parse completed for {pdf_path.name} in {parse_elapsed:.2f}s "
        f"(images={len(result.get('image_files') or [])}, "
        f"tables={len(result.get('table_files') or [])})"
    )

    if _PARSE_CANCEL_FLAG.is_set():
        raise RuntimeError("Operation was cancelled")

    markdown_content = result.get("markdown_content")
    if not markdown_content:
        raise ValueError(f"Missing markdown content for {pdf_path.name}")

    metadata = result.get("metadata") or {}
    metadata.setdefault("total_pages", result.get("num_pages") or 0)
    result["metadata"] = metadata

    doc_key = pdf_path.stem
    owner_user_id = user_id

    # Get document owner
    if document_id:
        cached_owner = document_owner_cache.get(document_id)
        if cached_owner is None and document_id not in document_owner_cache:
            owner_object_id = to_object_id(document_id)
            if owner_object_id:
                try:
                    doc_record = await get_document_by_id(owner_object_id)
                    cached_owner = doc_record.get("user_id") if doc_record else None
                except Exception as exc:
                    print(
                        f"[PDF] ⚠️ Failed to load document {document_id} for user lookup: {exc}"
                    )
                    cached_owner = None
            else:
                cached_owner = None
            document_owner_cache[document_id] = cached_owner
        owner_user_id = document_owner_cache.get(document_id, owner_user_id)

    # Step 2: Upload assets to MinIO
    asset_identifier = document_id or doc_key
    if owner_user_id:
        asset_base_prefix = f"{owner_user_id}/document/{asset_identifier}/"
    else:
        asset_base_prefix = f"shared/document/{asset_identifier}/"
    asset_prefix = asset_base_prefix.rstrip("/") + "/"

    # Process images
    image_lookup: Dict[str, Dict[str, Any]] = {}
    for image_meta in result.get("image_files") or []:
        rel_path = image_meta.get("relative_path") or image_meta.get("filename") or ""
        rel_path = rel_path.replace("\\", "/").lstrip("./")
        if not rel_path:
            continue

        src_path = Path(image_meta.get("local_path") or "")
        if not src_path.exists():
            continue

        object_name = f"{asset_prefix}{rel_path}"
        mime_type, _ = mimetypes.guess_type(src_path.name)
        try:
            await upload_bytes(
                MINIO_BUCKET,
                object_name,
                src_path.read_bytes(),
                mime_type or "image/png",
            )
        except Exception as exc:
            print(f"[PDF] ⚠️ Failed to upload image {src_path} to Minio: {exc}")
            continue

        image_lookup[rel_path] = {
            "relative_path": rel_path,
            "object_name": object_name,
            "bucket": MINIO_BUCKET,
            "page": image_meta.get("page"),
            "position": image_meta.get("position"),
            "caption": image_meta.get("caption"),
            "figure_id": image_meta.get("image_id") or image_meta.get("figure_id"),
            "local_path": str(src_path),
        }

    # Process tables
    table_lookup: Dict[str, Dict[str, Any]] = {}
    for table_meta in result.get("table_files") or []:
        rel_path = table_meta.get("relative_path") or table_meta.get("filename") or ""
        rel_path = rel_path.replace("\\", "/").lstrip("./")
        if not rel_path:
            continue

        src_path = Path(table_meta.get("local_path") or "")
        if not src_path.exists():
            continue

        object_name = f"{asset_prefix}{rel_path}"
        mime_type, _ = mimetypes.guess_type(src_path.name)
        try:
            await upload_bytes(
                MINIO_BUCKET,
                object_name,
                src_path.read_bytes(),
                mime_type or "text/csv",
            )
        except Exception as exc:
            print(f"[PDF] ⚠️ Failed to upload table {src_path} to Minio: {exc}")
            continue

        table_lookup[rel_path] = {
            "relative_path": rel_path,
            "object_name": object_name,
            "bucket": MINIO_BUCKET,
            "preview": table_meta.get("preview"),
            "label": table_meta.get("table_id"),
            "local_path": str(src_path),
        }

    result["image_files"] = list(image_lookup.values())
    result["table_files"] = list(table_lookup.values())
    result["assets"] = {
        "images": result["image_files"],
        "tables": result["table_files"],
    }

    # Step 3: Save markdown for debugging
    debug_md_path = DEBUG_CHUNKING_DIR / f"{doc_key}_chunking_debug.md"
    debug_md_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(debug_md_path, "w", encoding="utf-8") as f:
            f.write(markdown_content)
        print(f"[PDF] 💾 Saved markdown for debugging: {debug_md_path}")
    except Exception as exc:
        print(f"[PDF] ⚠️ Failed to save debug markdown: {exc}")

    # Step 4: Chunk the document
    chunk_start = time.time()
    chunks = await asyncio.to_thread(
        split_markdown_into_chunks,
        markdown_content,
        doc_key,
        str(pdf_path),
        assets={"images": image_lookup, "tables": table_lookup},
    )
    chunk_elapsed = time.time() - chunk_start
    print(
        f"[PDF] ✅ Chunked {pdf_path.name} into {len(chunks)} chunks in {chunk_elapsed:.2f}s"
    )

    if not chunks:
        raise ValueError(f"No chunks created for {pdf_path.name}")

    # Step 5: Enrich chunks with asset references
    for idx, chunk in enumerate(chunks):
        chunk_id = hashlib.sha1(
            f"{doc_key}:{idx}:{chunk.get('text', '')[:200]}".encode("utf-8")
        ).hexdigest()
        chunk["chunk_id"] = chunk_id
        chunk["doc_key"] = doc_key
        chunk["document_id"] = document_id

        # Enrich images
        enriched_images: List[Dict[str, Any]] = []
        for img_meta in chunk.get("images") or []:
            key = (img_meta.get("data") or "").replace("\\", "/").lstrip("./")
            lookup = image_lookup.get(key) or image_lookup.get(
                f"images/{Path(key).name}"
            )
            if lookup:
                enriched_images.append(
                    {
                        "caption": lookup.get("caption") or img_meta.get("caption"),
                        "figure_id": lookup.get("figure_id")
                        or img_meta.get("figure_id"),
                        "bucket": lookup.get("bucket"),
                        "object_name": lookup.get("object_name"),
                        "relative_path": lookup.get("relative_path"),
                        "page": lookup.get("page"),
                        "position": lookup.get("position"),
                        "data": lookup.get("object_name"),
                    }
                )
            else:
                enriched_images.append(img_meta)
        if enriched_images:
            chunk["images"] = enriched_images
        else:
            chunk.pop("images", None)

        # Enrich tables
        enriched_tables: List[Dict[str, Any]] = []
        for tbl_meta in chunk.get("tables") or []:
            key = (
                (tbl_meta.get("data") or tbl_meta.get("relative_path") or "")
                .replace("\\", "/")
                .lstrip("./")
            )
            lookup = table_lookup.get(key) or table_lookup.get(
                f"tables/{Path(key).name}"
            )
            if lookup:
                enriched_tables.append(
                    {
                        "label": lookup.get("label") or tbl_meta.get("label"),
                        "bucket": lookup.get("bucket"),
                        "object_name": lookup.get("object_name"),
                        "relative_path": lookup.get("relative_path"),
                        "data": lookup.get("object_name"),
                        "preview": lookup.get("preview"),
                    }
                )
            else:
                enriched_tables.append(tbl_meta)
        if enriched_tables:
            chunk["tables"] = enriched_tables
        else:
            chunk.pop("tables", None)

    # Step 6: Save chunks to MongoDB
    print(f"[PDF] 💾 Saving {len(chunks)} chunks to MongoDB for {pdf_path.name}...")
    mongo_start = time.time()
    await replace_document_chunks(
        document_id=document_id,
        chunks=chunks,
    )
    mongo_elapsed = time.time() - mongo_start
    print(
        f"[PDF] ✅ Saved {len(chunks)} chunks to MongoDB in {mongo_elapsed:.2f}s for {pdf_path.name}"
    )

    # Step 7: Generate embeddings
    print(
        f"[PDF] 🔢 Generating embeddings for {len(chunks)} chunks for {pdf_path.name}..."
    )
    embed_start = time.time()
    embedder = get_embedder(None)

    try:
        chunk_embeddings = await asyncio.to_thread(
            embedder.embed_chunks,
            chunks,
            doc_key,
        )
        embed_elapsed = time.time() - embed_start
        print(
            f"[PDF] ✅ Generated {len(chunk_embeddings)} embeddings in {embed_elapsed:.2f}s for {pdf_path.name}"
        )
    except Exception as embed_exc:
        embed_elapsed = time.time() - embed_start
        print(
            f"[PDF] ❌ Failed to generate embeddings for {pdf_path.name} (took {embed_elapsed:.2f}s): {embed_exc}"
        )
        import traceback

        print(f"[PDF] Traceback: {traceback.format_exc()}")
        raise  # Re-raise to stop processing

    # Step 8: Index to Elasticsearch
    print(
        f"[PDF] 📤 Indexing {len(chunks)} chunks to Elasticsearch for {pdf_path.name}..."
    )
    es_start = time.time()

    try:
        await index_chunks(
            document_id=document_id,
            chunks=chunks,
            embeddings=chunk_embeddings,
        )
        es_elapsed = time.time() - es_start
        print(
            f"[PDF] ✅ Indexed {len(chunks)} chunks to Elasticsearch in {es_elapsed:.2f}s for {pdf_path.name}"
        )
    except Exception as es_exc:
        es_elapsed = time.time() - es_start
        print(
            f"[PDF] ⚠️ Failed to index chunks to Elasticsearch for {pdf_path.name} (took {es_elapsed:.2f}s): {es_exc}"
        )
        import traceback

        print(f"[PDF] Traceback: {traceback.format_exc()}")
        # Don't fail - chunks are in MongoDB, can retry indexing later

    total_elapsed = time.time() - start_time
    print(
        f"[PDF] ✅ Complete processing finished for {pdf_path.name} in {total_elapsed:.2f}s"
    )

    if document_id:
        await _update_document_safe(
            document_id,
            {
                "embedding_status": "ready",
                "embedding_updated_at": datetime.utcnow(),
                "status": "ready",
            },
        )
        # Notify SSE listeners
        await _notify_status_change(document_id)

    return {
        "chunks": chunks,
        "metadata": metadata,
        "doc_key": doc_key,
        "result": result,
        "embedding_count": len(chunk_embeddings),
        "elapsed": total_elapsed,
        "timings": {
            "parse": parse_elapsed,
            "chunk": chunk_elapsed,
            "mongo": mongo_elapsed,
            "embed": embed_elapsed,
            "elasticsearch": es_elapsed,
            "total": total_elapsed,
        },
    }


async def _process_summary(
    pdf_path: Path,
    document_id: Optional[str],
) -> Dict[str, Any]:
    """
    Generate summary for a PDF document.
    This is independent of the main parsing pipeline.

    Steps:
    1. Extract sections from PDF
    2. Generate summary template based on section names
    3. Fill template with actual content
    4. Save summary to database

    Returns:
        Dict containing:
        - status: "success" or "error"
        - section_count: Number of sections found
        - elapsed: Processing time
    """
    print(f"[SUMMARY] 📝 Starting summary generation for {pdf_path.name}...")
    start_time = time.time()

    try:
        # Update document status to processing
        if document_id:
            await _update_document_safe(
                document_id,
                {
                    "summary_status": "processing",
                },
            )

        # Step 1: Extract sections from PDF
        sections = await asyncio.to_thread(_extract_sections_from_pdf, pdf_path)

        if not sections:
            raise ValueError("No sections found in PDF")

        section_names = [s["title"] for s in sections if s.get("type") == "section"]

        if not section_names:
            raise ValueError("No section titles found")

        print(f"[SUMMARY] Found {len(section_names)} sections in {pdf_path.name}")

        # Step 2: Generate summary template
        important_sections, summary_template = await _generate_summary_template(
            section_names
        )

        print(
            f"[SUMMARY] Generated template with {len(important_sections)} important sections"
        )

        # Step 3: Fill template with content
        filled_summary = await _fill_summary_template(
            summary_template, important_sections, sections
        )

        # Step 4: Save to database
        if document_id:
            doc_object_id = to_object_id(document_id)
            if doc_object_id:
                await upsert_summary(
                    doc_object_id,
                    filled_summary,
                    important_sections,
                )
                print(f"[SUMMARY] Saved summary to database for document {document_id}")

        elapsed = time.time() - start_time
        print(
            f"[SUMMARY] ✅ Generated and saved summary for {pdf_path.name} "
            f"in {elapsed:.2f}s"
        )

        # Update document status to ready
        if document_id:
            await _update_document_safe(
                document_id,
                {
                    "summary_status": "ready",
                    "summary_updated_at": datetime.utcnow(),
                },
            )
            await _notify_status_change(document_id)

        return {
            "status": "success",
            "section_count": len(sections),
            "important_sections": len(important_sections),
            "elapsed": elapsed,
        }

    except Exception as exc:
        elapsed = time.time() - start_time
        print(
            f"[SUMMARY] ❌ Failed to generate summary for {pdf_path.name} "
            f"(took {elapsed:.2f}s): {exc}"
        )
        import traceback

        print(f"[SUMMARY] Traceback: {traceback.format_exc()}")

        # Update document status to error
        if document_id:
            await _update_document_safe(
                document_id,
                {
                    "summary_status": "error",
                    "summary_error": str(exc),
                },
            )
            await _notify_status_change(document_id)

        return {
            "status": "error",
            "error": str(exc),
            "elapsed": elapsed,
        }


async def _process_references(
    pdf_path: Path,
    document_id: Optional[str],
) -> Dict[str, Any]:
    """
    Extract references from a PDF document using ReferenceService.
    This is independent of the main parsing pipeline.

    Steps:
    1. Use ReferenceService to extract references from PDF
    2. Service handles GROBID processing and database storage
    3. Return result summary

    Returns:
        Dict containing:
        - status: "success" or "error"
        - reference_count: Number of references found
        - elapsed: Processing time
    """
    print(f"[REFERENCE] 📚 Starting reference extraction for {pdf_path.name}...")
    start_time = time.time()

    try:
        # Update document status to processing
        if document_id:
            await _update_document_safe(
                document_id,
                {
                    "reference_status": "processing",
                },
            )

        # Import ReferenceService
        from paperreader.services.references.reference_service import ReferenceService

        # Initialize service
        reference_service = ReferenceService()

        print(f"[REFERENCE] Processing {pdf_path.name} with ReferenceService...")

        # Extract and save references using the service
        # This handles GROBID processing and database storage
        references = await reference_service.extract_and_save_references(
            pdf_path=pdf_path,
            document_id=document_id,
        )

        reference_count = len(references)

        print(
            f"[REFERENCE] Service extracted {reference_count} references for {pdf_path.name}"
        )

        elapsed = time.time() - start_time
        print(
            f"[REFERENCE] ✅ Extracted and saved {reference_count} references "
            f"for {pdf_path.name} in {elapsed:.2f}s"
        )

        # Update document status to ready
        if document_id:
            await _update_document_safe(
                document_id,
                {
                    "reference_status": "ready",
                    "reference_count": reference_count,
                    "reference_updated_at": datetime.utcnow(),
                },
            )
            await _notify_status_change(document_id)

        return {
            "status": "success",
            "reference_count": reference_count,
            "elapsed": elapsed,
        }

    except Exception as exc:
        elapsed = time.time() - start_time
        print(
            f"[REFERENCE] ❌ Failed to extract references for {pdf_path.name} "
            f"(took {elapsed:.2f}s): {exc}"
        )
        import traceback

        print(f"[REFERENCE] Traceback: {traceback.format_exc()}")

        # Update document status to error
        if document_id:
            await _update_document_safe(
                document_id,
                {
                    "reference_status": "error",
                    "reference_error": str(exc),
                },
            )
            await _notify_status_change(document_id)

        return {
            "status": "error",
            "error": str(exc),
            "elapsed": elapsed,
        }


async def _process_skimming(
    pdf_path: Path,
    document_id: Optional[str],
) -> Dict[str, Any]:
    """
    Process skimming highlights for a PDF document.
    This is independent of the main parsing pipeline.

    Steps:
    1. Read PDF file bytes
    2. Call skimming service to process and get highlights
    3. Save highlights to database

    Returns:
        Dict containing:
        - status: "success" or "error"
        - highlight_count: Number of highlights found
        - elapsed: Processing time
    """
    print(f"[SKIMMING] 📄 Starting skimming processing for {pdf_path.name}...")
    start_time = time.time()

    try:
        # Update document status to processing
        if document_id:
            await _update_document_safe(
                document_id,
                {
                    "skimming_status": "processing",
                },
            )

        # Step 1: Read PDF file bytes
        pdf_bytes = pdf_path.read_bytes()
        file_stem = pdf_path.stem

        # Step 2: Process and get highlights (using default medium preset)
        from paperreader.services.skimming.repository import save_skimming_highlights
        from paperreader.services.skimming.skimming_service import (
            get_preset_params,
            process_and_highlight,
        )

        preset = "medium"
        preset_params = get_preset_params(preset)
        alpha = preset_params["alpha"]
        ratio = preset_params["ratio"]

        result = await process_and_highlight(
            file_name=file_stem,
            pdf_file=pdf_bytes,
            alpha=alpha,
            ratio=ratio,
            cache_dir=None,  # No file system cache - only use MongoDB
        )

        highlights = result.get("highlights", [])

        # Step 3: Save to database
        if document_id and highlights:
            await save_skimming_highlights(
                document_id=document_id,
                file_name=pdf_path.name,
                preset=preset,
                alpha=alpha,
                ratio=ratio,
                highlights=highlights,
            )
            print(
                f"[SKIMMING] Saved {len(highlights)} highlights to database for document {document_id}"
            )

        elapsed = time.time() - start_time
        print(
            f"[SKIMMING] ✅ Processed skimming for {pdf_path.name} "
            f"({len(highlights)} highlights) in {elapsed:.2f}s"
        )

        # Update document status to ready
        if document_id:
            await _update_document_safe(
                document_id,
                {
                    "skimming_status": "ready",
                    "skimming_updated_at": datetime.utcnow(),
                },
            )
            await _notify_status_change(document_id)

        return {
            "status": "success",
            "highlight_count": len(highlights),
            "elapsed": elapsed,
        }

    except Exception as exc:
        elapsed = time.time() - start_time
        print(
            f"[SKIMMING] ❌ Failed to process skimming for {pdf_path.name} "
            f"(took {elapsed:.2f}s): {exc}"
        )
        import traceback

        print(f"[SKIMMING] Traceback: {traceback.format_exc()}")

        # Update document status to error
        if document_id:
            await _update_document_safe(
                document_id,
                {
                    "skimming_status": "error",
                    "skimming_error": str(exc),
                },
            )
            await _notify_status_change(document_id)

        return {
            "status": "error",
            "error": str(exc),
            "elapsed": elapsed,
        }

#Under development
async def _process_metadata(
    pdf_path: Path,
    document_id: Optional[str],
) -> Dict[str, Any]:
    """
    Process metadata for a PDF document.
    This is independent of the main parsing pipeline.

    Steps:
    1. Read PDF file bytes
    2. Call metadata service to process and get metadata
    3. Save metadata to database

    Returns:
        Dict containing:
        - status: "success" or "error"
        - metadata: Metadata dictionary
        - elapsed: Processing time
    
    Currently is placeholder (print hello)
    """
    print(f"[METADATA] 📄 Starting metadata processing for {pdf_path.name}...")
    start_time = time.time()
    try:
        # Update document status to processing
        if document_id:
            await _update_document_safe(
                document_id,
                {
                    "metadata_status": "processing",
                },
            )

        # Step 1: Read PDF file bytes
        pdf_bytes = pdf_path.read_bytes()
        file_stem = pdf_path.stem

        # Step 2: Actual domain logic but placeholder for now
        # TODO: create paperreader.services.metadata.metadata_service and import process_metadata (done)
        # TODO: check

        from paperreader.services.metadata.metadata_service import process_metadata,save_metadata
        from paperreader.services.parser.pdf_parser_pymupdf import get_metadata_from_pdf_with_pymupdf
        pymupdf_metadata = get_metadata_from_pdf_with_pymupdf(pdf_path)
        metadata = await process_metadata(pdf_bytes, file_stem)
        
        # Merge keywords from PyMuPDF if not present or empty
        if not metadata.get("keywords"):
             metadata["keywords"] = pymupdf_metadata.get("keywords", "")

        # Fallback for Year if missing
        if not metadata.get("year"):
            creation_date = pymupdf_metadata.get("creation_date", "")
            if creation_date and str(creation_date).startswith("D:"):
                # Parse format D:YYYYMMDD...
                try:
                    metadata["year"] = creation_date[2:6]
                except IndexError:
                    pass
            elif creation_date:
                 # Try taking first 4 chars if it looks like a year
                 metadata["year"] = str(creation_date)[:4]
        

        # Step 3: Save to database
        if document_id:
            # await save_metadata(
            #     document_id=document_id,
            #     metadata=metadata
            # )
            await _update_document_safe(
                document_id,
                metadata
            )
            print(
                f"[METADATA] Saved metadata to database for document {document_id}"
            )

        elapsed = time.time() - start_time
        print(
            f"[METADATA] ✅ Processed metadata for {pdf_path.name} "
            f"in {elapsed:.2f}s"
        )
        # Update document status to ready
        if document_id:
            await _update_document_safe(
                document_id,
                {
                    "metadata_status": "ready",
                    "metadata_updated_at": datetime.utcnow(),
                },
            )
            await _notify_status_change(document_id)

        return {
            "status": "success",
            "elapsed": elapsed,
        }

    except Exception as exc:
        elapsed = time.time() - start_time
        print(
            f"[METADATA] ❌ Failed to process metadata for {pdf_path.name} "
            f"(took {elapsed:.2f}s): {exc}"
        )
        import traceback

        print(f"[METADATA] Traceback: {traceback.format_exc()}")

        # Update document status to error
        if document_id:
            await _update_document_safe(
                document_id,
                {
                    "metadata_status": "error",
                    "metadata_error": str(exc),
                },
            )
            await _notify_status_change(document_id)

        return {
            "status": "error",
            "error": str(exc),
            "elapsed": elapsed,
        }



async def _process_saved_pdfs(
    saved_paths: List[Path],
    *,
    document_map: Optional[Dict[str, str]] = None,
    job_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Main orchestrator for PDF processing.
    Launches all processing tasks in parallel for each PDF.

    For each PDF, runs these tasks concurrently:
    1. Parse, chunk, embed, and index (main processing)
    2. Generate summary (independent)
    3. Extract references (independent)
    4. Process skimming highlights (independent)
    5. Updated process metadata (independent)

    All five tasks run in parallel and don't block each other.
    """
    if not saved_paths:
        payload = {"status": "ok", "count": 0, "results": []}
        if job_id:
            _update_pdf_job(job_id, status="completed", result=payload)
        return payload

    _PARSE_CANCEL_FLAG.clear()

    parse_results: List[Dict[str, Any]] = []
    document_updates: Dict[str, Dict[str, Any]] = {}
    all_document_ids = set(document_map.values()) if document_map else set()
    document_owner_cache: Dict[str, Optional[str]] = {}

    try:
        for index, pdf_path in enumerate(saved_paths, start=1):
            if _PARSE_CANCEL_FLAG.is_set():
                raise RuntimeError("Operation was cancelled")

            # Lock management
            pdf_key = str(pdf_path.resolve())
            with _PARSING_LOCK:
                if pdf_key not in _PARSING_FILES:
                    _PARSING_FILES[pdf_key] = threading.Lock()
                file_lock = _PARSING_FILES[pdf_key]

            acquired = file_lock.acquire(blocking=False)
            if not acquired:
                print(
                    f"[PDF] ⏳ {pdf_path.name} is already being parsed, waiting briefly..."
                )
                for _ in range(10):
                    await asyncio.sleep(0.1)
                    if file_lock.acquire(blocking=False):
                        acquired = True
                        break
                if not acquired:
                    print(
                        f"[PDF] ⚠️ {pdf_path.name} is still being parsed elsewhere, skipping duplicate"
                    )
                    continue

            temp_output = Path(tempfile.mkdtemp(prefix=f"parsed_{pdf_path.stem}_"))

            try:
                print(f"[PDF] [{index}/{len(saved_paths)}] Processing {pdf_path.name}")

                document_id = _resolve_document_id(document_map, pdf_path)
                if document_id:
                    all_document_ids.add(document_id)

                    # Set initial status for all tasks
                    await _update_document_safe(
                        document_id,
                        {
                            "status": "processing",
                            "embedding_status": "processing",
                            "summary_status": "processing",
                            "reference_status": "processing",
                            "skimming_status": "processing",
                            "metadata_status": "processing",
                        },
                    )

                # Launch all three tasks in parallel - they don't block each other
                print(f"[PDF] 🚀 Launching parallel tasks for {pdf_path.name}...")

                parse_task = asyncio.create_task(
                    _parse_and_chunk_pdf(
                        pdf_path=pdf_path,
                        temp_output=temp_output,
                        document_id=document_id,
                        user_id=user_id,
                        document_owner_cache=document_owner_cache,
                    )
                )

                summary_task = asyncio.create_task(
                    _process_summary(pdf_path, document_id)
                )

                reference_task = asyncio.create_task(
                    _process_references(pdf_path, document_id)
                )

                skimming_task = asyncio.create_task(
                    _process_skimming(pdf_path, document_id)
                )
                metadata_task = asyncio.create_task(
                    _process_metadata(pdf_path, document_id)
                )
                # Wait for all tasks to complete (don't fail if one fails)
                all_results = await asyncio.gather(
                    parse_task,
                    summary_task,
                    reference_task,
                    skimming_task,
                    metadata_task,
                    return_exceptions=True,
                )

                # Extract results
                parse_result = (
                    all_results[0]
                    if not isinstance(all_results[0], Exception)
                    else {"status": "error", "error": str(all_results[0])}
                )
                summary_result = (
                    all_results[1]
                    if not isinstance(all_results[1], Exception)
                    else {"status": "error", "error": str(all_results[1])}
                )
                reference_result = (
                    all_results[2]
                    if not isinstance(all_results[2], Exception)
                    else {"status": "error", "error": str(all_results[2])}
                )
                skimming_result = (
                    all_results[3]
                    if not isinstance(all_results[3], Exception)
                    else {"status": "error", "error": str(all_results[3])}
                )
                metadata_result = (
                    all_results[4]
                    if not isinstance(all_results[4], Exception)
                    else {"status": "error", "error": str(all_results[4])}
                )

                # Log results for each task
                if isinstance(parse_result, dict) and "chunks" in parse_result:
                    chunks = parse_result["chunks"]
                    metadata = parse_result["metadata"]
                    result = parse_result["result"]

                    print(
                        f"[PDF] ✅ Parse/chunk/embed/index completed for {pdf_path.name} "
                        f"({len(chunks)} chunks, {parse_result.get('embedding_count', 0)} embeddings)"
                    )

                    # Update document with main processing results
                    if document_id:
                        fallback_title = pdf_path.stem
                        resolved_title = metadata.get("title") or fallback_title
                        if not str(resolved_title).strip():
                            resolved_title = fallback_title

                        keywords_value = metadata.get("keywords")
                        if isinstance(keywords_value, str):
                            keywords_list = [
                                k.strip()
                                for k in re.split(r"[;,]", keywords_value)
                                if k.strip()
                            ]
                        elif isinstance(keywords_value, list):
                            keywords_list = [
                                str(k).strip() for k in keywords_value if str(k).strip()
                            ]
                        else:
                            keywords_list = []

                        total_pages = (
                            metadata.get("total_pages") or result.get("num_pages") or 0
                        )

                        await _update_document_safe(
                            document_id,
                            {
                                "status": "ready",
                                # "num_pages": total_pages,
                                # "total_pages": total_pages,
                                # these 3 field will be handle by metadata module
                                # "title": resolved_title,
                                # "author": metadata.get("author") or "",
                                # "subject": metadata.get("subject") or "",
                                # "keywords": keywords_list,
                                "chunk_count": len(chunks),
                                "metadata": metadata,
                            },
                        )
                else:
                    print(
                        f"[PDF] ❌ Parse/chunk/embed/index failed for {pdf_path.name}: "
                        f"{parse_result.get('error', 'Unknown error')}"
                    )
                    result = {}
                    metadata = {}
                    chunks = []

                if summary_result.get("status") == "success":
                    print(
                        f"[PDF] ✅ Summary completed for {pdf_path.name} "
                        f"({summary_result.get('section_count', 0)} sections)"
                    )
                else:
                    print(
                        f"[PDF] ⚠️ Summary failed for {pdf_path.name}: "
                        f"{summary_result.get('error', 'Unknown error')}"
                    )

                if reference_result.get("status") == "success":
                    print(
                        f"[PDF] ✅ References completed for {pdf_path.name} "
                        f"({reference_result.get('reference_count', 0)} references)"
                    )
                else:
                    print(
                        f"[PDF] ⚠️ References failed for {pdf_path.name}: "
                        f"{reference_result.get('error', 'Unknown error')}"
                    )

                if skimming_result.get("status") == "success":
                    print(
                        f"[PDF] ✅ Skimming completed for {pdf_path.name} "
                        f"({skimming_result.get('highlight_count', 0)} highlights)"
                    )
                else:
                    print(
                        f"[PDF] ⚠️ Skimming failed for {pdf_path.name}: "
                        f"{skimming_result.get('error', 'Unknown error')}"
                    )

                if metadata_result.get("status") == "success":
                    print(f"[PDF] ✅ Metadata processed for {pdf_path.name}")
                else:
                    print(
                        f"[PDF] ⚠️ Metadata failed for {pdf_path.name}: "
                        f"{metadata_result.get('error', 'Unknown error')}"
                    )

                print(
                    f"[PDF] ✅ COMPLETED all processing for {pdf_path.name} "
                    f"(PDF {index}/{len(saved_paths)})"
                )

                parse_results.append(
                    {
                        "pdf": str(pdf_path),
                        "outputs": (
                            result
                            if isinstance(parse_result, dict)
                            and "result" in parse_result
                            else {}
                        ),
                        "document_id": document_id,
                        "timings": (
                            parse_result.get("timings", {})
                            if isinstance(parse_result, dict)
                            else {}
                        ),
                        "embedding_count": (
                            parse_result.get("embedding_count", 0)
                            if isinstance(parse_result, dict)
                            else 0
                        ),
                        "summary_result": summary_result,
                        "reference_result": reference_result,
                        "skimming_result": skimming_result,
                        "metadata_result": metadata_result,
                    }
                )

            finally:
                shutil.rmtree(temp_output, ignore_errors=True)
                file_lock.release()
                with _PARSING_LOCK:
                    if (
                        pdf_key in _PARSING_FILES
                        and not _PARSING_FILES[pdf_key].locked()
                    ):
                        del _PARSING_FILES[pdf_key]

        if _PARSE_CANCEL_FLAG.is_set():
            raise RuntimeError("Operation was cancelled")

        payload = {
            "status": "ok",
            "count": len(parse_results),
            "results": parse_results,
        }
        if job_id:
            _update_pdf_job(job_id, status="completed", result=payload)
        return payload

    except RuntimeError as exc:
        if "cancelled" in str(exc).lower():
            if job_id:
                _update_pdf_job(job_id, status="cancelled", error=str(exc))
            for doc_id in all_document_ids:
                await _update_document_safe(doc_id, {"status": "cancelled"})
            return {
                "status": "cancelled",
                "message": str(exc),
                "count": len(parse_results),
                "results": parse_results,
            }
        if job_id:
            _update_pdf_job(job_id, status="failed", error=str(exc))
        for doc_id in all_document_ids:
            await _update_document_safe(doc_id, {"status": "error"})
        raise


async def _run_pdf_job(
    saved_paths: List[Path],
    document_map: Optional[Dict[str, str]],
    job_id: str,
    user_id: Optional[str],
) -> None:
    try:
        _update_pdf_job(job_id, status="running")
        await _process_saved_pdfs(
            saved_paths,
            document_map=document_map,
            job_id=job_id,
            user_id=user_id,
        )
    except Exception as exc:
        # _process_saved_pdfs already updates job status; just log to avoid warnings
        print(f"[PDF] ⚠️ Background job {job_id} failed: {exc}")


# Set cancel flag in pipeline module so it can check during build
set_cancel_flag(_PARSE_CANCEL_FLAG)
# Set cancel flag in parser module so it can check during parsing
set_parse_cancel_flag(_PARSE_CANCEL_FLAG)


# @router.post("/upload-pdf/")
# async def upload_pdf(file: UploadFile = File(...)):
#     if not file.filename.endswith(".pdf"):
#         raise HTTPException(status_code=400, detail="Only PDF files are allowed")

#     # Save the uploaded PDF temporarily
#     temp_dir = Path(tempfile.mkdtemp())
#     temp_file = temp_dir / file.filename

#     with temp_file.open("wb") as f:
#         shutil.copyfileobj(file.file, f)

#     # ✅ Return the same PDF file back as response
#     return FileResponse(
#         path=temp_file, filename=file.filename, media_type="application/pdf"
#     )


@router.post("/upload-and-parse/")
async def upload_and_parse_pdf(file: UploadFile = File(...)):
    temp_dir = Path(tempfile.mkdtemp())
    input_pdf_path = temp_dir / file.filename

    with input_pdf_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        size = input_pdf_path.stat().st_size
    except Exception:
        size = -1
    print(
        f"[PDF] Received upload: name={file.filename}, size={size} bytes, temp={input_pdf_path}"
    )

    try:
        payload = await _process_saved_pdfs([input_pdf_path], user_id=None)
        return payload
    finally:
        try:
            shutil.rmtree(temp_dir)
        except Exception:
            pass


@router.get("/status")
async def qa_status(
    pdf_name: Optional[str] = Query(None, description="PDF name to check status for"),
    document_key: Optional[str] = Query(
        None, description="Document key to check status for"
    ),
    document_id: Optional[str] = Query(
        None, description="Document ID to check status for"
    ),
):
    """Return readiness status for QA pipeline by checking database instead of cache."""
    try:
        status = await pipeline_status(pdf_name=pdf_name, document_id=document_id)
        # Status logging is handled in pipeline.py
        return status
    except Exception as e:
        print(f"[STATUS] Error getting pipeline status: {e}")
        import traceback

        print(f"[STATUS] Traceback: {traceback.format_exc()}")
        return {"building": False, "ready": False, "error": str(e)}


@router.get("/status/stream")
async def stream_qa_status(
    pdf_name: Optional[str] = Query(None, description="PDF name to check status for"),
    document_key: Optional[str] = Query(
        None, description="Document key to check status for"
    ),
    document_id: Optional[str] = Query(
        None, description="Document ID to check status for"
    ),
):
    """
    Event-driven status streaming via SSE - NO POLLING, NO REPLICA SETS NEEDED!

    Handles late connections by checking if any changes occurred before client connected.
    """
    if not document_id:
        raise HTTPException(400, "document_id is required for event-driven streaming")

    async def event_generator():
        connection_time = time.time()

        # Register event listener for this document
        async with _STATUS_EVENTS_LOCK:
            if document_id not in _STATUS_EVENTS:
                _STATUS_EVENTS[document_id] = asyncio.Event()
            event = _STATUS_EVENTS[document_id]

            # Check if any changes happened BEFORE client connected
            last_change_time = _LAST_STATUS_CHANGE.get(document_id, 0)
            missed_changes = last_change_time > 0 and last_change_time < connection_time

        print(f"[SSE] 📡 Event-driven client connected for document {document_id}")

        if missed_changes:
            print(
                f"[SSE] ⚠️ Client connected {connection_time - last_change_time:.1f}s "
                f"AFTER last status change - checking for missed updates"
            )

        try:
            # Send initial status immediately
            status = await pipeline_status(document_id=document_id)
            yield f"data: {json.dumps(status)}\n\n"

            print(
                f"[SSE] Initial status: "
                f"embedding={status.get('embedding_status')}, "
                f"summary={status.get('summary_status')}, "
                f"reference={status.get('reference_status')}, "
                f"skimming={status.get('skimming_status')}, "
                f"available_features={status.get('available_features')}"
            )

            # Check if already complete
            if status.get("all_ready"):
                print(f"[SSE] ✅ All tasks already complete for {document_id}")
                # Cleanup timestamp
                async with _STATUS_EVENTS_LOCK:
                    _LAST_STATUS_CHANGE.pop(document_id, None)
                return

            # Check if any tasks completed before client connected (catch-up mechanism)
            embedding_ready = status.get("embedding_ready", False)
            summary_ready = status.get("summary_ready", False)
            reference_ready = status.get("reference_ready", False)
            skimming_ready = status.get("skimming_ready", False)

            # If any feature is already available, log it
            if embedding_ready or summary_ready or reference_ready or skimming_ready:
                available = status.get("available_features", [])
                print(
                    f"[SSE] 🎯 Client connected late - some features already available: {available}"
                )

                if missed_changes:
                    print(
                        f"[SSE] 🔄 Confirmed missed updates: "
                        f"reference_ready={reference_ready}, "
                        f"summary_ready={summary_ready}, "
                        f"embedding_ready={embedding_ready}, "
                        f"skimming_ready={skimming_ready}"
                    )

                # Check if all tasks are done (terminal states)
                embedding_done = (
                    status.get("embedding_status") in ["ready", "error"]
                    or embedding_ready
                )
                summary_done = status.get("summary_status") in ["ready", "error"]
                reference_done = status.get("reference_status") in ["ready", "error"]
                skimming_done = status.get("skimming_status") in ["ready", "error"]

                if embedding_done and summary_done and reference_done and skimming_done:
                    print(
                        f"[SSE] ✅ All tasks already in terminal state, closing stream immediately"
                    )
                    print(f"[SSE] Final available features: {available}")

                    # Cleanup timestamp
                    async with _STATUS_EVENTS_LOCK:
                        _LAST_STATUS_CHANGE.pop(document_id, None)

                    # Send one final update with terminal state
                    final_msg = {
                        **status,
                        "message": f"✅ All processing complete. Available: {', '.join(available)}",
                    }
                    yield f"data: {json.dumps(final_msg)}\n\n"
                    return

            # Event-driven waiting - NO POLLING!
            max_wait_time = 600  # 10 minutes total
            start_time = time.time()
            heartbeat_interval = 30  # Heartbeat every 30s to keep connection alive
            last_heartbeat = start_time

            while time.time() - start_time < max_wait_time:
                current_time = time.time()
                time_remaining = max_wait_time - (current_time - start_time)

                # Calculate next timeout (for heartbeat or remaining time)
                next_timeout = min(
                    heartbeat_interval - (current_time - last_heartbeat), time_remaining
                )

                if next_timeout <= 0:
                    # Send heartbeat
                    yield f": heartbeat\n\n"
                    last_heartbeat = current_time
                    continue

                try:
                    # Wait for event notification (NO POLLING - blocks until notified!)
                    await asyncio.wait_for(event.wait(), timeout=next_timeout)

                    # Event fired! Status changed, get new status
                    print(f"[SSE] 🔔 Event fired for {document_id} - status changed!")
                    status = await pipeline_status(document_id=document_id)
                    yield f"data: {json.dumps(status)}\n\n"

                    print(
                        f"[SSE] Updated: "
                        f"embedding_ready={status.get('embedding_ready')}, "
                        f"summary_ready={status.get('summary_ready')}, "
                        f"reference_ready={status.get('reference_ready')}, "
                        f"skimming_ready={status.get('skimming_ready')}, "
                        f"available={status.get('available_features')}"
                    )

                    # Stop if all done
                    if status.get("all_ready"):
                        print(f"[SSE] ✅ All tasks complete for {document_id}")
                        # Cleanup timestamp
                        async with _STATUS_EVENTS_LOCK:
                            _LAST_STATUS_CHANGE.pop(document_id, None)
                        break

                    # Stop on critical error
                    if status.get("stage") == "error":
                        print(f"[SSE] ❌ Critical error for {document_id}")
                        break

                    # Check if all tasks reached terminal state
                    embedding_done = status.get("embedding_status") in [
                        "ready",
                        "error",
                    ] or status.get("embedding_ready")
                    summary_done = status.get("summary_status") in ["ready", "error"]
                    reference_done = status.get("reference_status") in [
                        "ready",
                        "error",
                    ]
                    skimming_done = status.get("skimming_status") in ["ready", "error"]
                    if (
                        embedding_done
                        and summary_done
                        and reference_done
                        and skimming_done
                    ):
                        print(
                            f"[SSE] ✅ All tasks reached terminal state for {document_id}"
                        )

                        # Log final state
                        available = status.get("available_features", [])
                        if available:
                            print(f"[SSE] ✅ Final available features: {available}")

                        # Log any errors
                        errors = []
                        if status.get("summary_error"):
                            errors.append(f"Summary: {status.get('summary_error')}")
                        if status.get("reference_error"):
                            errors.append(f"Reference: {status.get('reference_error')}")
                        if status.get("embedding_error"):
                            errors.append(f"Embedding: {status.get('embedding_error')}")
                        if status.get("skimming_error"):  # Thêm dòng này
                            errors.append(
                                f"Skimming: {status.get('skimming_error')}"
                            )  # Thêm dòng này
                        if errors:
                            print(f"[SSE] ⚠️ Task errors: {'; '.join(errors)}")

                        # Cleanup timestamp
                        async with _STATUS_EVENTS_LOCK:
                            _LAST_STATUS_CHANGE.pop(document_id, None)

                        break

                except asyncio.TimeoutError:
                    # Timeout - send heartbeat
                    yield f": heartbeat\n\n"
                    last_heartbeat = current_time
                    continue

            # Max wait time reached
            if time.time() - start_time >= max_wait_time:
                print(f"[SSE] ⏱️ Timeout for {document_id}")
                final_status = await pipeline_status(document_id=document_id)
                available = final_status.get("available_features", [])

                timeout_msg = {
                    "stage": "timeout",
                    "message": f"Stream timeout. Available: {', '.join(available)}",
                    "available_features": available,
                    "embedding_ready": final_status.get("embedding_ready", False),
                    "summary_ready": final_status.get("summary_ready", False),
                    "reference_ready": final_status.get("reference_ready", False),
                    "skimming_ready": final_status.get("skimming_ready", False),
                }
                yield f"data: {json.dumps(timeout_msg)}\n\n"

        except Exception as e:
            print(f"[SSE] ❌ Error for {document_id}: {e}")
            import traceback

            print(f"[SSE] Traceback: {traceback.format_exc()}")

            error_msg = {
                "error": str(e),
                "stage": "error",
                "ready": False,
                "all_ready": False,
            }
            yield f"data: {json.dumps(error_msg)}\n\n"

        finally:
            # Cleanup event when client disconnects
            async with _STATUS_EVENTS_LOCK:
                if document_id in _STATUS_EVENTS:
                    del _STATUS_EVENTS[document_id]
                    print(
                        f"[SSE] 🔌 Disconnected and cleaned up event for {document_id}"
                    )

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/references")
async def get_references():
    """Extract and return references from the parsed PDF with clickable links."""
    try:
        # Get pipeline to access parsed data
        pipeline = await get_pipeline()
        if not pipeline or not pipeline.config:
            return {"status": "empty", "references": []}

        # Try to load cached references first
        cfg = PipelineConfig()
        data_dir = Path(cfg.data_dir)
        cache_file = data_dir / "references_cache.json"

        # Check if we have cached references
        if cache_file.exists():
            print(f"[REFERENCES] Loading cached references from {cache_file}")
            with open(cache_file, "r", encoding="utf-8") as f:
                cached_data = json.load(f)
                return {
                    "status": "ok",
                    "references": cached_data.get("references", []),
                    "count": len(cached_data.get("references", [])),
                }

        # If not cached, parse from markdown
        # Get markdown file path from pipeline artifacts
        if not pipeline.artifacts or not pipeline.artifacts.chunks:
            print("[REFERENCES] No chunks available yet, cannot extract references")
            return {"status": "empty", "references": []}

        # Find markdown file from data_dir
        # Look for markdown files in data_dir
        md_files = list(data_dir.glob("**/*-embedded.md"))
        if not md_files:
            md_files = list(data_dir.glob("**/*.md"))

        if not md_files:
            print("[REFERENCES] No markdown file found")
            return {"status": "empty", "references": []}

        # Use the most recent markdown file
        md_file = max(md_files, key=lambda p: p.stat().st_mtime)
        print(f"[REFERENCES] Reading markdown from {md_file}")

        with open(md_file, "r", encoding="utf-8") as f:
            markdown_content = f.read()

        # Extract references section
        from paperreader.services.parser.pdf_parser_pymupdf import (
            extract_references_section,
        )

        references_text = extract_references_section(markdown_content)

        if not references_text:
            print("[REFERENCES] No references section found in markdown")
            return {"status": "empty", "references": []}

        print(f"[REFERENCES] Found references section ({len(references_text)} chars)")

        # Parse references
        references = parse_references(references_text)
        print(f"[REFERENCES] Parsed {len(references)} references")

        # Generate links for each reference
        for ref in references:
            update_reference_link(ref)

        # Convert to dict for JSON serialization
        references_dict = [ref.to_dict() for ref in references]

        # Cache the results
        cache_data = {"references": references_dict, "cached_at": time.time()}
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, indent=2)

        print(f"[REFERENCES] Cached {len(references_dict)} references")

        return {
            "status": "ok",
            "references": references_dict,
            "count": len(references_dict),
        }

    except Exception as e:
        print(f"[REFERENCES] Error getting references: {e}")
        import traceback

        print(f"[REFERENCES] Traceback: {traceback.format_exc()}")
        return {"status": "error", "error": str(e), "references": []}


@router.post("/save-and-parse/")
async def save_and_parse_pdfs(
    files: list[UploadFile] = File(...),
    wait: bool = Query(False, description="Wait for processing to finish"),
    document_id: Optional[str] = Header(default=None, alias="X-Document-Id"),
    user_id_header: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """Accept multiple PDFs, persist them, and trigger asynchronous parsing."""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    cfg = PipelineConfig()
    data_dir = Path(cfg.data_dir)
    uploads_dir = data_dir / "uploads"
    data_dir.mkdir(parents=True, exist_ok=True)
    uploads_dir.mkdir(parents=True, exist_ok=True)

    saved_paths: List[Path] = []
    for upload in files:
        if not upload.filename.lower().endswith(".pdf"):
            continue
        target = uploads_dir / upload.filename
        try:
            with target.open("wb") as out:
                shutil.copyfileobj(upload.file, out)
            saved_paths.append(target)
            print(f"[PDF] Saved uploaded PDF: {target}")
        except Exception as exc:
            print(f"[PDF] Failed to save {upload.filename}: {exc}")

    if not saved_paths:
        raise HTTPException(status_code=400, detail="No valid PDF files uploaded")

    document_map: Dict[str, str] = {}
    if document_id and saved_paths:
        first_path = saved_paths[0]
        document_map[first_path.name] = document_id
        document_map[first_path.stem] = document_id

    if wait:
        return await _process_saved_pdfs(
            saved_paths,
            document_map=document_map or None,
            user_id=user_id_header,
        )

    job_id = _register_pdf_job(
        {"files": [str(p) for p in saved_paths], "count": len(saved_paths)}
    )
    asyncio.create_task(
        _run_pdf_job(saved_paths, document_map or None, job_id, user_id_header)
    )
    return {"status": "queued", "jobId": job_id, "count": len(saved_paths)}


@router.get("/jobs/{job_id}")
async def get_pdf_job(job_id: str):
    job = _get_pdf_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/parse-uploads-folder/")
async def parse_uploads_folder():
    """Parse all PDFs currently in the uploads folder and rebuild the pipeline.

    Useful when PDFs were copied in manually or after container restart.
    """
    cfg = PipelineConfig()
    data_dir = Path(cfg.data_dir)
    uploads_dir = data_dir / "uploads"

    if not uploads_dir.exists():
        raise HTTPException(
            status_code=404, detail=f"Uploads folder not found: {uploads_dir}"
        )

    pdf_paths = [p for p in uploads_dir.glob("*.pdf") if p.is_file()]
    if not pdf_paths:
        return {
            "status": "ok",
            "count": 0,
            "results": [],
            "message": "No PDFs in uploads folder",
        }

    print(f"[PDF] Parsing {len(pdf_paths)} existing PDF(s) from uploads folder...")
    result = await _process_saved_pdfs(pdf_paths, user_id=None)

    # Ensure QA pipeline reflects latest parsed results
    try:
        rebuild_start = time.time()
        await rebuild_pipeline(cfg, lazy_store=False)
        rebuild_elapsed = time.time() - rebuild_start
        print(
            f"[PDF] ✅ Pipeline rebuilt after parsing uploads (elapsed={rebuild_elapsed:.2f}s)"
        )
    except RuntimeError as exc:
        print(
            f"[PDF] ⚠️ Pipeline rebuild cancelled or failed (will rebuild on demand): {exc}"
        )
    except Exception as exc:
        print(f"[PDF] ⚠️ Pipeline rebuild failed (will rebuild on demand): {exc}")

    return result


@router.delete("/clear-output/")
async def clear_parser_output():
    """Clear all files in the parser output directory and reset pipeline cache.

    This is called when the page reloads to:
    - Cancel any ongoing parse/embed/chunk operations
    - Clear old PDF files to avoid noise
    - Reset pipeline cache so it rebuilds fresh

    IMPORTANT: Files are deleted IMMEDIATELY before setting cancel flag to ensure
    output is cleared even if operations are in progress.
    """
    try:
        cfg = PipelineConfig()
        data_dir = Path(cfg.data_dir)

        # CRITICAL: Delete files FIRST, before setting cancel flag
        # This ensures output is cleared immediately, even if operations are running
        deleted_count = 0
        if data_dir.exists():
            print("[PDF] ⚠️ CLEAR OUTPUT REQUESTED - Deleting files immediately...")
            # Remove all files and subdirectories in the output directory
            for item in data_dir.iterdir():
                try:
                    if item.is_file():
                        item.unlink()
                        deleted_count += 1
                    elif item.is_dir():
                        shutil.rmtree(item)
                        deleted_count += 1  # Count directory as one deletion
                except Exception as e:
                    print(f"[PDF] Failed to delete {item}: {e}")
                    continue
            print(
                f"[PDF] ✅ Deleted {deleted_count} items from output directory immediately"
            )
        else:
            print("[PDF] Output directory does not exist, nothing to delete")

        # Now set cancel flag to stop any ongoing operations
        print("[PDF] Setting cancel flag to stop ongoing6 operations...")
        _PARSE_CANCEL_FLAG.set()
        print("[PDF] ✅ Cancel flag set - ongoing parse operations will be stopped")

        # Reset pipeline cache to cancel any ongoing build operations
        # NOTE: This only clears pipeline cache (chunks, embeddings), NOT the model itself
        # Model (Visualized_BGE) is a singleton in memory and is NOT affected by this
        print(
            "[PDF] Resetting pipeline cache to cancel ongoing embed/chunk operations..."
        )
        print(
            "[PDF] ⚠️ NOTE: Model (Visualized_BGE) in memory is NOT cleared - it remains loaded and ready"
        )
        reset_pipeline_state(str(data_dir))
        print("[PDF] ✅ Pipeline cache reset - ongoing builds will be cancelled")
        print(
            "[PDF] ✅ Model instance preserved (singleton in memory, not affected by cache reset)"
        )

        print(f"[PDF] Pipeline cache reset and output cleared - ready for new uploads")

        # Reset cancel flag after clearing (ready for new operations)
        _PARSE_CANCEL_FLAG.clear()
        print("[PDF] ✅ Cancel flag reset - ready for new parse operations")

        return {
            "status": "ok",
            "message": f"Cleared {deleted_count} items from output directory and reset pipeline cache",
            "deleted_count": deleted_count,
        }
    except Exception as e:
        print(f"[PDF] Error clearing parser output: {e}")
        import traceback

        print(f"[PDF] Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"Failed to clear output directory: {str(e)}"
        )


@router.post("/extract-references/")
async def extract_references(
    file: UploadFile = File(...),
    document_id: Optional[str] = Query(
        None, description="Document ID to associate references with"
    ),
):
    """
    Extract references from a PDF using GROBID.

    Returns structured reference data including:
    - Bibliographic information (title, authors, venue, year, etc.)
    - Citation markers in the document with their locations
    - Bounding boxes for both references and citations
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    temp_dir = Path(tempfile.mkdtemp(prefix="ref_extract_"))
    pdf_path = temp_dir / file.filename
    xml_path = temp_dir / f"{file.filename}.tei.xml"

    try:
        # Save uploaded PDF
        with pdf_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        print(f"[REFERENCES] Processing {file.filename} for reference extraction...")

        # Step 1: Send PDF to GROBID for processing
        grobid_client = GrobidClient()
        xml_content = await asyncio.to_thread(
            grobid_client.process_pdf, pdf_path, include_coords=True
        )

        # Save TEI XML for debugging
        with xml_path.open("w", encoding="utf-8") as f:
            f.write(xml_content)
        print(f"[REFERENCES] Saved TEI XML to {xml_path}")

        # Step 2: Extract references from TEI XML
        extractor = ReferenceExtractorService(xml_content)
        references = extractor.extract_references()

        print(
            f"[REFERENCES] Extracted {len(references)} references from {file.filename}"
        )

        # Convert to dict for JSON response
        references_dict = [ref.to_dict() for ref in references]

        # Step 3: Save to cache if document_id provided
        if document_id:
            cfg = PipelineConfig()
            cache_dir = Path(cfg.data_dir) / "references_cache"
            cache_dir.mkdir(parents=True, exist_ok=True)

            cache_file = cache_dir / f"{document_id}_references.json"
            cache_data = {
                "document_id": document_id,
                "filename": file.filename,
                "references": references_dict,
                "cached_at": datetime.utcnow().isoformat(),
                "count": len(references_dict),
            }

            with cache_file.open("w", encoding="utf-8") as f:
                json.dump(cache_data, f, indent=2, ensure_ascii=False)

            print(f"[REFERENCES] Cached references to {cache_file}")

        return {
            "status": "ok",
            "filename": file.filename,
            "document_id": document_id,
            "references": references_dict,
            "count": len(references_dict),
        }

    except Exception as e:
        print(f"[REFERENCES] Error extracting references: {e}")
        import traceback

        print(f"[REFERENCES] Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"Failed to extract references: {str(e)}"
        )
    finally:
        # Cleanup temporary files
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as e:
            print(f"[REFERENCES] Failed to cleanup temp dir: {e}")
        # Cleanup temporary files
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as e:
            print(f"[REFERENCES] Failed to cleanup temp dir: {e}")
