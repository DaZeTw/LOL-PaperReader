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
from paperreader.services.documents.chunk_repository import replace_document_chunks
from paperreader.services.documents.minio_client import upload_bytes
from paperreader.services.documents.repository import (
    get_document_by_id,
    to_object_id,
    update_document,
    update_document_status,
)
from paperreader.services.parser.pdf_parser import parse_pdf_with_pymupdf
from paperreader.services.parser.pdf_parser_pymupdf import set_parse_cancel_flag
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


async def _process_saved_pdfs(
    saved_paths: List[Path],
    *,
    document_map: Optional[Dict[str, str]] = None,
    job_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    if not saved_paths:
        payload = {"status": "ok", "count": 0, "results": []}
        if job_id:
            _update_pdf_job(job_id, status="completed", result=payload)
        return payload

    _PARSE_CANCEL_FLAG.clear()
    embedder = get_embedder(None)

    parse_results: List[Dict[str, Any]] = []
    document_updates: Dict[str, Dict[str, Any]] = {}
    all_document_ids = set(document_map.values()) if document_map else set()

    document_owner_cache: Dict[str, Optional[str]] = {}

    try:
        for index, pdf_path in enumerate(saved_paths, start=1):
            if _PARSE_CANCEL_FLAG.is_set():
                raise RuntimeError("Operation was cancelled")

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
                parse_start = time.time()
                result = await asyncio.to_thread(
                    parse_pdf_with_pymupdf, pdf_path, temp_output
                )
                parse_elapsed = time.time() - parse_start
                print(
                    "[PDF] ✅ Parse completed for "
                    f"{pdf_path.name} in {parse_elapsed:.2f}s (images={len(result.get('image_files') or [])}, "
                    f"tables={len(result.get('table_files') or [])})"
                )

                if _PARSE_CANCEL_FLAG.is_set():
                    raise RuntimeError("Operation was cancelled")

                markdown_content = result.get("markdown_content")
                if not markdown_content:
                    print(
                        f"[PDF] ⚠️ Missing markdown content for {pdf_path.name}, skipping"
                    )
                    continue

                document_id = _resolve_document_id(document_map, pdf_path)
                if document_id:
                    all_document_ids.add(document_id)

                metadata = result.get("metadata") or {}
                metadata.setdefault("total_pages", result.get("num_pages") or 0)
                result["metadata"] = metadata

                doc_key = pdf_path.stem
                owner_user_id = user_id
                if document_id:
                    cached_owner = document_owner_cache.get(document_id)
                    if cached_owner is None and document_id not in document_owner_cache:
                        owner_object_id = to_object_id(document_id)
                        if owner_object_id:
                            try:
                                doc_record = await get_document_by_id(owner_object_id)
                                cached_owner = (
                                    doc_record.get("user_id") if doc_record else None
                                )
                            except Exception as exc:
                                print(
                                    f"[PDF] ⚠️ Failed to load document {document_id} for user lookup: {exc}"
                                )
                                cached_owner = None
                        else:
                            cached_owner = None
                        document_owner_cache[document_id] = cached_owner
                    owner_user_id = document_owner_cache.get(document_id, owner_user_id)

                # Path structure: {user_id}/document/{document_id}/... (không có "users/" prefix)
                asset_identifier = document_id or doc_key
                if owner_user_id:
                    # Format: {user_id}/document/{document_id}/...
                    asset_base_prefix = f"{owner_user_id}/document/{asset_identifier}/"
                else:
                    # Fallback: shared/document/{document_id}/... nếu không có user_id
                    asset_base_prefix = f"shared/document/{asset_identifier}/"
                asset_prefix = asset_base_prefix.rstrip("/") + "/"

                image_lookup: Dict[str, Dict[str, Any]] = {}
                for image_meta in result.get("image_files") or []:
                    rel_path = (
                        image_meta.get("relative_path")
                        or image_meta.get("filename")
                        or ""
                    )
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
                        print(
                            f"[PDF] ⚠️ Failed to upload image {src_path} to Minio: {exc}"
                        )
                        continue

                    image_lookup[rel_path] = {
                        "relative_path": rel_path,
                        "object_name": object_name,
                        "bucket": MINIO_BUCKET,
                        "page": image_meta.get("page"),
                        "position": image_meta.get("position"),
                        "caption": image_meta.get("caption"),
                        "figure_id": image_meta.get("image_id")
                        or image_meta.get("figure_id"),
                        "local_path": str(src_path),
                    }

                table_lookup: Dict[str, Dict[str, Any]] = {}
                for table_meta in result.get("table_files") or []:
                    rel_path = (
                        table_meta.get("relative_path")
                        or table_meta.get("filename")
                        or ""
                    )
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
                        print(
                            f"[PDF] ⚠️ Failed to upload table {src_path} to Minio: {exc}"
                        )
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

                # Save markdown file for debugging
                debug_md_path = DEBUG_CHUNKING_DIR / f"{doc_key}_chunking_debug.md"
                debug_md_path.parent.mkdir(parents=True, exist_ok=True)
                try:
                    with open(debug_md_path, "w", encoding="utf-8") as f:
                        f.write(markdown_content)
                    print(f"[PDF] 💾 Saved markdown for debugging: {debug_md_path}")
                except Exception as exc:
                    print(f"[PDF] ⚠️ Failed to save debug markdown: {exc}")

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
                    continue

                for idx, chunk in enumerate(chunks):
                    chunk_id = hashlib.sha1(
                        f"{doc_key}:{idx}:{chunk.get('text', '')[:200]}".encode("utf-8")
                    ).hexdigest()
                    chunk["chunk_id"] = chunk_id
                    chunk["doc_key"] = doc_key
                    chunk["document_id"] = document_id

                    enriched_images: List[Dict[str, Any]] = []
                    for img_meta in chunk.get("images") or []:
                        key = (
                            (img_meta.get("data") or "").replace("\\", "/").lstrip("./")
                        )
                        lookup = image_lookup.get(key) or image_lookup.get(
                            f"images/{Path(key).name}"
                        )
                        if lookup:
                            enriched_images.append(
                                {
                                    "caption": lookup.get("caption")
                                    or img_meta.get("caption"),
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

                    enriched_tables: List[Dict[str, Any]] = []
                    for tbl_meta in chunk.get("tables") or []:
                        key = (
                            (
                                tbl_meta.get("data")
                                or tbl_meta.get("relative_path")
                                or ""
                            )
                            .replace("\\", "/")
                            .lstrip("./")
                        )
                        lookup = table_lookup.get(key) or table_lookup.get(
                            f"tables/{Path(key).name}"
                        )
                        if lookup:
                            enriched_tables.append(
                                {
                                    "label": lookup.get("label")
                                    or tbl_meta.get("label"),
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

                # Step 1: Save chunks to MongoDB first
                print(
                    f"[PDF] 💾 Saving {len(chunks)} chunks to MongoDB for {pdf_path.name}..."
                )
                mongo_start = time.time()
                await replace_document_chunks(
                    document_id=document_id,
                    chunks=chunks,
                )
                mongo_elapsed = time.time() - mongo_start
                print(
                    f"[PDF] ✅ Saved {len(chunks)} chunks to MongoDB in {mongo_elapsed:.2f}s for {pdf_path.name}"
                )

                # Step 2: Generate embeddings after chunks are saved
                # IMPORTANT: This must complete fully before moving to next PDF
                print(
                    f"[PDF] 🔢 Generating embeddings for {len(chunks)} chunks for {pdf_path.name}..."
                )
                embed_start = time.time()
                try:
                    chunk_embeddings = await asyncio.to_thread(
                        embedder.embed_chunks,
                        chunks,
                        doc_key,
                    )
                    embed_elapsed = time.time() - embed_start
                    print(
                        f"[PDF] ✅ Generated embeddings for {len(chunks)} chunks in {embed_elapsed:.2f}s for {pdf_path.name}"
                    )
                except Exception as embed_exc:
                    embed_elapsed = time.time() - embed_start
                    print(
                        f"[PDF] ❌ Failed to generate embeddings for {pdf_path.name} (took {embed_elapsed:.2f}s): {embed_exc}"
                    )
                    import traceback

                    print(f"[PDF] Traceback: {traceback.format_exc()}")
                    raise  # Re-raise to stop processing this PDF and move to next

                # Step 3: Index chunks with embeddings to Elasticsearch
                # IMPORTANT: This must complete fully before moving to next PDF
                print(
                    f"[PDF] 📤 Indexing {len(chunks)} chunks with embeddings to Elasticsearch for {pdf_path.name}..."
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
                except Exception as exc:
                    es_elapsed = time.time() - es_start
                    print(
                        f"[PDF] ⚠️ Failed to index chunks to Elasticsearch for {pdf_path.name} (took {es_elapsed:.2f}s): {exc}"
                    )
                    import traceback

                    print(f"[PDF] Traceback: {traceback.format_exc()}")
                    # Don't fail the entire job if Elasticsearch indexing fails
                    # The chunks are already saved to MongoDB, so we can continue

                # IMPORTANT: Log completion of this PDF before moving to next
                print(
                    f"[PDF] ✅ COMPLETED processing {pdf_path.name} (PDF {index}/{len(saved_paths)}) - ready for next PDF"
                )

                parse_results.append(
                    {
                        "pdf": str(pdf_path),
                        "outputs": result,
                        "document_id": document_id,
                    }
                )

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
                    document_updates[document_id] = {
                        "status": "ready",
                        "num_pages": total_pages,
                        "total_pages": total_pages,
                        "title": resolved_title,
                        "author": metadata.get("author") or "",
                        "subject": metadata.get("subject") or "",
                        "keywords": keywords_list,
                        "chunk_count": len(chunks),
                        "embedding_status": "ready",
                        "embedding_updated_at": datetime.utcnow(),
                        "metadata": metadata,
                    }

                    # ✅ UPDATE DOCUMENT STATUS IMMEDIATELY - Don't wait for all PDFs to finish
                    # This allows each PDF to become available for chat as soon as it's done
                    await _update_document_safe(
                        document_id, document_updates[document_id]
                    )
                    print(
                        f"[PDF] ✅ Updated document {document_id} status to ready immediately for {pdf_path.name}"
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

        # Documents are now updated immediately above when each PDF finishes
        # This loop is kept as a safety net for edge cases where document_id might not have been set
        # But in normal flow, documents are already updated
        for doc_id, updates in document_updates.items():
            # Double-check if document was already updated (avoid redundant updates)
            # In practice, all documents should already be updated above
            await _update_document_safe(doc_id, updates)

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
    Streams pipeline status updates via SSE.
    Stops streaming when the document is ready or an error occurs.
    """

    async def event_generator():
        retry_count = 0

        while True:
            # Re-use your existing logic.
            # Note: This preserves your "lazy loading" side effects
            # (triggering chunking/embedding) because we are calling the function.
            status = await pipeline_status(pdf_name=pdf_name, document_id=document_id)

            # Serialize the data for SSE format
            yield f"data: {json.dumps(status)}\n\n"

            # Stop the stream if processing is complete or failed
            if status.get("ready") or status.get("stage") == "error":
                print(f"[SSE] Stream completed for {document_id or pdf_name}")
                break

            # Server-side wait (much cheaper than a new HTTP request)
            await asyncio.sleep(2)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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
