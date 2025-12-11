from __future__ import annotations

from typing import Any, Dict, List, Optional

from bson import ObjectId
from pymongo import ReturnDocument

from paperreader.database.mongodb import mongodb

SummaryRecord = Dict[str, Any]


async def upsert_summary(
    document_id: ObjectId,
    summary_template: Dict[str, str],
    important_sections: List[str],
) -> SummaryRecord:
    """Create or update a summary for a document and return the stored record."""
    db = mongodb.database
    payload: SummaryRecord = {
        "document_id": document_id,
        "summary_template": summary_template,
        "important_sections": important_sections,
    }

    record = await db["summaries"].find_one_and_update(
        {"document_id": document_id},
        {"$set": payload},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )

    if record is not None:
        return record

    # Motor may return None when upserting a new document; perform a manual fetch.
    created = await db["summaries"].find_one({"document_id": document_id})
    if created is not None:
        return created

    # Fallback insert that should rarely execute
    result = await db["summaries"].insert_one(payload)
    payload["_id"] = result.inserted_id
    return payload


async def get_summary_by_document(document_id: ObjectId) -> Optional[SummaryRecord]:
    """Fetch the saved summary for a document."""
    db = mongodb.database
    return await db["summaries"].find_one({"document_id": document_id})


async def delete_summary_by_document(document_id: ObjectId) -> bool:
    """Delete the summary associated with the provided document."""
    db = mongodb.database
    result = await db["summaries"].delete_one({"document_id": document_id})
    return bool(result.deleted_count)


async def summary_exists(document_id: ObjectId) -> bool:
    """Return True if a summary exists for the provided document."""
    db = mongodb.database
    record = await db["summaries"].find_one(
        {"document_id": document_id},
        projection={"_id": 1},
    )
    return record is not None

