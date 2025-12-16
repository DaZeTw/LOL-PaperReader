from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from paperreader.database.mongodb import mongodb
from paperreader.models.reference import (
    ReferenceCreate,
    ReferenceSchema,
    ReferenceUpdate,
)


async def create_reference(reference: ReferenceCreate) -> ReferenceSchema:
    """Create a new reference in the database."""
    collection = mongodb.database["references"]

    reference_dict = reference.model_dump()
    reference_dict["created_at"] = datetime.utcnow()
    reference_dict["updated_at"] = datetime.utcnow()

    result = await collection.insert_one(reference_dict)
    created_reference = await collection.find_one({"_id": result.inserted_id})

    return ReferenceSchema.from_mongo(created_reference)


async def create_references_batch(
    document_id: str, references: List[ReferenceCreate]
) -> List[ReferenceSchema]:
    """Create multiple references in batch."""
    collection = mongodb.database["references"]

    now = datetime.utcnow()
    reference_dicts = [
        {
            **ref.model_dump(),
            "document_id": document_id,
            "created_at": now,
            "updated_at": now,
        }
        for ref in references
    ]

    if not reference_dicts:
        return []

    result = await collection.insert_many(reference_dicts)

    # Fetch created references
    created_refs = await collection.find({"_id": {"$in": result.inserted_ids}}).to_list(
        length=len(result.inserted_ids)
    )

    return [ReferenceSchema.from_mongo(ref) for ref in created_refs]


async def get_reference_by_id(reference_id: str) -> Optional[ReferenceSchema]:
    """Get a reference by ID."""
    collection = mongodb.database["references"]

    if not ObjectId.is_valid(reference_id):
        return None

    reference = await collection.find_one({"_id": ObjectId(reference_id)})

    if reference:
        return ReferenceSchema.from_mongo(reference)
    return None


async def get_references_by_document(
    document_id: str, skip: int = 0, limit: int = 100
) -> List[ReferenceSchema]:
    """Get all references for a document."""
    collection = mongodb.database["references"]

    cursor = collection.find({"document_id": document_id}).skip(skip).limit(limit)
    references = await cursor.to_list(length=limit)

    return [ReferenceSchema.from_mongo(ref) for ref in references]


async def get_reference_by_ref_id(
    document_id: str, ref_id: str
) -> Optional[ReferenceSchema]:
    """Get a reference by its GROBID ref_id within a document."""
    collection = mongodb.database["references"]

    reference = await collection.find_one(
        {"document_id": document_id, "ref_id": ref_id}
    )

    if reference:
        return ReferenceSchema.from_mongo(reference)
    return None


async def update_reference(
    reference_id: str, update_data: ReferenceUpdate
) -> Optional[ReferenceSchema]:
    """Update a reference."""
    collection = mongodb.database["references"]

    if not ObjectId.is_valid(reference_id):
        return None

    update_dict = {
        k: v
        for k, v in update_data.model_dump(exclude_unset=True).items()
        if v is not None
    }

    if not update_dict:
        return await get_reference_by_id(reference_id)

    update_dict["updated_at"] = datetime.utcnow()

    result = await collection.find_one_and_update(
        {"_id": ObjectId(reference_id)}, {"$set": update_dict}, return_document=True
    )

    if result:
        return ReferenceSchema.from_mongo(result)
    return None


async def delete_reference(reference_id: str) -> bool:
    """Delete a reference."""
    collection = mongodb.database["references"]

    if not ObjectId.is_valid(reference_id):
        return False

    result = await collection.delete_one({"_id": ObjectId(reference_id)})
    return result.deleted_count > 0


async def delete_references_by_document(document_id: str) -> int:
    """Delete all references for a document."""
    collection = mongodb.database["references"]

    result = await collection.delete_many({"document_id": document_id})
    return result.deleted_count


async def search_references(
    query: str, document_id: Optional[str] = None, skip: int = 0, limit: int = 50
) -> List[ReferenceSchema]:
    """Search references by title, authors, or venue."""
    collection = mongodb.database["references"]

    filter_dict: Dict[str, Any] = {
        "$or": [
            {"title": {"$regex": query, "$options": "i"}},
            {"authors": {"$regex": query, "$options": "i"}},
            {"venue": {"$regex": query, "$options": "i"}},
        ]
    }

    if document_id:
        filter_dict["document_id"] = document_id

    cursor = collection.find(filter_dict).skip(skip).limit(limit)
    references = await cursor.to_list(length=limit)

    return [ReferenceSchema.from_mongo(ref) for ref in references]


async def count_references_by_document(document_id: str) -> int:
    """Count references for a document."""
    collection = mongodb.database["references"]

    count = await collection.count_documents({"document_id": document_id})
    return count


async def get_references_by_year(document_id: str, year: str) -> List[ReferenceSchema]:
    """Get references filtered by publication year."""
    collection = mongodb.database["references"]

    cursor = collection.find({"document_id": document_id, "year": year})
    references = await cursor.to_list(length=None)

    return [ReferenceSchema.from_mongo(ref) for ref in references]


async def replace_document_references(
    document_id: str, references: List[ReferenceCreate]
) -> List[ReferenceSchema]:
    """Replace all references for a document (delete old, insert new)."""
    collection = mongodb.database["references"]

    # Delete existing references
    await collection.delete_many({"document_id": document_id})

    # Insert new references
    if not references:
        return []

    return await create_references_batch(document_id, references)
