import shutil
import tempfile
import time
from pathlib import Path
import threading

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from paperreader.services.parser.pdf_parser import parse_pdf_with_pymupdf
from paperreader.services.parser.pdf_parser_pymupdf import set_parse_cancel_flag
from paperreader.services.qa.config import PipelineConfig
from paperreader.services.qa.pipeline import rebuild_pipeline, pipeline_status, get_pipeline, reset_pipeline_cache, set_cancel_flag
from paperreader.services.qa.chunking import split_markdown_into_chunks

router = APIRouter()

# Global cancel flag to stop ongoing parse/embed/chunk operations
_PARSE_CANCEL_FLAG = threading.Event()

# Track files currently being parsed to avoid duplicate parsing
_PARSING_FILES: dict[str, threading.Lock] = {}  # Key: file path, Value: lock
_PARSING_LOCK = threading.Lock()  # Lock for _PARSING_FILES dict

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
async def upload_and_parse_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    # Receive upload
    temp_dir = Path(tempfile.mkdtemp())
    input_pdf_path = temp_dir / file.filename

    with input_pdf_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        size = input_pdf_path.stat().st_size
    except Exception:
        size = -1
    print(f"[PDF] Received upload: name={file.filename}, size={size} bytes, temp={input_pdf_path}")

    # Parse to a temp output dir first
    output_dir = temp_dir / "parsed_output"
    print(f"[PDF] Parsing with PyMuPDF to: {output_dir}")
    parse_start = time.time()
    result = parse_pdf_with_pymupdf(input_pdf_path, output_dir)
    parse_elapsed = time.time() - parse_start
    print(f"[PDF] ✅ Parse completed for {file.filename} in {parse_elapsed:.2f}s")
    print(f"[PDF] Parser outputs: md={result.get('markdown_embedded')}, pages={len(result.get('page_images') or [])}, figures={len(result.get('figures') or [])}")
    print(f"[PDF] Parser result keys: {sorted(result.keys())}")

    # Check cancel flag immediately after parsing
    if _PARSE_CANCEL_FLAG.is_set():
        print(f"[PDF] ⚠️ Operation cancelled after parsing {file.filename} - stopping")
        raise HTTPException(status_code=499, detail="Operation was cancelled")

    # Persist outputs into the pipeline data_dir so they are discoverable
    cfg = PipelineConfig()
    data_dir = Path(cfg.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)

    # Get markdown content from parser result
    print(f"[PDF] 🔍 Getting markdown content from parser result...")
    markdown_content = result.get("markdown_content")
    if markdown_content:
        print(f"[PDF] Markdown content in result: Yes (length: {len(markdown_content)} chars)")
    else:
        print(f"[PDF] Markdown content in result: No (falling back to file read)")
    
    if not markdown_content:
        # Fallback: try to read from file if content not in result
        md_path = Path(result.get("markdown_embedded") or result.get("markdown_referenced") or "")
        print(f"[PDF] 📋 Trying fallback: reading from file {md_path}")
        if md_path and md_path.exists():
            print(f"[PDF] 📋 Reading markdown from file (fallback): {md_path}")
            with open(md_path, "r", encoding="utf-8") as f:
                markdown_content = f.read()
            print(f"[PDF] ✅ Read {len(markdown_content)} chars from file")
        else:
            print(f"[PDF] ❌ No markdown content and file not found: {md_path}")
            raise HTTPException(status_code=500, detail="Parser did not produce markdown output")
    
    # Check cancel flag before processing
    if _PARSE_CANCEL_FLAG.is_set():
        print(f"[PDF] ⚠️ Operation cancelled before processing for {file.filename}")
        raise HTTPException(status_code=499, detail="Operation was cancelled")
    
    doc_id = input_pdf_path.stem
    print(f"[PDF] 📝 Doc ID: {doc_id}")
    print(f"[PDF] Markdown string length: {len(markdown_content)} chars")
    
    # OPTIMIZED: Chunking ngay từ markdown content (không cần đợi lưu file)
    chunk_start = time.time()
    print(f"[PDF] 🚀 Starting chunking directly from parsed markdown (no file I/O) for {doc_id}...")
    print(f"[PDF] Markdown size: {len(markdown_content)} chars")
    try:
        chunks = split_markdown_into_chunks(markdown_content, doc_id, str(input_pdf_path))
        chunk_time = time.time() - chunk_start
        print(f"[PDF] ✅ Created {len(chunks)} chunks in {chunk_time:.2f}s")
    except Exception as e:
        chunk_time = time.time() - chunk_start
        print(f"[PDF] ❌ Chunking failed after {chunk_time:.2f}s: {e}")
        import traceback
        print(f"[PDF] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Chunking failed: {e}")
    
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
        # Don't fail - chunks are already created, markdown file is just for QA

    # Check cancel flag before copying images
    if _PARSE_CANCEL_FLAG.is_set():
        print(f"[PDF] ⚠️ Operation cancelled before copying images for {file.filename}")
        raise HTTPException(status_code=499, detail="Operation was cancelled")

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

    # Build pipeline immediately after parsing (synchronously, end-to-end)
    # Chunks đã được tạo ở trên, giờ chỉ cần embedding → store
    try:
        print("[PDF] Building pipeline end-to-end (chunks + embeddings + store)...")
        build_start = time.time()
        pipeline = await rebuild_pipeline(cfg, lazy_store=False, chunks=chunks)
        build_elapsed = time.time() - build_start
        print(f"[PDF] ✅ Full pipeline ready with {len(pipeline.artifacts.chunks)} chunks; store built={pipeline._store_built}; build_time={build_elapsed:.2f}s")
    except Exception as e:
        print(f"[PDF] ⚠️ Failed to build pipeline immediately: {e}")
        import traceback
        print(f"[PDF] Traceback: {traceback.format_exc()}")
        print("[PDF] Pipeline will be built when chat is accessed")
        # Don't fail the request, pipeline will build on-demand

    return {"status": "ok", "outputs": result}


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


@router.post("/save-and-parse/")
async def save_and_parse_pdfs(files: list[UploadFile] = File(...)):
    """Accept multiple PDFs, persist them, parse, and save outputs into data_dir."""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    cfg = PipelineConfig()
    data_dir = Path(cfg.data_dir)
    uploads_dir = data_dir / "uploads"
    data_dir.mkdir(parents=True, exist_ok=True)
    uploads_dir.mkdir(parents=True, exist_ok=True)

    saved_paths: list[Path] = []
    for f in files:
        if not f.filename.lower().endswith(".pdf"):
            continue
        target = uploads_dir / f.filename
        try:
            with target.open("wb") as out:
                shutil.copyfileobj(f.file, out)
            saved_paths.append(target)
            print(f"[PDF] Saved uploaded PDF: {target}")
        except Exception as e:
            print(f"[PDF] Failed to save {f.filename}: {e}")

    if not saved_paths:
        raise HTTPException(status_code=400, detail="No valid PDF files uploaded")

    # Reset cancel flag for new parse operation
    _PARSE_CANCEL_FLAG.clear()
    print("[PDF] Starting parse operation - cancel flag reset")

    parse_results = []
    all_chunks = []  # Collect all chunks from parsed PDFs to pass directly to pipeline
    for pdf_path in saved_paths:
        # Check cancel flag - if set, stop parsing remaining PDFs
        if _PARSE_CANCEL_FLAG.is_set():
            print(f"[PDF] ⚠️ Parse operation cancelled - skipping remaining PDFs (stopped at {pdf_path.name})")
            break
        
        pdf_key = str(pdf_path.resolve())
        
        # Get or create lock for this file to prevent duplicate parsing
        with _PARSING_LOCK:
            if pdf_key not in _PARSING_FILES:
                _PARSING_FILES[pdf_key] = threading.Lock()
            file_lock = _PARSING_FILES[pdf_key]
        
        # Try to acquire lock (non-blocking check first)
        if not file_lock.acquire(blocking=False):
            print(f"[PDF] ⏳ {pdf_path.name} is already being parsed by another request, skipping duplicate")
            # Wait a bit and check if parsing completed
            for _ in range(10):  # Wait up to 1 second
                time.sleep(0.1)
                if file_lock.acquire(blocking=False):
                    file_lock.release()
                    break
            else:
                # Still locked, skip this file
                print(f"[PDF] ⚠️ {pdf_path.name} is still being parsed, skipping to avoid duplicate")
                continue
        
        try:
            # Check if already parsed - check both data_dir and parsed folder
            expected_md_name = pdf_path.stem + "-embedded.md"  # Parser creates -embedded.md
            target_md = data_dir / expected_md_name
            parsed_folder = pdf_path.parent / f"parsed_{pdf_path.stem}"
            parsed_md = parsed_folder / expected_md_name if parsed_folder.exists() else None
            
            should_parse = True
            existing_md_path = None
            
            # First check: data_dir (final location)
            if target_md.exists():
                pdf_mtime = pdf_path.stat().st_mtime
                md_mtime = target_md.stat().st_mtime
                if md_mtime >= pdf_mtime:
                    print(f"[PDF] ✅ Skipping {pdf_path.name} - already parsed (markdown in data_dir is up-to-date)")
                    should_parse = False
                    existing_md_path = target_md
            # Second check: parsed folder (intermediate location)
            elif parsed_md and parsed_md.exists():
                pdf_mtime = pdf_path.stat().st_mtime
                md_mtime = parsed_md.stat().st_mtime
                if md_mtime >= pdf_mtime:
                    print(f"[PDF] ✅ Reusing existing parse for {pdf_path.name} (found in parsed folder, will copy to data_dir)")
                    should_parse = False
                    existing_md_path = parsed_md
            
            if not should_parse and existing_md_path:
                # Use existing parsed file - copy to data_dir if needed
                if existing_md_path != target_md:
                    # Copy from parsed folder to data_dir
                    target_md.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(existing_md_path, target_md)
                    print(f"[PDF] Copied existing markdown to: {target_md}")
                result = {
                    "markdown_embedded": str(target_md),
                    "markdown_referenced": str(target_md),
                    "page_images": [],
                    "figures": []
                }
            
            if should_parse:
                # Check cancel flag again before starting parse
                if _PARSE_CANCEL_FLAG.is_set():
                    print(f"[PDF] ⚠️ Parse operation cancelled - skipping {pdf_path.name}")
                    break
                
                temp_output = pdf_path.parent / f"parsed_{pdf_path.stem}"
                print(f"[PDF] Parsing saved PDF: {pdf_path} -> {temp_output}")
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

            parse_results.append({"pdf": str(pdf_path), "outputs": result})
        finally:
            # Release lock when done (whether parsed or reused)
            file_lock.release()
            # Clean up lock if no longer needed
            with _PARSING_LOCK:
                if pdf_key in _PARSING_FILES:
                    # Only remove if lock is not locked (no one else using it)
                    try:
                        if not _PARSING_FILES[pdf_key].locked():
                            del _PARSING_FILES[pdf_key]
                    except:
                        pass  # Ignore errors during cleanup

    # Check cancel flag BEFORE building pipeline (this is the expensive operation)
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
        # Check cancel one more time right before the expensive operation
        if _PARSE_CANCEL_FLAG.is_set():
            print(f"[PDF] ⚠️ Operation cancelled right before pipeline build - stopping")
            return {"status": "cancelled", "message": "Operation was cancelled", "count": len(parse_results), "results": parse_results}
        print(f"[PDF] 🔨 Calling rebuild_pipeline with {len(flat_chunks)} chunks directly (no file loading)...")
        build_start = time.time()
        pipeline = await rebuild_pipeline(cfg, lazy_store=False, chunks=flat_chunks)
        build_elapsed = time.time() - build_start
        print(f"[PDF] ✅ Full pipeline ready with {len(pipeline.artifacts.chunks)} chunks; store built={pipeline._store_built}; build_time={build_elapsed:.2f}s")
        
        # Clear cancel flag after successful pipeline build (ready for QA)
        _PARSE_CANCEL_FLAG.clear()
        print("[PDF] ✅ Cancel flag cleared after successful pipeline build - ready for QA")
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


@router.post("/parse-uploads-folder/")
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