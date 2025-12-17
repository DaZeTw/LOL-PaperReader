"""
Repository for skimming data.

Currently only highlights are stored in MongoDB. Chunk storage was removed and can
be reintroduced later if the skimming view requires persisted section data.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from paperreader.database.mongodb import mongodb


def _skimming_highlights_collection() -> AsyncIOMotorCollection:
    """Get the skimming_highlights collection."""
    return mongodb.get_collection("skimming_highlights")


async def save_skimming_highlights(
    *,
    document_id: str,
    file_name: str,
    preset: str,
    alpha: float,
    ratio: float,
    highlights: List[Dict[str, Any]],
) -> str:
    """
    Save or update skimming highlights for a document.
    
    Args:
        document_id: Document ID (ObjectId string)
        file_name: PDF filename
        preset: Preset mode ("light" | "medium" | "heavy")
        alpha: Alpha parameter
        ratio: Ratio parameter
        highlights: List of highlight dictionaries
        
    Returns:
        ID of the saved/updated document
    """
    collection = _skimming_highlights_collection()
    
    # Convert document_id to ObjectId
    try:
        doc_object_id = ObjectId(document_id)
    except Exception:
        raise ValueError(f"Invalid document_id: {document_id}")
    
    now = datetime.utcnow()
    
    # Check if highlights already exist for this document and preset
    existing = await collection.find_one({
        "document_id": doc_object_id,
        "preset": preset
    })
    
    if existing:
        # Update existing record
        await collection.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "file_name": file_name,
                    "alpha": alpha,
                    "ratio": ratio,
                    "highlights": highlights,
                    "updated_at": now,
                }
            }
        )
        print(f"[SkimmingRepository] Updated highlights for document_id={document_id}, preset={preset}")
        return str(existing["_id"])
    else:
        # Create new record
        payload: Dict[str, Any] = {
            "document_id": doc_object_id,
            "file_name": file_name,
            "preset": preset,
            "alpha": alpha,
            "ratio": ratio,
            "highlights": highlights,
            "created_at": now,
            "updated_at": now,
        }
        result = await collection.insert_one(payload)
        print(f"[SkimmingRepository] Saved {len(highlights)} highlights for document_id={document_id}, preset={preset}")
        return str(result.inserted_id)


async def get_skimming_highlights(
    document_id: str,
    preset: str = "medium",
) -> Optional[Dict[str, Any]]:
    """
    Get skimming highlights for a document.
    
    Args:
        document_id: Document ID (ObjectId string) - required
        preset: Preset mode ("light" | "medium" | "heavy")
        
    Returns:
        Highlights document or None if not found
    """
    collection = _skimming_highlights_collection()
    
    try:
        doc_object_id = ObjectId(document_id)
    except Exception:
        return None
    
    query = {
        "document_id": doc_object_id,
        "preset": preset
    }
    
    result = await collection.find_one(query)
    return result


async def delete_skimming_highlights(document_id: str) -> int:
    """
    Delete all skimming highlights for a document.
    
    Args:
        document_id: Document ID (ObjectId string)
        
    Returns:
        Number of documents deleted
    """
    collection = _skimming_highlights_collection()
    
    try:
        doc_object_id = ObjectId(document_id)
    except Exception:
        return 0
    
    result = await collection.delete_many({"document_id": doc_object_id})
    deleted_count = result.deleted_count or 0
    if deleted_count > 0:
        print(f"[SkimmingRepository] Deleted {deleted_count} highlight records for document_id={document_id}")
    return deleted_count


# ==================== Skimming Chunks ====================

async def create_skimming_indexes():
    """
    Create indexes for skimming collections.
    Should be called during application startup.
    """
    highlights_collection = _skimming_highlights_collection()

    await highlights_collection.create_index([("document_id", 1), ("preset", 1)])
    await highlights_collection.create_index([("file_name", 1), ("preset", 1)])
    await highlights_collection.create_index([("created_at", -1)])

    print("[SkimmingRepository] ✅ Created indexes for skimming highlights")

