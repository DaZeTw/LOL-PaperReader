from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorCollection
from bson import ObjectId

from paperreader.database.mongodb import mongodb


def _sessions_collection() -> AsyncIOMotorCollection:
    return mongodb.get_collection("chat_sessions")


def _messages_collection() -> AsyncIOMotorCollection:
    return mongodb.get_collection("chat_messages")


async def create_session(
    *,
    session_id: str,
    user_id: Optional[str],
    title: Optional[str],
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    now = datetime.utcnow()
    doc = {
        "session_id": session_id,
        "user_id": user_id,
        "title": title,
        "metadata": metadata or {},
        "created_at": now,
        "updated_at": now,
    }
    result = await _sessions_collection().insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def update_session_metadata(session_id: str, metadata: Dict[str, Any]) -> None:
    await _sessions_collection().update_one(
        {"session_id": session_id},
        {"$set": {"metadata": metadata, "updated_at": datetime.utcnow()}},
    )


def _convert_objectids_to_strings(obj: Any) -> Any:
    """Recursively convert ObjectId instances to strings for JSON serialization"""
    if isinstance(obj, ObjectId):
        return str(obj)
    elif isinstance(obj, dict):
        return {k: _convert_objectids_to_strings(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_objectids_to_strings(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(_convert_objectids_to_strings(item) for item in obj)
    return obj


async def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    session = await _sessions_collection().find_one({"session_id": session_id})
    if not session:
        return None

    messages_cursor = (
        _messages_collection()
        .find({"session_id": session_id})
        .sort("created_at", 1)
    )
    messages = await messages_cursor.to_list(length=None)
    for msg in messages:
        msg["_id"] = str(msg.get("_id"))
        # Convert ObjectIds in metadata
        if "metadata" in msg and isinstance(msg["metadata"], dict):
            msg["metadata"] = _convert_objectids_to_strings(msg["metadata"])
    session["_id"] = str(session.get("_id"))
    # Convert ObjectIds in session metadata
    if "metadata" in session and isinstance(session["metadata"], dict):
        session["metadata"] = _convert_objectids_to_strings(session["metadata"])
    session["messages"] = messages
    return session


async def list_sessions(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    cursor = (
        _sessions_collection()
        .find({"user_id": user_id})
        .sort("updated_at", -1)
        .limit(limit)
    )
    sessions = await cursor.to_list(length=limit)
    for session in sessions:
        session["_id"] = str(session.get("_id"))
        # Convert ObjectIds in session metadata
        if "metadata" in session and isinstance(session["metadata"], dict):
            session["metadata"] = _convert_objectids_to_strings(session["metadata"])
    return sessions


async def delete_session(session_id: str) -> None:
    await _sessions_collection().delete_one({"session_id": session_id})
    await _messages_collection().delete_many({"session_id": session_id})


async def delete_sessions_by_document(
    document_id: Optional[str] = None,
) -> int:
    """
    Delete all chat sessions and messages associated with a document.
    
    Args:
        document_id: Document ID (ObjectId string) to delete by.
    
    Returns:
        Number of sessions deleted.
    """
    if not document_id:
        return 0
    
    doc_id_str = str(document_id).strip()
    if not doc_id_str or doc_id_str.lower() in {"none", "null"}:
        return 0

    query: Dict[str, Any] = {"metadata.document_id": doc_id_str}
    try:
        query = {
            "$or": [
                {"metadata.document_id": doc_id_str},
                {"metadata.document_id": ObjectId(doc_id_str)},
            ]
        }
    except Exception:
        query = {"metadata.document_id": doc_id_str}
    
    # Find all matching sessions
    sessions_cursor = _sessions_collection().find(query)
    sessions = await sessions_cursor.to_list(length=None)
    
    deleted_count = 0
    for session in sessions:
        session_id = session.get("session_id")
        if session_id:
            # Delete messages for this session
            await _messages_collection().delete_many({"session_id": session_id})
            deleted_count += 1
    
    # Delete sessions
    result = await _sessions_collection().delete_many(query)
    deleted_sessions = result.deleted_count or 0
    
    if deleted_sessions > 0:
        print(f"[Chat] ✅ Deleted {deleted_sessions} chat sessions and their messages (document_id={document_id})")
    
    return deleted_sessions


async def append_message(
    *,
    session_id: str,
    role: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    now = datetime.utcnow()
    doc = {
        "session_id": session_id,
        "role": role,
        "content": content,
        "metadata": metadata or {},
        "created_at": now,
    }
    result = await _messages_collection().insert_one(doc)
    await _sessions_collection().update_one(
        {"session_id": session_id},
        {"$set": {"updated_at": now}},
    )
    doc["_id"] = str(result.inserted_id)
    return doc


async def get_recent_messages(session_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    cursor = (
        _messages_collection()
        .find({"session_id": session_id})
        .sort("created_at", -1)
        .limit(limit)
    )
    messages = await cursor.to_list(length=limit)
    messages.reverse()
    for msg in messages:
        msg["_id"] = str(msg.get("_id"))
        # Convert ObjectIds in metadata
        if "metadata" in msg and isinstance(msg["metadata"], dict):
            msg["metadata"] = _convert_objectids_to_strings(msg["metadata"])
    return messages


async def find_session_by_document(
    document_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Find an existing chat session by document_id.
    Returns the most recently updated session if multiple matches exist.
    """
    doc_id_str = str(document_id).strip() if document_id else ""
    if not doc_id_str or doc_id_str.lower() in {"none", "null"}:
        return None

    conditions: List[Dict[str, Any]] = [{"metadata.document_id": doc_id_str}]
    try:
        conditions.append({"metadata.document_id": ObjectId(doc_id_str)})
    except Exception:
        pass

    query: Dict[str, Any] = {"$or": conditions}

    if user_id:
        query["user_id"] = user_id

    session = await _sessions_collection().find_one(
        query,
        sort=[("updated_at", -1)]
    )
    
    if not session:
        return None
    
    # Load messages for this session
    messages_cursor = (
        _messages_collection()
        .find({"session_id": session["session_id"]})
        .sort("created_at", 1)
    )
    messages = await messages_cursor.to_list(length=None)
    for msg in messages:
        msg["_id"] = str(msg.get("_id"))
        # Convert ObjectIds in metadata
        if "metadata" in msg and isinstance(msg["metadata"], dict):
            msg["metadata"] = _convert_objectids_to_strings(msg["metadata"])
    session["_id"] = str(session.get("_id"))
    # Convert ObjectIds in session metadata
    if "metadata" in session and isinstance(session["metadata"], dict):
        session["metadata"] = _convert_objectids_to_strings(session["metadata"])
    session["messages"] = messages
    return session
