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


async def remove_all_document_data(document_id: ObjectId, user_id: str, stored_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Remove all data related to a document across all databases and collections.
    
    This function deletes:
    - MinIO files (PDF and associated assets)
    - MongoDB chunks
    - Elasticsearch embeddings
    - Chat sessions and messages
    - References
    - Summaries
    - Skimming highlights
    - Document from collections
    
    Args:
        document_id: The document ObjectId
        user_id: The user ID who owns the document
        stored_path: Optional stored path in MinIO (if not provided, will be fetched from document)
    
    Returns:
        Dictionary with deletion results and counts
    """
    import os
    from paperreader.services.documents.minio_client import delete_object, delete_objects_by_prefix
    
    MINIO_BUCKET = os.getenv("MINIO_BUCKET", "pdf-documents")
    from paperreader.services.documents.chunk_repository import delete_document_chunks
    from paperreader.services.qa.elasticsearch_client import delete_document_chunks as delete_elasticsearch_chunks
    from paperreader.services.chat import repository as chat_repository
    from paperreader.services.references.reference_service import ReferenceService
    from paperreader.services.documents.summary_repository import delete_summary_by_document
    from paperreader.services.skimming.repository import delete_skimming_highlights
    
    document_id_str = str(document_id)
    results = {
        "minio_files": 0,
        "chunks": 0,
        "chat_sessions": 0,
        "references": 0,
        "summaries": 0,
        "skimming_highlights": 0,
        "collections_updated": 0,
        "errors": []
    }
    
    # Get stored_path from document if not provided
    if not stored_path:
        doc = await get_document_by_id(document_id)
        if doc:
            stored_path = doc.get("stored_path")
    
    # 1. Delete PDF file from MinIO
    if stored_path:
        try:
            await delete_object(MINIO_BUCKET, stored_path)
            results["minio_files"] += 1
            print(f"[Documents] ✅ Deleted PDF file {stored_path} from MinIO")
        except Exception as exc:
            error_msg = f"Failed to delete {stored_path} from MinIO: {exc}"
            results["errors"].append(error_msg)
            print(f"[Documents] ⚠️ {error_msg}")
    
    # 2. Delete associated images and tables from MinIO
    asset_prefix = f"{user_id}/document/{document_id_str}/"
    try:
        deleted_count = await delete_objects_by_prefix(MINIO_BUCKET, asset_prefix)
        results["minio_files"] += deleted_count
        if deleted_count > 0:
            print(f"[Documents] ✅ Deleted {deleted_count} associated files (images/tables) for document {document_id_str}")
    except Exception as exc:
        error_msg = f"Failed to delete associated files for document {document_id_str}: {exc}"
        results["errors"].append(error_msg)
        print(f"[Documents] ⚠️ {error_msg}")
    
    # 3. Delete chunks from MongoDB
    try:
        chunks_deleted = await delete_document_chunks(document_id=document_id_str)
        results["chunks"] = chunks_deleted
        if chunks_deleted > 0:
            print(f"[Documents] ✅ Deleted {chunks_deleted} chunks from MongoDB for document {document_id_str}")
    except Exception as exc:
        error_msg = f"Failed to delete chunks from MongoDB for document {document_id_str}: {exc}"
        results["errors"].append(error_msg)
        print(f"[Documents] ⚠️ {error_msg}")
    
    # 4. Delete embeddings from Elasticsearch
    try:
        await delete_elasticsearch_chunks(document_id=document_id_str)
        print(f"[Documents] ✅ Deleted embeddings from Elasticsearch for document {document_id_str}")
    except Exception as exc:
        error_msg = f"Failed to delete embeddings from Elasticsearch: {exc}"
        results["errors"].append(error_msg)
        print(f"[Documents] ⚠️ {error_msg}")
    
    # 5. Delete chat sessions and messages
    try:
        sessions_deleted = await chat_repository.delete_sessions_by_document(document_id=document_id_str)
        results["chat_sessions"] = sessions_deleted
        if sessions_deleted > 0:
            print(f"[Documents] ✅ Deleted {sessions_deleted} chat sessions and messages for document {document_id_str}")
    except Exception as exc:
        error_msg = f"Failed to delete chat sessions for document {document_id_str}: {exc}"
        results["errors"].append(error_msg)
        print(f"[Documents] ⚠️ {error_msg}")
    
    # 6. Delete references
    try:
        reference_service = ReferenceService()
        references_deleted = await reference_service.delete_document_references(document_id=document_id_str)
        results["references"] = references_deleted
        if references_deleted > 0:
            print(f"[Documents] ✅ Deleted {references_deleted} references for document {document_id_str}")
    except Exception as exc:
        error_msg = f"Failed to delete references for document {document_id_str}: {exc}"
        results["errors"].append(error_msg)
        print(f"[Documents] ⚠️ {error_msg}")
    
    # 7. Delete summaries
    try:
        summary_deleted = await delete_summary_by_document(document_id=document_id)
        if summary_deleted:
            results["summaries"] = 1
            print(f"[Documents] ✅ Deleted summary for document {document_id_str}")
    except Exception as exc:
        error_msg = f"Failed to delete summary for document {document_id_str}: {exc}"
        results["errors"].append(error_msg)
        print(f"[Documents] ⚠️ {error_msg}")
    
    # 8. Delete skimming highlights
    try:
        highlights_deleted = await delete_skimming_highlights(document_id=document_id_str)
        results["skimming_highlights"] = highlights_deleted
        if highlights_deleted > 0:
            print(f"[Documents] ✅ Deleted {highlights_deleted} skimming highlight records for document {document_id_str}")
    except Exception as exc:
        error_msg = f"Failed to delete skimming highlights for document {document_id_str}: {exc}"
        results["errors"].append(error_msg)
        print(f"[Documents] ⚠️ {error_msg}")
    
    # 9. Remove document from all collections
    try:
        db = mongodb.database
        result = await db["collections"].update_many(
            {"user_id": user_id, "document_ids": document_id},
            {
                "$pull": {"document_ids": document_id},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        results["collections_updated"] = result.modified_count
        if result.modified_count > 0:
            print(f"[Documents] ✅ Removed document from {result.modified_count} collections")
    except Exception as exc:
        error_msg = f"Failed to remove document from collections: {exc}"
        results["errors"].append(error_msg)
        print(f"[Documents] ⚠️ {error_msg}")
    
    return results


