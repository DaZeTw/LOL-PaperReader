from __future__ import annotations

import asyncio
import hashlib
import os
import secrets
import time
from collections import deque
from pathlib import Path
from typing import List, Optional

import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from paperreader.api.dependencies import require_user_id
from paperreader.services.documents.minio_client import (
    delete_object,
    delete_objects_by_prefix,
    get_presigned_url,
    upload_bytes,
)
from paperreader.services.documents.repository import (
    DocumentRecord,
    add_document_to_workspace,
    clear_workspace_documents,
    create_document,
    delete_all_documents_for_user,
    delete_documents_by_ids,
    get_documents_by_ids,
    get_documents_by_user_id,
    get_or_create_workspace,
    remove_documents_from_workspace,
    to_object_id,
    update_document,
    update_document_status,
)
from paperreader.services.documents.chunk_repository import delete_document_chunks
from paperreader.services.qa.elasticsearch_client import delete_document_chunks as delete_elasticsearch_chunks
from paperreader.services.chat import repository as chat_repository
from paperreader.services.documents.utils import format_document_for_response

router = APIRouter(prefix="/api/documents", tags=["Documents"])

BACKEND_INTERNAL_URL = (
    os.getenv("INTERNAL_BACKEND_URL")
    or os.getenv("BACKEND_URL")
    or "http://127.0.0.1:8000"
).rstrip("/")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "pdf-documents")

# PDF Processing Queue - processes PDFs sequentially
_PDF_QUEUE: deque = deque()
_PDF_QUEUE_PROCESSING = False
_PDF_QUEUE_LOCK: Optional[asyncio.Lock] = None

def _get_queue_lock() -> asyncio.Lock:
    """Get or create the queue lock."""
    global _PDF_QUEUE_LOCK
    if _PDF_QUEUE_LOCK is None:
        _PDF_QUEUE_LOCK = asyncio.Lock()
    return _PDF_QUEUE_LOCK


class DeleteDocumentsRequest(BaseModel):
    documentIds: Optional[List[str]] = None
    deleteAll: Optional[bool] = False


@router.get("/")
async def list_documents(
    search: Optional[str] = Query(None),
    user_id: str = Depends(require_user_id),
):
    documents = await get_documents_by_user_id(user_id, search=search)
    formatted = [format_document_for_response(doc) for doc in documents]
    return {"documents": formatted, "total": len(formatted)}


@router.get("/download")
async def download_document(
    id: str = Query(..., description="Document ID"),
    user_id: str = Depends(require_user_id),
):
    return await _stream_document_response(id, user_id)


@router.get("/{document_id}")
async def get_document(document_id: str, user_id: str = Depends(require_user_id)):
    object_id = to_object_id(document_id)
    if not object_id:
        raise HTTPException(status_code=400, detail="Invalid document id")

    document = await update_and_fetch_document(object_id, user_id)
    return {"document": format_document_for_response(document)}


@router.get("/{document_id}/file")
async def get_document_file(document_id: str, user_id: str = Depends(require_user_id)):
    """
    Serve PDF file for a document.
    Note: File access is NOT blocked by parsing/chunking status.
    The file is available immediately after upload, regardless of background processing.
    """
    return await _stream_document_response(document_id, user_id)


@router.post("/")
async def upload_document(
    file: UploadFile = File(...),
    user_id: str = Depends(require_user_id),
):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    filename = file.filename
    content_type = file.content_type or "application/pdf"
    if "pdf" not in content_type.lower() and not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file provided")

    # Calculate deterministic hash for reuse detection and metadata tracking
    pdf_hash = hashlib.sha256(file_bytes).hexdigest()

    unique_id = secrets.token_hex(16)
    timestamp = int(time.time())
    safe_name = filename.replace(" ", "_")
    object_name = f"{user_id}/{timestamp}-{unique_id}-{safe_name}"

    # Upload file to MinIO first - this ensures the file is available immediately
    # even if parsing/chunking is still in progress
    await upload_bytes(MINIO_BUCKET, object_name, file_bytes, content_type)

    workspace = await get_or_create_workspace(user_id)
    title = Path(filename).stem or "Untitled Document"

    # Create document with stored_path set - file is already in MinIO and accessible
    document = await create_document(
        {
            "user_id": user_id,
            "workspace_id": workspace.get("_id"),
            "title": title,
            "original_filename": filename,
            "stored_path": object_name,  # File is already uploaded, so this is valid
            "num_pages": 0,
            "status": "uploading",
            "source": "upload",
            "file_size": len(file_bytes),
            "file_type": "pdf",
            "pdf_hash": pdf_hash,
            "total_pages": 0,
            "author": "",
            "subject": "",
            "keywords": [],
        }
    )

    if workspace.get("_id") and document.get("_id"):
        await add_document_to_workspace(workspace["_id"], document["_id"])

    # Update status to parsing - this does NOT block file access
    # The file is already in MinIO and can be served immediately
    if document.get("_id"):
        await update_document_status(document["_id"], "parsing")
        document["status"] = "parsing"

    # Add PDF to processing queue - this ensures sequential processing
    await _enqueue_pdf_processing(
        document_id=str(document.get("_id")),
        file_bytes=file_bytes,
        filename=filename,
    )

    formatted = format_document_for_response(document)
    return {"message": "PDF uploaded successfully", "documentId": formatted["_id"], "document": formatted}


@router.post("/delete")
async def delete_documents(
    payload: DeleteDocumentsRequest,
    user_id: str = Depends(require_user_id),
):
    delete_all = bool(payload.deleteAll)
    document_ids = payload.documentIds or []

    if not delete_all and not document_ids:
        raise HTTPException(status_code=400, detail="No documents specified")

    documents: List[DocumentRecord]
    if delete_all:
        documents = await get_documents_by_user_id(user_id)
    else:
        object_ids = [oid for id_ in document_ids if (oid := to_object_id(id_))]
        if not object_ids:
            raise HTTPException(status_code=400, detail="Invalid document ids provided")
        documents = await get_documents_by_ids(user_id, object_ids)

    if not documents:
        return {"deletedCount": 0}

    for doc in documents:
        stored_path = doc.get("stored_path")
        if stored_path:
            try:
                await delete_object(MINIO_BUCKET, stored_path)
            except Exception as exc:
                print(f"[Documents] Failed to delete {stored_path} from MinIO: {exc}")
        
        # Delete associated images and tables from MinIO
        # Path pattern: {user_id}/document/{document_id}/...
        doc_id = doc.get("_id")
        if doc_id:
            document_id_str = str(doc_id)
            asset_prefix = f"{user_id}/document/{document_id_str}/"
            try:
                deleted_count = await delete_objects_by_prefix(MINIO_BUCKET, asset_prefix)
                if deleted_count > 0:
                    print(f"[Documents] Deleted {deleted_count} associated files (images/tables) for document {document_id_str}")
            except Exception as exc:
                print(f"[Documents] Failed to delete associated files for document {document_id_str}: {exc}")
            
            # Get document_key from document (usually the PDF filename without extension)
            document_key = doc.get("filename") or doc.get("title") or document_id_str
            if document_key and document_key.endswith(".pdf"):
                document_key = document_key[:-4]  # Remove .pdf extension
            
            # Delete chunks from MongoDB
            try:
                chunks_deleted = await delete_document_chunks(
                    document_id=document_id_str,
                    document_key=document_key
                )
                if chunks_deleted > 0:
                    print(f"[Documents] ✅ Deleted {chunks_deleted} chunks from MongoDB for document {document_id_str}")
            except Exception as exc:
                print(f"[Documents] ⚠️ Failed to delete chunks from MongoDB for document {document_id_str}: {exc}")
            
            # Delete embeddings from Elasticsearch
            try:
                await delete_elasticsearch_chunks(
                    document_key=document_key,
                    document_id=document_id_str
                )
            except Exception as exc:
                print(f"[Documents] ⚠️ Failed to delete embeddings from Elasticsearch: {exc}")
            
            # Delete chat sessions and messages related to this document
            try:
                sessions_deleted = await chat_repository.delete_sessions_by_document(
                    document_id=document_id_str,
                    document_key=document_key
                )
                if sessions_deleted > 0:
                    print(f"[Documents] ✅ Deleted {sessions_deleted} chat sessions and messages for document {document_id_str}")
            except Exception as exc:
                print(f"[Documents] ⚠️ Failed to delete chat sessions for document {document_id_str}: {exc}")

    workspace_groups = {}
    for doc in documents:
        workspace_id = doc.get("workspace_id")
        doc_id = doc.get("_id")
        if workspace_id and doc_id:
            workspace_groups.setdefault(str(workspace_id), []).append(doc_id)

    for workspace_id_str, doc_ids in workspace_groups.items():
        workspace_object_id = to_object_id(workspace_id_str)
        if not workspace_object_id:
            continue
        if delete_all:
            await clear_workspace_documents(workspace_object_id)
        else:
            await remove_documents_from_workspace(workspace_object_id, doc_ids)

    if delete_all:
        deleted_count = await delete_all_documents_for_user(user_id)
    else:
        object_ids = [doc["_id"] for doc in documents if isinstance(doc.get("_id"), ObjectId)]
        deleted_count = await delete_documents_by_ids(user_id, object_ids)

    return {"deletedCount": deleted_count}


async def update_and_fetch_document(document_id: ObjectId, user_id: str) -> DocumentRecord:
    documents = await get_documents_by_ids(user_id, [document_id])
    if not documents:
        raise HTTPException(status_code=404, detail="Document not found")
    return documents[0]


async def _stream_document_response(document_id: str, user_id: str):
    object_id = to_object_id(document_id)
    if not object_id:
        raise HTTPException(status_code=400, detail="Invalid document id")

    try:
        document = await update_and_fetch_document(object_id, user_id)
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[Documents] Error fetching document {document_id}: {exc}")
        raise HTTPException(status_code=500, detail=f"Error fetching document: {str(exc)}")

    stored_path = document.get("stored_path")
    if not stored_path:
        print(f"[Documents] Document {document_id} has no stored_path. Status: {document.get('status')}")
        raise HTTPException(
            status_code=404, 
            detail="Document file not found. The file may still be uploading. Please try again in a moment."
        )

    filename = document.get("original_filename") or f"document-{document_id}.pdf"
    
    print(f"[Documents] Serving file for document {document_id}: {stored_path}")

    document_status = str(document.get("status") or "").lower()
    embedding_status = str(document.get("embedding_status") or "").lower()

    try:
        internal_url = await get_presigned_url(MINIO_BUCKET, stored_path, external=False)
        response = await _try_stream_presigned(internal_url, filename)
        if response:
            print(f"[Documents] Successfully streamed file using internal URL")
            return response
    except Exception as exc:
        print(f"[Documents] Error with internal presigned URL: {exc}")

    try:
        external_url = await get_presigned_url(MINIO_BUCKET, stored_path, external=True)
        response = await _try_stream_presigned(external_url, filename)
        if response:
            print(f"[Documents] Successfully streamed file using external URL")
            return response
    except Exception as exc:
        print(f"[Documents] Error with external presigned URL: {exc}")

    print(f"[Documents] Failed to fetch document {document_id} from storage (stored_path: {stored_path})")
    if document_status in {"uploading", "processing", "parsing", "pending"} or embedding_status in {"processing", "pending"}:
        raise HTTPException(
            status_code=503,
            detail="Document is still being processed. Please wait a moment and try again.",
        )
    raise HTTPException(
        status_code=502, 
        detail="Failed to fetch document from storage. Please try again or contact support if the problem persists."
    )


async def _try_stream_presigned(url: str, filename: str) -> Optional[StreamingResponse]:
    if not url:
        return None
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Fetch the entire file from presigned URL
            resp = await client.get(url)
            
            if resp.status_code != 200:
                print(f"[Documents] Unexpected response fetching presigned URL: status={resp.status_code}")
                if resp.content:
                    print(f"[Documents] Response body: {resp.content[:200]}")
                return None
            content_type = (resp.headers.get("content-type") or "application/pdf").lower()
            if "pdf" not in content_type and "octet-stream" not in content_type:
                print(f"[Documents] Unexpected content-type when streaming presigned URL: {content_type}")
                snippet = resp.content[:200]
                try:
                    snippet = snippet.decode("utf-8", errors="ignore")
                except Exception:
                    snippet = str(snippet)
                print(f"[Documents] Response preview (truncated): {snippet}")
                return None

            media_type = "application/pdf" if "pdf" in content_type else content_type
            content_length = resp.headers.get("content-length") or str(len(resp.content))
            content_disposition = resp.headers.get(
                "content-disposition",
                f'inline; filename="{filename.replace(chr(34), "")}"',
            )

            headers = {
                "Content-Type": media_type,
                "Content-Disposition": content_disposition,
                "Content-Length": content_length,
            }

            # Stream the content in chunks
            async def iterator():
                chunk_size = 8192
                content = resp.content
                for i in range(0, len(content), chunk_size):
                    yield content[i:i + chunk_size]

            return StreamingResponse(iterator(), media_type=media_type, headers=headers)
    except Exception as exc:
        print(f"[Documents] Error streaming presigned URL: {exc}")
        import traceback
        print(f"[Documents] Traceback: {traceback.format_exc()}")
        return None


async def _process_pdf_queue():
    """Process PDFs from the queue sequentially."""
    global _PDF_QUEUE_PROCESSING
    
    while True:
        async with _get_queue_lock():
            if not _PDF_QUEUE:
                _PDF_QUEUE_PROCESSING = False
                break
            _PDF_QUEUE_PROCESSING = True
            job = _PDF_QUEUE.popleft()
        
        document_id, file_bytes, filename = job
        print(f"[Documents] 🚀 Processing PDF from queue: {filename} (document_id: {document_id}, queue remaining: {len(_PDF_QUEUE)})")
        
        try:
            await _forward_to_parser(document_id, file_bytes, filename)
            print(f"[Documents] ✅ Completed processing PDF from queue: {filename}")
        except Exception as exc:
            print(f"[Documents] ⚠️ Error processing PDF {filename} from queue: {exc}")
            import traceback
            print(f"[Documents] Traceback: {traceback.format_exc()}")
            try:
                await _mark_document_error(document_id, str(exc))
            except Exception as mark_error:
                print(f"[Documents] ⚠️ Failed to mark document error: {mark_error}")


async def _enqueue_pdf_processing(document_id: str, file_bytes: bytes, filename: str) -> None:
    """Add a PDF to the processing queue."""
    async with _get_queue_lock():
        _PDF_QUEUE.append((document_id, file_bytes, filename))
        print(f"[Documents] 📋 Added PDF to queue: {filename} (queue size: {len(_PDF_QUEUE)})")
        
        # Start queue processor if not already running
        if not _PDF_QUEUE_PROCESSING:
            asyncio.create_task(_process_pdf_queue())


async def _forward_to_parser(document_id: Optional[str], file_bytes: bytes, filename: str) -> None:
    if not document_id:
        return

    url = f"{BACKEND_INTERNAL_URL}/api/pdf/save-and-parse/"
    try:
        async with httpx.AsyncClient(timeout=240.0) as client:
            files = {"files": (filename, file_bytes, "application/pdf")}
            headers = {"X-Document-Id": document_id}
            resp = await client.post(url, files=files, headers=headers)
            if resp.status_code != 200:
                await _mark_document_error(document_id, f"Backend returned {resp.status_code}")
                return

            try:
                payload = resp.json()
            except Exception:
                payload = {}

            status = payload.get("status") if isinstance(payload, dict) else None
            if status == "queued":
                job_id = payload.get("jobId")
                print(f"[Documents] Parse job queued for {document_id}: {job_id}")
                return

            if status == "ok" and isinstance(payload, dict):
                first_result = (payload.get("results") or [{}])[0]
                outputs = first_result.get("outputs", {})
                num_pages = 0
                if isinstance(outputs, dict):
                    num_pages = outputs.get("num_pages") or len(outputs.get("page_images") or []) or 0

                await update_document(
                    ObjectId(document_id),
                    {
                        "status": "ready",
                        "num_pages": num_pages,
                    },
                )
    except Exception as exc:
        await _mark_document_error(document_id, str(exc))


async def _mark_document_error(document_id: str, message: str) -> None:
    print(f"[Documents] Background parse failed for {document_id}: {message}")
    try:
        await update_document_status(ObjectId(document_id), "error")
    except Exception as exc:
        print(f"[Documents] Failed to mark document error: {exc}")

