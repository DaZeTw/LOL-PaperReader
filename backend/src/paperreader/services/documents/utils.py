from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict, Optional

from bson import ObjectId

from .repository import DocumentRecord

BACKEND_PUBLIC_URL = (
    os.getenv("DOCUMENTS_PUBLIC_BASE_URL")
    or os.getenv("NEXT_PUBLIC_BACKEND_URL")
    or os.getenv("BACKEND_URL")
    or "http://127.0.0.1:8000"
).rstrip("/")


def _stringify(value: Optional[ObjectId | str]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return str(value)
    return str(value)


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return None


def format_document_for_response(document: DocumentRecord) -> Dict[str, Any]:
    document_id = _stringify(document.get("_id")) or ""
    workspace_id = _stringify(document.get("workspace_id"))

    download_url = f"{BACKEND_PUBLIC_URL}/api/documents/download?id={document_id}" if document_id else ""
    file_url = f"{BACKEND_PUBLIC_URL}/api/documents/{document_id}/file" if document_id else ""
    metadata_url = f"{BACKEND_PUBLIC_URL}/api/documents/{document_id}" if document_id else ""

    response = {
        "_id": document_id,
        "workspace_id": workspace_id,
        "title": document.get("title"),
        "original_filename": document.get("original_filename"),
        "stored_path": document.get("stored_path"),
        "pdf_hash": document.get("pdf_hash"),
        "num_pages": document.get("num_pages", 0),
        "total_pages": document.get("total_pages", document.get("num_pages", 0)),
        "status": document.get("status"),
        "source": document.get("source"),
        "preview_image": document.get("preview_image"),
        "author": document.get("author"),
        "subject": document.get("subject"),
        "keywords": document.get("keywords") or [],
        "created_at": _iso(document.get("created_at")),
        "updated_at": _iso(document.get("updated_at")),
        "file_size": document.get("file_size", 0),
        "file_type": document.get("file_type", "pdf"),
        "downloadUrl": download_url,
        "fileUrl": file_url,
        "metadataUrl": metadata_url,
        "year": document.get("year"),
    }
    return response


