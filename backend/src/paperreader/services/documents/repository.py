from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence

from bson import ObjectId

from paperreader.database.mongodb import mongodb

DocumentRecord = Dict[str, Any]
WorkspaceRecord = Dict[str, Any]


def to_object_id(value: str | ObjectId | None) -> Optional[ObjectId]:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(value)
    except Exception:
        return None


async def get_workspace_by_user_id(user_id: str) -> Optional[WorkspaceRecord]:
    db = mongodb.database
    return await db["workspaces"].find_one({"user_id": user_id})


async def create_workspace(user_id: str, name: str = "Default Workspace") -> WorkspaceRecord:
    db = mongodb.database
    now = datetime.utcnow()
    workspace: WorkspaceRecord = {
        "user_id": user_id,
        "name": name,
        "document_ids": [],
        "created_at": now,
    }
    result = await db["workspaces"].insert_one(workspace)
    workspace["_id"] = result.inserted_id
    return workspace


async def get_or_create_workspace(user_id: str) -> WorkspaceRecord:
    workspace = await get_workspace_by_user_id(user_id)
    if workspace:
        return workspace
    return await create_workspace(user_id)


async def add_document_to_workspace(workspace_id: ObjectId, document_id: ObjectId) -> None:
    db = mongodb.database
    await db["workspaces"].update_one(
        {"_id": workspace_id},
        {"$addToSet": {"document_ids": document_id}},
    )


async def remove_documents_from_workspace(workspace_id: ObjectId, document_ids: Sequence[ObjectId]) -> None:
    if not document_ids:
        return
    db = mongodb.database
    await db["workspaces"].update_one(
        {"_id": workspace_id},
        {"$pull": {"document_ids": {"$in": list(document_ids)}}},
    )


async def clear_workspace_documents(workspace_id: ObjectId) -> None:
    db = mongodb.database
    await db["workspaces"].update_one({"_id": workspace_id}, {"$set": {"document_ids": []}})


async def create_document(doc: Dict[str, Any]) -> DocumentRecord:
    db = mongodb.database
    now = datetime.utcnow()
    record = {
        **doc,
        "created_at": now,
        "updated_at": now,
    }
    result = await db["documents"].insert_one(record)
    record["_id"] = result.inserted_id
    return record


async def get_document_by_id(document_id: ObjectId) -> Optional[DocumentRecord]:
    db = mongodb.database
    return await db["documents"].find_one({"_id": document_id})


async def get_documents_by_ids(user_id: str, document_ids: Sequence[ObjectId]) -> List[DocumentRecord]:
    if not document_ids:
        return []
    db = mongodb.database
    cursor = (
        db["documents"]
        .find({"user_id": user_id, "_id": {"$in": list(document_ids)}})
        .sort("created_at", -1)
    )
    return await cursor.to_list(length=None)


async def get_documents_by_user_id(
    user_id: str,
    search: Optional[str] = None,
) -> List[DocumentRecord]:
    db = mongodb.database
    query: Dict[str, Any] = {"user_id": user_id}
    if search:
        query["title"] = {"$regex": search, "$options": "i"}
    cursor = db["documents"].find(query).sort("created_at", -1)
    return await cursor.to_list(length=None)


async def update_document(document_id: ObjectId, updates: Dict[str, Any]) -> None:
    if not updates:
        return
    db = mongodb.database
    payload = {**updates, "updated_at": datetime.utcnow()}
    await db["documents"].update_one({"_id": document_id}, {"$set": payload})


async def update_document_status(document_id: ObjectId, status: str) -> None:
    await update_document(document_id, {"status": status})


async def delete_documents_by_ids(user_id: str, document_ids: Sequence[ObjectId]) -> int:
    if not document_ids:
        return 0
    db = mongodb.database
    result = await db["documents"].delete_many({"user_id": user_id, "_id": {"$in": list(document_ids)}})
    return result.deleted_count or 0


async def delete_all_documents_for_user(user_id: str) -> int:
    db = mongodb.database
    result = await db["documents"].delete_many({"user_id": user_id})
    return result.deleted_count or 0


