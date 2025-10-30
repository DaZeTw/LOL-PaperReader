import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from paperreader.services.parser.pdf_parser import parse_pdf_with_pymupdf
from paperreader.services.qa.config import PipelineConfig
from paperreader.services.qa.pipeline import rebuild_pipeline

router = APIRouter()


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
    result = parse_pdf_with_pymupdf(input_pdf_path, output_dir)
    print(f"[PDF] Parser outputs: md={result.get('markdown_embedded')}, pages={len(result.get('page_images') or [])}, figures={len(result.get('figures') or [])}")

    # Persist outputs into the pipeline data_dir so they are discoverable
    cfg = PipelineConfig()
    data_dir = Path(cfg.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)

    # Copy markdown file
    md_path = Path(result.get("markdown_embedded") or result.get("markdown_referenced"))
    if md_path and md_path.exists():
        target_md = data_dir / md_path.name
        shutil.copyfile(md_path, target_md)
        result["markdown_embedded"] = str(target_md)
        result["markdown_referenced"] = str(target_md)
        print(f"[PDF] Saved markdown to: {target_md}")
    else:
        raise HTTPException(status_code=500, detail="Parser did not produce markdown output")

    # Copy images if any
    for key in ("page_images", "figures"):
        copied = []
        for p in result.get(key, []) or []:
            pth = Path(p)
            if pth.exists():
                target_img = data_dir / pth.name
                try:
                    shutil.copyfile(pth, target_img)
                    copied.append(str(target_img))
                    print(f"[PDF] Saved image to: {target_img}")
                except Exception:
                    # best-effort; skip on error
                    continue
        result[key] = copied

    # Trigger pipeline rebuild in background
    try:
        import asyncio
        asyncio.create_task(rebuild_pipeline(cfg))
        print("[PDF] Triggered pipeline rebuild in background")
    except Exception:
        # If background scheduling fails, it's okay; next ask will rebuild on-demand
        pass

    return {"status": "ok", "outputs": result}


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

    parse_results = []
    for pdf_path in saved_paths:
        temp_output = pdf_path.parent / f"parsed_{pdf_path.stem}"
        print(f"[PDF] Parsing saved PDF: {pdf_path} -> {temp_output}")
        result = parse_pdf_with_pymupdf(pdf_path, temp_output)

        # Copy markdown
        md_path = Path(result.get("markdown_embedded") or result.get("markdown_referenced") or "")
        if md_path and md_path.exists():
            target_md = data_dir / md_path.name
            shutil.copyfile(md_path, target_md)
            result["markdown_embedded"] = str(target_md)
            result["markdown_referenced"] = str(target_md)
            print(f"[PDF] Saved markdown to: {target_md}")

        # Copy images
        for key in ("page_images", "figures"):
            copied = []
            for p in result.get(key, []) or []:
                pth = Path(p)
                if pth.exists():
                    target_img = data_dir / pth.name
                    try:
                        shutil.copyfile(pth, target_img)
                        copied.append(str(target_img))
                        print(f"[PDF] Saved image to: {target_img}")
                    except Exception:
                        continue
            result[key] = copied

        parse_results.append({"pdf": str(pdf_path), "outputs": result})

    # Trigger pipeline rebuild
    try:
        import asyncio
        asyncio.create_task(rebuild_pipeline(cfg))
        print("[PDF] Triggered pipeline rebuild in background (after multi-parse)")
    except Exception:
        pass

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

    parse_results = []
    for pdf_path in pdf_paths:
        temp_output = pdf_path.parent / f"parsed_{pdf_path.stem}"
        print(f"[PDF] Parsing existing uploaded PDF: {pdf_path} -> {temp_output}")
        result = parse_pdf_with_pymupdf(pdf_path, temp_output)

        # Copy markdown
        md_path = Path(result.get("markdown_embedded") or result.get("markdown_referenced") or "")
        if md_path and md_path.exists():
            target_md = data_dir / md_path.name
            shutil.copyfile(md_path, target_md)
            result["markdown_embedded"] = str(target_md)
            result["markdown_referenced"] = str(target_md)
            print(f"[PDF] Saved markdown to: {target_md}")

        # Copy images
        for key in ("page_images", "figures"):
            copied = []
            for p in result.get(key, []) or []:
                pth = Path(p)
                if pth.exists():
                    target_img = data_dir / pth.name
                    try:
                        shutil.copyfile(pth, target_img)
                        copied.append(str(target_img))
                        print(f"[PDF] Saved image to: {target_img}")
                    except Exception:
                        continue
            result[key] = copied

        parse_results.append({"pdf": str(pdf_path), "outputs": result})

    # Trigger pipeline rebuild
    try:
        import asyncio
        asyncio.create_task(rebuild_pipeline(cfg))
        print("[PDF] Triggered pipeline rebuild in background (parse-uploads-folder)")
    except Exception:
        pass

    return {"status": "ok", "count": len(parse_results), "results": parse_results}