from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

from bson import ObjectId
from pymongo import ReturnDocument

from paperreader.database.mongodb import mongodb
from paperreader.services.documents.repository import get_document_by_id

CollectionRecord = Dict[str, Any]


async def create_collection(user_id: str, name: str, description: Optional[str] = None) -> CollectionRecord:
    """Create a new collection for a user."""
    db = mongodb.database
    now = datetime.utcnow()
    record: CollectionRecord = {
        "user_id": user_id,
        "name": name,
        "description": description,
        "document_ids": [],
        "created_at": now,
        "updated_at": now,
    }
    result = await db["collections"].insert_one(record)
    record["_id"] = result.inserted_id
    return record


async def get_collections_by_user_id(user_id: str) -> List[CollectionRecord]:
    """List collections owned by the user ordered by creation date desc."""
    db = mongodb.database
    cursor = db["collections"].find({"user_id": user_id}).sort("created_at", -1)
    return await cursor.to_list(length=None)


async def get_collection_by_id(collection_id: ObjectId, user_id: str) -> Optional[CollectionRecord]:
    """Fetch a single collection ensuring it belongs to the user."""
    db = mongodb.database
    return await db["collections"].find_one({"_id": collection_id, "user_id": user_id})


async def update_collection(
    collection_id: ObjectId,
    user_id: str,
    updates: Dict[str, Any],
) -> Optional[CollectionRecord]:
    """Update collection metadata and return the updated record."""
    if not updates:
        return await get_collection_by_id(collection_id, user_id)

    db = mongodb.database
    payload = {**updates, "updated_at": datetime.utcnow()}
    return await db["collections"].find_one_and_update(
        {"_id": collection_id, "user_id": user_id},
        {"$set": payload},
        return_document=ReturnDocument.AFTER,
    )


async def delete_collection(collection_id: ObjectId, user_id: str) -> bool:
    """Delete a collection owned by the user."""
    db = mongodb.database
    result = await db["collections"].delete_one({"_id": collection_id, "user_id": user_id})
    return bool(result.deleted_count)


async def delete_all_collections_for_user(user_id: str) -> int:
    """Delete all collections belonging to the user."""
    db = mongodb.database
    result = await db["collections"].delete_many({"user_id": user_id})
    return result.deleted_count or 0


async def add_document_to_collection(
    collection_id: ObjectId,
    user_id: str,
    document_id: ObjectId,
) -> Optional[CollectionRecord]:
    """Attach a document to the collection if it belongs to the user."""
    collection = await get_collection_by_id(collection_id, user_id)
    if not collection:
        return None

    document = await get_document_by_id(document_id)
    if not document or document.get("user_id") != user_id:
        return None

    existing_ids: Sequence[Any] = collection.get("document_ids") or []
    if any(str(existing) == str(document_id) for existing in existing_ids):
        return collection

    db = mongodb.database
    updated = await db["collections"].find_one_and_update(
        {"_id": collection_id, "user_id": user_id},
        {
            "$addToSet": {"document_ids": document_id},
            "$set": {"updated_at": datetime.utcnow()},
        },
        return_document=ReturnDocument.AFTER,
    )
    return updated


async def remove_document_from_collection(
    collection_id: ObjectId,
    user_id: str,
    document_id: ObjectId,
) -> Optional[CollectionRecord]:
    """Remove a document from the collection."""
    db = mongodb.database
    updated = await db["collections"].find_one_and_update(
        {"_id": collection_id, "user_id": user_id},
        {
            "$pull": {"document_ids": document_id},
            "$set": {"updated_at": datetime.utcnow()},
        },
        return_document=ReturnDocument.AFTER,
    )
    return updated

