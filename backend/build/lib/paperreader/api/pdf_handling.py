import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from services.parser.pdf_parser import parse_pdf_with_docling

router = APIRouter()


@router.post("/upload-pdf/")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    # Save the uploaded PDF temporarily
    temp_dir = Path(tempfile.mkdtemp())
    temp_file = temp_dir / file.filename

    with temp_file.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    # ✅ Return the same PDF file back as response
    return FileResponse(
        path=temp_file, filename=file.filename, media_type="application/pdf"
    )


@router.post("/upload-and-parse/")
async def upload_and_parse_pdf(file: UploadFile = File(...)):
    temp_dir = Path(tempfile.mkdtemp())
    input_pdf_path = temp_dir / file.filename

    with input_pdf_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    output_dir = temp_dir / "parsed_output"
    result = parse_pdf_with_docling(input_pdf_path, output_dir)

    return {"status": "ok", "outputs": result}
