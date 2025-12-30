"""
Repository for user annotations (highlights and notes).

Stores user-created highlights and notes for PDF documents in MongoDB.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from paperreader.database.mongodb import mongodb


def _user_annotations_collection() -> AsyncIOMotorCollection:
    """Get the user_annotations collection."""
    return mongodb.get_collection("user_annotations")


async def save_user_annotation(
    *,
    user_id: str,
    document_id: str,
    content: str,
    highlight_areas: List[Dict[str, Any]],
    quote: str,
    page_index: int,
    color: Optional[str] = None,
) -> str:
    """
    Save a new user annotation (highlight/note).
    
    Args:
        user_id: User ID (string)
        document_id: Document ID (ObjectId string)
        content: Note content
        highlight_areas: List of highlight area dictionaries with left, top, width, height, pageIndex
        quote: The highlighted text
        page_index: Page number (0-indexed)
        color: Optional highlight color (default: '#ffff00')
        
    Returns:
        ID of the saved annotation
    """
    collection = _user_annotations_collection()
    
    # Convert document_id to ObjectId
    try:
        doc_object_id = ObjectId(document_id)
    except Exception:
        raise ValueError(f"Invalid document_id: {document_id}")
    
    now = datetime.utcnow()
    
    payload: Dict[str, Any] = {
        "user_id": user_id,
        "document_id": doc_object_id,
        "content": content,
        "highlight_areas": highlight_areas,
        "quote": quote,
        "page_index": page_index,
        "color": color or "#ffff00",
        "created_at": now,
        "updated_at": now,
    }
    
    result = await collection.insert_one(payload)
    print(f"[AnnotationRepository] Saved annotation for user_id={user_id}, document_id={document_id}")
    return str(result.inserted_id)


async def get_user_annotations(
    user_id: str,
    document_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Get user annotations, optionally filtered by document.
    
    Args:
        user_id: User ID (string) - required
        document_id: Optional document ID to filter by
        
    Returns:
        List of annotation documents
    """
    collection = _user_annotations_collection()
    
    query: Dict[str, Any] = {"user_id": user_id}
    
    if document_id:
        try:
            doc_object_id = ObjectId(document_id)
            query["document_id"] = doc_object_id
        except Exception:
            return []
    
    cursor = collection.find(query).sort("created_at", -1)
    results = await cursor.to_list(length=None)
    
    # Convert ObjectId to string for JSON serialization
    for result in results:
        if "_id" in result:
            result["_id"] = str(result["_id"])
        if "document_id" in result and isinstance(result["document_id"], ObjectId):
            result["document_id"] = str(result["document_id"])
    
    return results


async def get_user_annotation_by_id(
    annotation_id: str,
    user_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Get a specific annotation by ID (with user ownership check).
    
    Args:
        annotation_id: Annotation ID (ObjectId string)
        user_id: User ID for ownership verification
        
    Returns:
        Annotation document or None if not found or not owned by user
    """
    collection = _user_annotations_collection()
    
    try:
        ann_object_id = ObjectId(annotation_id)
    except Exception:
        return None
    
    query = {
        "_id": ann_object_id,
        "user_id": user_id,
    }
    
    result = await collection.find_one(query)
    
    if result:
        # Convert ObjectId to string
        result["_id"] = str(result["_id"])
        if "document_id" in result and isinstance(result["document_id"], ObjectId):
            result["document_id"] = str(result["document_id"])
    
    return result


async def update_user_annotation(
    annotation_id: str,
    user_id: str,
    *,
    content: Optional[str] = None,
    highlight_areas: Optional[List[Dict[str, Any]]] = None,
    quote: Optional[str] = None,
    page_index: Optional[int] = None,
    color: Optional[str] = None,
) -> bool:
    """
    Update an existing user annotation.
    
    Args:
        annotation_id: Annotation ID (ObjectId string)
        user_id: User ID for ownership verification
        content: Optional new note content
        highlight_areas: Optional new highlight areas
        quote: Optional new quote text
        page_index: Optional new page index
        color: Optional new color
        
    Returns:
        True if updated, False if not found or not owned by user
    """
    collection = _user_annotations_collection()
    
    try:
        ann_object_id = ObjectId(annotation_id)
    except Exception:
        return False
    
    # Verify ownership
    existing = await collection.find_one({
        "_id": ann_object_id,
        "user_id": user_id,
    })
    
    if not existing:
        return False
    
    # Build update payload
    update_fields: Dict[str, Any] = {
        "updated_at": datetime.utcnow(),
    }
    
    if content is not None:
        update_fields["content"] = content
    if highlight_areas is not None:
        update_fields["highlight_areas"] = highlight_areas
    if quote is not None:
        update_fields["quote"] = quote
    if page_index is not None:
        update_fields["page_index"] = page_index
    if color is not None:
        update_fields["color"] = color
    
    result = await collection.update_one(
        {"_id": ann_object_id, "user_id": user_id},
        {"$set": update_fields}
    )
    
    if result.modified_count > 0:
        print(f"[AnnotationRepository] Updated annotation {annotation_id} for user_id={user_id}")
        return True
    
    return False


async def delete_user_annotation(
    annotation_id: str,
    user_id: str,
) -> bool:
    """
    Delete a user annotation.
    
    Args:
        annotation_id: Annotation ID (ObjectId string)
        user_id: User ID for ownership verification
        
    Returns:
        True if deleted, False if not found or not owned by user
    """
    collection = _user_annotations_collection()
    
    try:
        ann_object_id = ObjectId(annotation_id)
    except Exception:
        return False
    
    result = await collection.delete_one({
        "_id": ann_object_id,
        "user_id": user_id,
    })
    
    if result.deleted_count > 0:
        print(f"[AnnotationRepository] Deleted annotation {annotation_id} for user_id={user_id}")
        return True
    
    return False


async def delete_user_annotations_by_document(
    user_id: str,
    document_id: str,
) -> int:
    """
    Delete all annotations for a user and document.
    
    Args:
        user_id: User ID (string)
        document_id: Document ID (ObjectId string)
        
    Returns:
        Number of annotations deleted
    """
    collection = _user_annotations_collection()
    
    try:
        doc_object_id = ObjectId(document_id)
    except Exception:
        return 0
    
    result = await collection.delete_many({
        "user_id": user_id,
        "document_id": doc_object_id,
    })
    
    deleted_count = result.deleted_count or 0
    if deleted_count > 0:
        print(f"[AnnotationRepository] Deleted {deleted_count} annotations for user_id={user_id}, document_id={document_id}")
    
    return deleted_count


async def create_annotation_indexes():
    """
    Create indexes for user_annotations collection.
    Should be called during application startup.
    """
    collection = _user_annotations_collection()
    
    # Index for querying by user and document
    await collection.create_index([("user_id", 1), ("document_id", 1)])
    # Index for querying by user only
    await collection.create_index([("user_id", 1), ("created_at", -1)])
    # Index for querying by document only
    await collection.create_index([("document_id", 1), ("created_at", -1)])
    
    print("[AnnotationRepository] ✅ Created indexes for user_annotations")

