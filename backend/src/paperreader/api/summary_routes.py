"""
API routes for paper summarization using Docling and Pydantic AI.
"""

import json
import os
import tempfile
from enum import Enum
from pathlib import Path
from typing import Dict, List

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from pydantic_ai import Agent

from docling.datamodel.base_models import InputFormat
from docling.datamodel.accelerator_options import AcceleratorOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.pipeline.standard_pdf_pipeline import ThreadedPdfPipelineOptions
from docling_core.types.doc.document import SectionHeaderItem, TextItem

from paperreader.api.prompt import (
    FINAL_FILL_PROMPT_TEMPLATE,
    FINAL_SUMMARY_SYSTEM_PROMPT,
    SELECT_IMPORTANT_SECTIONS_PROMPT,
    SELECT_IMPORTANT_SECTIONS_SYSTEM_PROMPT,
    SUMMARY_TEMPLATE_PROMPT,
    SUMMARY_TEMPLATE_SYSTEM_PROMPT,
)
from paperreader.services.documents.repository import (
    get_document_by_id,
    to_object_id,
)
from paperreader.services.documents.minio_client import download_bytes
from paperreader.services.documents.summary_repository import (
    delete_summary_by_document,
    get_summary_by_document,
    summary_exists,
    upsert_summary,
)

router = APIRouter()

MINIO_BUCKET = os.getenv("MINIO_BUCKET", "pdf-documents")


class ImportantSectionsResponse(BaseModel):
    """Pydantic model for important sections selection."""
    important_sections: List[str]


class SummaryTemplateResponse(BaseModel):
    """Pydantic model for summary template creation."""
    summary_template: Dict[str, str]


class FinalSummary(BaseModel):
    """Pydantic model for final filled summary."""
    summary_template: Dict[str, str]


class SummarySaveRequest(BaseModel):
    """Payload for saving a generated summary."""
    document_id: str
    summary_template: Dict[str, str]
    important_sections: List[str]


class SummarySaveResponse(BaseModel):
    """Response for saving a summary."""
    summary_id: str


class SummaryField(str, Enum):
    """Fields that can be requested when retrieving a saved summary."""
    summary_final = "summary_final"
    important_sections = "important_sections"


def _create_docling_converter():
    """Create and configure Docling DocumentConverter with optimized settings."""
    accelerator_options = AcceleratorOptions(
        num_threads=4, 
        device="cpu"
    )

    pipeline_opts = ThreadedPdfPipelineOptions(
        do_ocr=False,                  # Disable OCR for faster processing
        do_table_structure=False,      # Disable table analysis
        do_math_recognition=False,     # Disable formula recognition
        do_picture_classification=False,  # Disable image classification
        do_picture_description=False,     # Disable image description
        accelerator_options=accelerator_options,
    )

    pdf_opts = PdfFormatOption(pipeline_options=pipeline_opts)
    converter = DocumentConverter(format_options={InputFormat.PDF: pdf_opts})
    return converter


def _extract_sections_from_pdf(pdf_path: Path) -> List[Dict]:
    """Extract sections from PDF using Docling."""
    converter = _create_docling_converter()
    doc = converter.convert(str(pdf_path)).document

    sections_output = []
    current_section = None

    for item in doc.texts:
        if isinstance(item, SectionHeaderItem):
            current_section = {
                "type": "section",
                "title": item.text,
                "level": item.level,
                "content": []
            }
            sections_output.append(current_section)
        elif isinstance(item, TextItem):
            if current_section:
                current_section["content"].append(item.text)

    return sections_output


def _get_section_content(title: str, sections: List[Dict]) -> str:
    """Get content for a specific section title."""
    for sec in sections:
        if sec.get("type") == "section" and sec.get("title") == title:
            return "\n".join(sec.get("content", []))
    return ""


async def _select_important_sections(section_names: List[str]) -> List[str]:
    """Step 1: Select important sections from the paper using Pydantic AI."""
    prompt = SELECT_IMPORTANT_SECTIONS_PROMPT.format(
        section_titles_json=json.dumps(section_names, indent=2)
    )

    agent = Agent(
        model="gpt-4o-mini",
        system_prompt=SELECT_IMPORTANT_SECTIONS_SYSTEM_PROMPT,
        output_type=ImportantSectionsResponse,
        retries=0,
    )

    result = await agent.run(prompt)
    raw_output = getattr(result, "raw_output", None)
    if raw_output is not None:
        print("[Summary] Step 1 - RAW LLM OUTPUT (select sections):\n", raw_output)

    return result.output.important_sections


async def _create_summary_template_from_sections(important_sections: List[str]) -> Dict[str, str]:
    """Step 2: Create summary template based on important sections using Pydantic AI."""
    prompt = SUMMARY_TEMPLATE_PROMPT.format(
        important_sections_json=json.dumps(important_sections, indent=2)
    )

    agent = Agent(
        model="gpt-4o-mini",
        system_prompt=SUMMARY_TEMPLATE_SYSTEM_PROMPT,
        output_type=str,
        retries=0,
    )

    result = await agent.run(prompt)
    raw_output = result.output.strip() if isinstance(result.output, str) else str(result.output)
    print("[Summary] Step 2 - RAW LLM OUTPUT (create template):\n", raw_output)

    if raw_output.startswith("```"):
        parts = raw_output.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("{") or part.startswith("["):
                raw_output = part
                break
        else:
            raw_output = raw_output.strip("`")

    raw_output = raw_output.strip()
    try:
        parsed = json.loads(raw_output)
    except json.JSONDecodeError as json_error:
        print(f"[Summary] Step 2 JSON decode error: {json_error}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse summary template JSON: {str(json_error)}"
        )

    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=500,
            detail="Summary template response must be a JSON object."
        )

    summary_template = parsed.get("summary_template", parsed)
    if not isinstance(summary_template, dict):
        raise HTTPException(
            status_code=500,
            detail="'summary_template' must be an object with string values."
        )

    normalized = {str(k): str(v) if v is not None else "" for k, v in summary_template.items()}
    return normalized


async def _generate_summary_template(section_names: List[str]) -> tuple[List[str], Dict[str, str]]:
    """Generate summary template using LLM - now split into 2 steps.
    
    Returns:
        tuple: (important_sections, summary_template)
    """
    # Step 1: Select important sections
    print(f"[Summary] Step 1: Selecting important sections from {len(section_names)} sections")
    important_sections = await _select_important_sections(section_names)
    print(f"[Summary] Selected {len(important_sections)} important sections: {important_sections}")

    # ==========================
    # PREPROCESSING STEP (NEW)
    # ==========================
    def clean_section_name(name: str) -> str:
        # Loại bỏ ký tự nguy hiểm với JSON và LLM
        cleaned = (
            name.replace(":", " -")
                .replace("/", " / ")
                .replace("\\", " ")
                .replace("*", " ")
                .replace("#", " ")
                .strip()
        )
        return cleaned

    cleaned_sections = [clean_section_name(sec) for sec in important_sections]
    print(f"[Summary] Cleaned important sections: {cleaned_sections}")

    # Step 2: Create summary template from cleaned important sections
    print(f"[Summary] Step 2: Creating summary template from important sections")
    summary_template = await _create_summary_template_from_sections(cleaned_sections)
    print(f"[Summary] Created template with {len(summary_template)} fields: {list(summary_template.keys())}")

    return cleaned_sections, summary_template



async def _fill_summary_template(
    template: Dict[str, str],
    important_sections: List[str],
    sections: List[Dict]
) -> Dict[str, str]:
    """Fill the summary template with content from important sections."""
    # Combine content from important sections
    important_content_blocks = []
    for sec_title in important_sections:
        content = _get_section_content(sec_title, sections)
        if content:
            important_content_blocks.append(f"## SECTION: {sec_title}\n{content}")

    combined_text = "\n\n".join(important_content_blocks)

    if not combined_text:
        raise HTTPException(
            status_code=400,
            detail="No content found for important sections"
        )

    final_prompt = FINAL_FILL_PROMPT_TEMPLATE.format(
        template_json=json.dumps(template, indent=2),
        combined_text=combined_text
    )

    # System prompt matching FINAL_FILL_PROMPT_TEMPLATE
    agent = Agent(
        model="gpt-4o",
        system_prompt=FINAL_SUMMARY_SYSTEM_PROMPT,
        output_type=FinalSummary,
        retries=2,  # Disable retries to fail fast and see raw response
    )

    # Quick wrapper to run agent and print raw output before Pydantic validation
    # Commenting out fallback and direct return to observe raw behaviour
    result = await agent.run(final_prompt)
    raw_output = getattr(result, "raw_output", None)
    if raw_output is not None:
        print("RAW LLM OUTPUT:\n", raw_output)
    raw_response = (
        getattr(result, "raw_response", None)
        or getattr(result, "raw", None)
        or getattr(result, "all_messages", None)
        or getattr(result, "messages", None)
    )
    if raw_response is not None:
        print(f"[Summary] Pydantic fill raw response: {raw_response}")

    return result.output.summary_template


@router.post("/summarize")
async def summarize_paper(
    document_id: str = Query(
        ...,
        description="Document ID to summarize from storage",
    ),
):
    """
    Summarize a scientific paper PDF.
    
    The endpoint loads the PDF from MinIO using the provided document_id and then:
    1. Extract sections from PDF using Docling
    2. Generate summary template using LLM
    3. Fill template with content from important sections
    
    Returns a structured summary with fields like Motivation, Problem Statement, Method, Results, etc.
    """
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
        print(f"[Summary] Downloading PDF from MinIO: {stored_path}")
        pdf_bytes = await download_bytes(MINIO_BUCKET, stored_path)
        filename = document.get("original_filename") or f"document-{document_id}.pdf"
        print(f"[Summary] Downloaded PDF ({len(pdf_bytes)} bytes)")
    except Exception as exc:
        print(f"[Summary] Failed to download PDF from MinIO: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download document file: {str(exc)}"
        )

    if not pdf_bytes or filename is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to load PDF content"
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
        tmp_path = Path(tmp_file.name)
        try:
            tmp_path.write_bytes(pdf_bytes)

            print(f"[Summary] Extracting sections from PDF: {filename}")
            sections = _extract_sections_from_pdf(tmp_path)

            if not sections:
                raise HTTPException(
                    status_code=400,
                    detail="No sections found in PDF"
                )

            section_names = [
                s["title"] for s in sections
                if s.get("type") == "section"
            ]

            if not section_names:
                raise HTTPException(
                    status_code=400,
                    detail="No section titles found in PDF"
                )

            print(f"[Summary] Generating summary template for {len(section_names)} sections")
            important_sections, summary_template = await _generate_summary_template(section_names)

            print(f"[Summary] Filling template with content from {len(important_sections)} important sections")
            filled_summary = await _fill_summary_template(
                summary_template,
                important_sections,
                sections
            )

            return {
                "status": "success",
                "filename": filename,
                "important_sections": important_sections,
                "summary": filled_summary,
                "source": "document",
                "document_id": document_id,
            }

        except HTTPException:
            raise
        except Exception as e:
            print(f"[Summary] Error processing PDF: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to summarize paper: {str(e)}"
            )
        finally:
            try:
                if tmp_path.exists():
                    tmp_path.unlink()
            except Exception:
                pass


@router.post("/summary/save", response_model=SummarySaveResponse)
async def save_summary(payload: SummarySaveRequest) -> SummarySaveResponse:
    """
    Persist a generated summary for a document.
    """
    document_object_id = to_object_id(payload.document_id)
    if document_object_id is None:
        raise HTTPException(status_code=400, detail=f"Invalid document_id: {payload.document_id}")

    document = await get_document_by_id(document_object_id)
    if not document:
        raise HTTPException(status_code=404, detail=f"Document not found: {payload.document_id}")

    record = await upsert_summary(
        document_object_id,
        payload.summary_template,
        payload.important_sections,
    )
    summary_id = record.get("_id")
    if summary_id is None:
        raise HTTPException(status_code=500, detail="Failed to save summary")

    return SummarySaveResponse(summary_id=str(summary_id))


@router.get("/summary/{document_id}")
async def get_saved_summary(
    document_id: str,
    fields: SummaryField | None = Query(
        default=None,
        description="Optional filter: 'summary_final' or 'important_sections'",
    ),
):
    """
    Retrieve a previously saved summary for a document.

    When `fields` is provided, only the requested portion is included in the response.
    """
    object_id = to_object_id(document_id)
    if object_id is None:
        raise HTTPException(status_code=400, detail=f"Invalid document_id: {document_id}")

    record = await get_summary_by_document(object_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"No summary found for document: {document_id}")

    response: Dict[str, object] = {
        "document_id": document_id,
        "summary_id": str(record.get("_id")),
    }

    if fields is None:
        response["summary_final"] = record.get("summary_template", {})
        response["important_sections"] = record.get("important_sections", [])
    elif fields is SummaryField.summary_final:
        response["summary_final"] = record.get("summary_template", {})
    elif fields is SummaryField.important_sections:
        response["important_sections"] = record.get("important_sections", [])
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported fields value: {fields}")

    return response


@router.delete("/summary/by-document/{document_id}")
async def delete_summary(document_id: str):
    """
    Delete the saved summary associated with the provided document_id.
    """
    object_id = to_object_id(document_id)
    if object_id is None:
        raise HTTPException(status_code=400, detail=f"Invalid document_id: {document_id}")

    deleted = await delete_summary_by_document(object_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No summary found for document: {document_id}")

    return {"status": "deleted", "document_id": document_id}


@router.get("/summary/{document_id}/exists")
async def check_summary_exists(document_id: str):
    """
    Check whether a summary already exists for the provided document.
    """
    object_id = to_object_id(document_id)
    if object_id is None:
        raise HTTPException(status_code=400, detail=f"Invalid document_id: {document_id}")

    exists = await summary_exists(object_id)
    return {"document_id": document_id, "exists": exists}


class SummaryProcessRequest(BaseModel):
    """Payload for generating or retrieving a summary for a document."""
    document_id: str
    fields: SummaryField | None = None


@router.post("/summary/process")
async def process_summary(payload: SummaryProcessRequest):
    """
    Generate a summary for the provided document when missing; otherwise return the saved copy.

    The `fields` parameter mirrors `GET /summary/{document_id}` allowing users to request the
    complete summary or a specific portion.
    """
    object_id = to_object_id(payload.document_id)
    if object_id is None:
        raise HTTPException(status_code=400, detail=f"Invalid document_id: {payload.document_id}")

    existing = await get_summary_by_document(object_id)
    if existing:
        return await get_saved_summary(payload.document_id, payload.fields)

    result = await summarize_paper(payload.document_id)
    summary_template = result.get("summary", {})
    important_sections = result.get("important_sections", [])

    await upsert_summary(object_id, summary_template, important_sections)

    if payload.fields is None:
        return {
            "document_id": payload.document_id,
            "summary_final": summary_template,
            "important_sections": important_sections,
        }
    if payload.fields is SummaryField.summary_final:
        return {
            "document_id": payload.document_id,
            "summary_final": summary_template,
        }
    if payload.fields is SummaryField.important_sections:
        return {
            "document_id": payload.document_id,
            "important_sections": important_sections,
        }
    raise HTTPException(status_code=400, detail=f"Unsupported fields value: {payload.fields}")

