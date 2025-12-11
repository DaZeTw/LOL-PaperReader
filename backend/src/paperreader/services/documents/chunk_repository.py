from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
import hashlib

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from paperreader.database.mongodb import mongodb


def _chunks_collection() -> AsyncIOMotorCollection:
    """Get the chunks collection. Using 'chunks' as collection name to match schema."""
    return mongodb.get_collection("chunks")


def _make_chunk_id(document_id: str, chunk: Dict[str, Any], index: int) -> str:
    text = chunk.get("text", "") or ""
    seed = f"{document_id}::{index}::{text[:200]}"
    return hashlib.sha1(seed.encode("utf-8")).hexdigest()


async def replace_document_chunks(
    *,
    document_id: str,
    chunks: Iterable[Dict[str, Any]],
) -> int:
    """
    Replace all chunks associated with a document by document_id.
    
    Schema matches:
    {
        _id: ObjectId,
        document_id: ObjectId,
        page_number: Number,
        text: String,
        hash: String, // SHA256(text) để tránh embed trùng
        created_at: Date
    }

    Args:
        document_id: Document ID (ObjectId string) referencing documents collection.
        chunks: Iterable of chunk dictionaries produced by the parser.

    Returns:
        Number of chunks written.
    """
    if not document_id:
        raise ValueError("document_id is required")
    
    collection = _chunks_collection()
    # Delete by document_id
    try:
        doc_object_id = ObjectId(document_id)
        await collection.delete_many({"document_id": doc_object_id})
    except Exception:
        raise ValueError(f"Invalid document_id: {document_id}")

    now = datetime.utcnow()
    docs: List[Dict[str, Any]] = []

    # Convert document_id to ObjectId
    try:
        doc_object_id = ObjectId(document_id)
    except Exception:
        raise ValueError(f"Invalid document_id: {document_id}")
    
    for idx, chunk in enumerate(chunks):
        chunk_id = chunk.get("chunk_id") or _make_chunk_id(document_id, chunk, idx)
        text = chunk.get("text", "") or ""
        
        # Remove "[View CSV](...)" patterns from text
        # Pattern matches: [View CSV](path/to/file.csv) or [View CSV]() with optional whitespace before
        text = re.sub(r'\s*\[View CSV\]\([^)]*\)', '', text)
        
        # Calculate SHA256 hash of text to avoid duplicate embeddings
        text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        
        # Get page number (support both 'page' and 'page_number' fields)
        page_number = chunk.get("page_number") or chunk.get("page") or 0
        
        payload: Dict[str, Any] = {
            "document_id": doc_object_id,  # ObjectId
            "chunk_id": chunk_id,
            "page_number": int(page_number),  # Required field
            "text": text,  # Required field
            "hash": text_hash,  # Required field: SHA256(text)
            "created_at": now,  # Required field
        }
        # Removed title field as requested

        images = chunk.get("images") or []
        filtered_images = [img for img in images if img]
        if filtered_images:
            payload["images"] = filtered_images

        tables = chunk.get("tables") or []
        filtered_tables = [tbl for tbl in tables if tbl]
        if filtered_tables:
            payload["tables"] = filtered_tables

        docs.append(payload)

    if docs:
        await collection.insert_many(docs)
        print(f"[Chunks] ✅ Saved {len(docs)} chunks to MongoDB collection 'chunks'")
    return len(docs)


async def get_document_chunks(
    document_id: str,
    *,
    limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Fetch chunks for a specific document.
    
    Args:
        document_id: Document ID (ObjectId string) to query by.
        limit: Optional limit on number of chunks to return.
    
    Returns:
        List of chunk dictionaries.
    """
    if not document_id:
        return []
    
    collection = _chunks_collection()
    
    # Build query by document_id
    try:
        query = {"document_id": ObjectId(document_id)}
    except Exception:
        return []
    
    cursor = (
        collection
        .find(query)
        .sort("page_number", 1)  # Use page_number instead of page
        .sort("chunk_id", 1)
    )
    if limit:
        cursor = cursor.limit(limit)
    return await cursor.to_list(length=None if limit is None else limit)


async def delete_document_chunks(
    document_id: str,
) -> int:
    """
    Delete all chunks associated with a document.
    
    Args:
        document_id: Document ID (ObjectId string) to delete by.
    
    Returns:
        Number of chunks deleted.
    """
    if not document_id:
        return 0
    
    collection = _chunks_collection()
    
    # Build query by document_id
    try:
        query = {"document_id": ObjectId(document_id)}
    except Exception:
        return 0
    
    result = await collection.delete_many(query)
    deleted_count = result.deleted_count or 0
    if deleted_count > 0:
        print(f"[Chunks] ✅ Deleted {deleted_count} chunks from MongoDB (document_id={document_id})")
    return deleted_count
