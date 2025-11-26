import asyncio
import hashlib
import mimetypes
import os
import re
import shutil
import tempfile
import time
import traceback
import uuid
from datetime import datetime
from pathlib import Path
import threading
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from paperreader.services.parser.pdf_parser import parse_pdf_with_pymupdf
from paperreader.services.parser.pdf_parser_pymupdf import set_parse_cancel_flag
from paperreader.services.qa.config import PipelineConfig
from paperreader.services.qa.pipeline import rebuild_pipeline, pipeline_status, get_pipeline, reset_pipeline_cache, set_cancel_flag
from paperreader.services.qa.chunking import split_markdown_into_chunks
from paperreader.services.documents.repository import to_object_id, update_document, update_document_status
from paperreader.services.documents.minio_client import upload_bytes
from paperreader.services.documents.chunk_repository import replace_document_chunks
from paperreader.services.qa.elasticsearch_client import index_chunks
from paperreader.services.qa.embeddings import get_embedder

router = APIRouter()

# MinIO bucket configuration
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "pdf-documents")

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


async def _update_document_safe(document_id: Optional[str], updates: Dict[str, Any]) -> None:
    if not document_id:
        return
    object_id = to_object_id(document_id)
    if not object_id:
        return
    await update_document(object_id, updates)


def _resolve_document_id(mapping: Optional[Dict[str, str]], pdf_path: Path) -> Optional[str]:
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
                print(f"[PDF] ⏳ {pdf_path.name} is already being parsed, waiting briefly...")
                for _ in range(10):
                    await asyncio.sleep(0.1)
                    if file_lock.acquire(blocking=False):
                        acquired = True
                        break
                if not acquired:
                    print(f"[PDF] ⚠️ {pdf_path.name} is still being parsed elsewhere, skipping duplicate")
                    continue

            temp_output = Path(tempfile.mkdtemp(prefix=f"parsed_{pdf_path.stem}_"))
            try:
                print(f"[PDF] [{index}/{len(saved_paths)}] Processing {pdf_path.name}")
                parse_start = time.time()
                result = await asyncio.to_thread(parse_pdf_with_pymupdf, pdf_path, temp_output)
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
                    print(f"[PDF] ⚠️ Missing markdown content for {pdf_path.name}, skipping")
                    continue

                document_id = _resolve_document_id(document_map, pdf_path)
                if document_id:
                    all_document_ids.add(document_id)

                metadata = result.get("metadata") or {}
                metadata.setdefault("total_pages", result.get("num_pages") or 0)
                result["metadata"] = metadata

                doc_key = pdf_path.stem
                asset_identifier = document_id or doc_key
                asset_prefix = f"documents/{asset_identifier}/" if document_id else f"uploads/{asset_identifier}/"
                asset_prefix = asset_prefix.rstrip("/") + "/"

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
                    }

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
                    }

                result["image_files"] = list(image_lookup.values())
                result["table_files"] = list(table_lookup.values())
                result["assets"] = {"images": result["image_files"], "tables": result["table_files"]}

                chunk_start = time.time()
                chunks = await asyncio.to_thread(
                    split_markdown_into_chunks,
                    markdown_content,
                    doc_key,
                    str(pdf_path),
                    assets={"images": image_lookup, "tables": table_lookup},
                )
                chunk_elapsed = time.time() - chunk_start
                print(f"[PDF] ✅ Chunked {pdf_path.name} into {len(chunks)} chunks in {chunk_elapsed:.2f}s")

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
                        key = (img_meta.get("data") or "").replace("\\", "/").lstrip("./")
                        lookup = image_lookup.get(key) or image_lookup.get(f"images/{Path(key).name}")
                        if lookup:
                            enriched_images.append(
                                {
                                    "caption": lookup.get("caption") or img_meta.get("caption"),
                                    "figure_id": lookup.get("figure_id") or img_meta.get("figure_id"),
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
                    chunk["images"] = enriched_images

                    enriched_tables: List[Dict[str, Any]] = []
                    for tbl_meta in chunk.get("tables") or []:
                        key = (
                            tbl_meta.get("data") or tbl_meta.get("relative_path") or ""
                        ).replace("\\", "/").lstrip("./")
                        lookup = table_lookup.get(key) or table_lookup.get(f"tables/{Path(key).name}")
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
                    chunk["tables"] = enriched_tables

                chunk_embeddings = await asyncio.to_thread(
                    embedder.embed_chunks,
                    chunks,
                    doc_key,
                )

                await replace_document_chunks(
                    document_id=document_id,
                    document_key=doc_key,
                    chunks=chunks,
                )
                await index_chunks(
                    document_id=document_id,
                    document_key=doc_key,
                    chunks=chunks,
                    embeddings=chunk_embeddings,
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
                        keywords_list = [k.strip() for k in re.split(r"[;,]", keywords_value) if k.strip()]
                    elif isinstance(keywords_value, list):
                        keywords_list = [str(k).strip() for k in keywords_value if str(k).strip()]
                    else:
                        keywords_list = []

                    total_pages = metadata.get("total_pages") or result.get("num_pages") or 0
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
                    }
            finally:
                shutil.rmtree(temp_output, ignore_errors=True)
                file_lock.release()
                with _PARSING_LOCK:
                    if pdf_key in _PARSING_FILES and not _PARSING_FILES[pdf_key].locked():
                        del _PARSING_FILES[pdf_key]

        if _PARSE_CANCEL_FLAG.is_set():
            raise RuntimeError("Operation was cancelled")

        for doc_id, updates in document_updates.items():
            await _update_document_safe(doc_id, updates)

        payload = {"status": "ok", "count": len(parse_results), "results": parse_results}
        if job_id:
            _update_pdf_job(job_id, status="completed", result=payload)
        return payload
    except RuntimeError as exc:
        if "cancelled" in str(exc).lower():
            if job_id:
                _update_pdf_job(job_id, status="cancelled", error=str(exc))
            for doc_id in all_document_ids:
                await _update_document_safe(doc_id, {"status": "cancelled"})
            return {"status": "cancelled", "message": str(exc), "count": len(parse_results), "results": parse_results}
        if job_id:
            _update_pdf_job(job_id, status="failed", error=str(exc))
        for doc_id in all_document_ids:
            await _update_document_safe(doc_id, {"status": "error"})
        raise


async def _run_pdf_job(saved_paths: List[Path], document_map: Optional[Dict[str, str]], job_id: str) -> None:
    try:
        _update_pdf_job(job_id, status="running")
        await _process_saved_pdfs(saved_paths, document_map=document_map, job_id=job_id)
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


@router.post("/upload-and-parse")
async def upload_and_parse_pdf(file: UploadFile = File(...)):
    temp_dir = Path(tempfile.mkdtemp())
    input_pdf_path = temp_dir / file.filename

    with input_pdf_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        size = input_pdf_path.stat().st_size
    except Exception:
        size = -1
    print(f"[PDF] Received upload: name={file.filename}, size={size} bytes, temp={input_pdf_path}")

    try:
        payload = await _process_saved_pdfs([input_pdf_path])
        return payload
    finally:
        try:
            shutil.rmtree(temp_dir)
        except Exception:
            pass


@router.get("/status")
async def qa_status():
    """Return readiness status for QA pipeline."""
    try:
        status = pipeline_status()
        # Add debug logging
        print(f"[STATUS] Pipeline status check: building={status.get('building')}, ready={status.get('ready')}, has_cache={status.get('has_cache')}, chunks={status.get('chunks')}")
        return status
    except Exception as e:
        print(f"[STATUS] Error getting pipeline status: {e}")
        import traceback
        print(f"[STATUS] Traceback: {traceback.format_exc()}")
        return {"building": False, "ready": False, "error": str(e)}


@router.post("/save-and-parse")
async def save_and_parse_pdfs(
    files: list[UploadFile] = File(...),
    wait: bool = Query(False, description="Wait for processing to finish"),
    document_id: Optional[str] = Header(default=None, alias="X-Document-Id"),
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
        return await _process_saved_pdfs(saved_paths, document_map=document_map or None)

    job_id = _register_pdf_job({"files": [str(p) for p in saved_paths], "count": len(saved_paths)})
    asyncio.create_task(_run_pdf_job(saved_paths, document_map or None, job_id))
    return {"status": "queued", "jobId": job_id, "count": len(saved_paths)}


@router.get("/jobs/{job_id}")
async def get_pdf_job(job_id: str):
    job = _get_pdf_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/parse-uploads-folder")
async def parse_uploads_folder():
    """Parse all PDFs currently in the uploads folder and rebuild the pipeline.

    Useful when PDFs were copied in manually or after container restart.
    """
    cfg = PipelineConfig()
    data_dir = Path(cfg.data_dir)
    uploads_dir = data_dir / "uploads"

    if not uploads_dir.exists():
        raise HTTPException(status_code=404, detail=f"Uploads folder not found: {uploads_dir}")

    pdf_paths = [p for p in uploads_dir.glob("*.pdf") if p.is_file()]
    if not pdf_paths:
        return {"status": "ok", "count": 0, "results": [], "message": "No PDFs in uploads folder"}

    # Reset cancel flag for new parse operation
    _PARSE_CANCEL_FLAG.clear()
    print("[PDF] Starting parse-uploads-folder operation - cancel flag reset")

    parse_results = []
    all_chunks = []  # Collect all chunks from parsed PDFs to pass directly to pipeline
    for pdf_path in pdf_paths:
        # Check cancel flag - if set, stop parsing remaining PDFs
        if _PARSE_CANCEL_FLAG.is_set():
            print(f"[PDF] ⚠️ Parse operation cancelled - skipping remaining PDFs (stopped at {pdf_path.name})")
            break
        
        temp_output = pdf_path.parent / f"parsed_{pdf_path.stem}"
        print(f"[PDF] Parsing existing uploaded PDF: {pdf_path} -> {temp_output}")
        parse_start = time.time()
        try:
            result = parse_pdf_with_pymupdf(pdf_path, temp_output)
        except Exception as e:
            # If cancelled during parse, log and skip
            if _PARSE_CANCEL_FLAG.is_set():
                print(f"[PDF] ⚠️ Parse operation cancelled during parsing {pdf_path.name}: {e}")
                break
            raise

        parse_elapsed = time.time() - parse_start
        print(f"[PDF] ✅ Parse completed for {pdf_path.name} in {parse_elapsed:.2f}s")
        print(f"[PDF] Parser result keys: {sorted(result.keys())}")
        print(f"[PDF] Parser outputs: md={result.get('markdown_embedded')}, pages={len(result.get('page_images') or [])}, figures={len(result.get('figures') or [])}")
        
        # Check cancel flag immediately after parsing
        if _PARSE_CANCEL_FLAG.is_set():
            print(f"[PDF] ⚠️ Parse operation cancelled after parsing {pdf_path.name} - stopping")
            break

        # Convert markdown content directly to doc format (no file copy needed)
        markdown_content = result.get("markdown_content")
        if markdown_content:
            print(f"[PDF] Markdown content in result: Yes (length: {len(markdown_content)} chars)")
        else:
            print(f"[PDF] Markdown content in result: No (falling back to file read)")

        if not markdown_content:
            # Fallback: try to read from file if content not in result
            md_path = Path(result.get("markdown_embedded") or result.get("markdown_referenced") or "")
            if md_path and md_path.exists():
                print(f"[PDF] 📋 Reading markdown from file (fallback): {md_path}")
                with open(md_path, "r", encoding="utf-8") as f:
                    markdown_content = f.read()
                print(f"[PDF] ✅ Read {len(markdown_content)} chars from file")
            else:
                print(f"[PDF] ⚠️ Parser didn't produce markdown content for {pdf_path.name}, skipping...")
                continue
        
        # Check cancel flag before converting
        if _PARSE_CANCEL_FLAG.is_set():
            print(f"[PDF] ⚠️ Operation cancelled before converting markdown for {pdf_path.name}")
            break
        
        # Convert markdown content to doc format directly (no file needed)
        # OPTIMIZED: Chunking ngay từ markdown content (không cần đợi lưu file)
        doc_id = pdf_path.stem
        print(f"[PDF] 🚀 Chunking directly from parsed markdown (no file I/O) for {doc_id}...")
        chunks = split_markdown_into_chunks(markdown_content, doc_id, str(pdf_path))
        if chunks:
            all_chunks.append(chunks)
            print(f"[PDF] ✅ Created {len(chunks)} chunks directly from parsed markdown")
        else:
            print(f"[PDF] ⚠️ Failed to create chunks for {pdf_path.name}, skipping...")
            continue
        
        # Lưu markdown file song song (không block chunking/embedding)
        # Cần thiết để QA có thể load sau này
        expected_md_name = doc_id + "-embedded.md"
        target_md = data_dir / expected_md_name
        try:
            target_md.parent.mkdir(parents=True, exist_ok=True)
            with open(target_md, "w", encoding="utf-8") as f:
                f.write(markdown_content)
            print(f"[PDF] ✅ Saved markdown file to: {target_md} (for QA later)")
        except Exception as e:
            print(f"[PDF] ⚠️ Failed to save markdown file to {target_md}: {e}")
            # Don't fail - chunks are already created

        # Check cancel flag before copying images
        if _PARSE_CANCEL_FLAG.is_set():
            print(f"[PDF] ⚠️ Operation cancelled before copying images for {pdf_path.name}")
            break

        # Copy images (only figures, page_images are skipped)
        # NOTE: page_images are for preview/debug only, not used in pipeline
        # figures are used in chunks for multi-modal embedding
        figures_count = len(result.get('figures', []))
        
        # Only copy figures (used in pipeline), skip page_images (not used, just for preview)
        if figures_count > 0:
            print(f"[PDF] Copying {figures_count} figures (used in pipeline)...")
            copied_figures = []
            for idx, p in enumerate(result.get('figures', []), 1):
                # Check cancel flag during image copying
                if _PARSE_CANCEL_FLAG.is_set():
                    print(f"[PDF] ⚠️ Image copying cancelled - stopping at figures {idx}/{figures_count}")
                    break
                
                pth = Path(p)
                if pth.exists():
                    target_img = data_dir / pth.name
                    try:
                        shutil.copyfile(pth, target_img)
                        # Check cancel after each file copy (can be slow for large files)
                        if _PARSE_CANCEL_FLAG.is_set():
                            print(f"[PDF] ⚠️ Image copying cancelled after copying figure {idx}/{figures_count}")
                            break
                        copied_figures.append(str(target_img))
                        if figures_count <= 10:
                            print(f"[PDF] Saved figure to: {target_img}")
                    except Exception as e:
                        print(f"[PDF] ⚠️ Failed to copy figure {pth.name}: {e}")
                        continue
            result["figures"] = copied_figures
            print(f"[PDF] ✅ Copied {len(copied_figures)}/{figures_count} figures")
        
        # Clear page_images to save memory (not used in pipeline)
        result["page_images"] = []

        # Check cancel flag before adding to results
        if _PARSE_CANCEL_FLAG.is_set():
            print(f"[PDF] ⚠️ Operation cancelled before adding {pdf_path.name} to results")
            break

        parse_results.append({"pdf": str(pdf_path), "outputs": result})

    # Check cancel flag before building pipeline
    if _PARSE_CANCEL_FLAG.is_set():
        print(f"[PDF] ⚠️ Operation cancelled before building pipeline - stopping")
        return {"status": "cancelled", "message": "Operation was cancelled", "count": len(parse_results), "results": parse_results}

    # Build pipeline immediately after parsing (synchronously, end-to-end)
    # Use chunks directly from memory (no file loading needed)
    # Flatten all_chunks (list of lists) into single list
    flat_chunks = []
    for chunk_list in all_chunks:
        flat_chunks.extend(chunk_list)
    
    print(f"[PDF] Starting pipeline build for {len(parse_results)} parsed PDF(s)...")
    print(f"[PDF] 📊 Total chunks to process: {len(flat_chunks)}")
    if flat_chunks:
        doc_ids = list(set([ch.get('doc_id') for ch in flat_chunks]))
        print(f"[PDF] 📊 Doc IDs: {doc_ids}")
    try:
        print("[PDF] Building pipeline end-to-end (chunks + embeddings + store) with in-memory chunks...")
        print(f"[PDF] 🔨 Calling rebuild_pipeline with {len(flat_chunks)} chunks directly (no file loading)...")
        build_start = time.time()
        pipeline = await rebuild_pipeline(cfg, lazy_store=False, chunks=flat_chunks)
        build_elapsed = time.time() - build_start
        print(f"[PDF] ✅ Full pipeline ready with {len(pipeline.artifacts.chunks)} chunks; store built={pipeline._store_built}; build_time={build_elapsed:.2f}s")
    except RuntimeError as e:
        if "cancelled" in str(e).lower():
            print(f"[PDF] ⚠️ Pipeline build was cancelled (output cleared during build): {e}")
        else:
            print(f"[PDF] ⚠️ Failed to build pipeline immediately: {e}")
            import traceback
            print(f"[PDF] Traceback: {traceback.format_exc()}")
        print("[PDF] Pipeline will be built when chat is accessed")
        # Don't fail the request, pipeline will build on-demand
    except Exception as e:
        print(f"[PDF] ⚠️ Failed to build pipeline immediately: {e}")
        import traceback
        print(f"[PDF] Traceback: {traceback.format_exc()}")
        print("[PDF] Pipeline will be built when chat is accessed")
        # Don't fail the request, pipeline will build on-demand

    return {"status": "ok", "count": len(parse_results), "results": parse_results}


@router.delete("/clear-output")
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
            print(f"[PDF] ✅ Deleted {deleted_count} items from output directory immediately")
        else:
            print("[PDF] Output directory does not exist, nothing to delete")
        
        # Now set cancel flag to stop any ongoing operations
        print("[PDF] Setting cancel flag to stop ongoing operations...")
        _PARSE_CANCEL_FLAG.set()
        print("[PDF] ✅ Cancel flag set - ongoing parse operations will be stopped")
        
        # Reset pipeline cache to cancel any ongoing build operations
        # NOTE: This only clears pipeline cache (chunks, embeddings), NOT the model itself
        # Model (Visualized_BGE) is a singleton in memory and is NOT affected by this
        print("[PDF] Resetting pipeline cache to cancel ongoing embed/chunk operations...")
        print("[PDF] ⚠️ NOTE: Model (Visualized_BGE) in memory is NOT cleared - it remains loaded and ready")
        reset_pipeline_cache(str(data_dir))
        print("[PDF] ✅ Pipeline cache reset - ongoing builds will be cancelled")
        print("[PDF] ✅ Model instance preserved (singleton in memory, not affected by cache reset)")
        
        print(f"[PDF] Pipeline cache reset and output cleared - ready for new uploads")
        
        # Reset cancel flag after clearing (ready for new operations)
        _PARSE_CANCEL_FLAG.clear()
        print("[PDF] ✅ Cancel flag reset - ready for new parse operations")
        
        return {"status": "ok", "message": f"Cleared {deleted_count} items from output directory and reset pipeline cache", "deleted_count": deleted_count}
    except Exception as e:
        print(f"[PDF] Error clearing parser output: {e}")
        import traceback
        print(f"[PDF] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to clear output directory: {str(e)}")