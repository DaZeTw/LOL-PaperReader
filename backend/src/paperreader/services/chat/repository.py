from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
import re

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
    session["_id"] = str(session.get("_id"))
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
    return sessions


async def delete_session(session_id: str) -> None:
    await _sessions_collection().delete_one({"session_id": session_id})
    await _messages_collection().delete_many({"session_id": session_id})


async def delete_sessions_by_document(
    document_id: Optional[str] = None,
    document_key: Optional[str] = None,
) -> int:
    """
    Delete all chat sessions and messages associated with a document.
    
    Args:
        document_id: Document ID (ObjectId string) to delete by.
        document_key: Document key to delete by.
    
    Returns:
        Number of sessions deleted.
    """
    if not document_id and not document_key:
        return 0
    
    # Build query to find sessions with matching document_id, document_key, or title patterns
    conditions: List[Dict[str, Any]] = []
    doc_id_str = str(document_id) if document_id else None
    doc_key_str = str(document_key) if document_key else None

    if doc_id_str:
        conditions.append({"metadata.document_id": doc_id_str})
        # Some sessions might have stored ObjectId instead of string
        try:
            conditions.append({"metadata.document_id": ObjectId(doc_id_str)})
        except Exception:
            pass

    key_variants = set()
    if doc_key_str:
        key_variants.add(doc_key_str)
        if doc_key_str.lower().endswith(".pdf"):
            key_variants.add(doc_key_str[:-4])
        else:
            key_variants.add(f"{doc_key_str}.pdf")
    if doc_id_str:
        key_variants.add(doc_id_str)

    for key in key_variants:
        conditions.append({"metadata.document_key": key})
        conditions.append({"metadata.document_filename": key})

        # Match title patterns like "Chat: {key}" or "Chat: {key} - ..."
        escaped = re.escape(key)
        conditions.append(
            {
                "title": {
                    "$regex": rf"^Chat:\s*{escaped}(?:\s*-\s*.*)?$",
                    "$options": "i",
                }
            }
        )

    if not conditions:
        return 0

    query: Dict[str, Any]
    if len(conditions) == 1:
        query = conditions[0]
    else:
        query = {"$or": conditions}
    
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
        print(f"[Chat] ✅ Deleted {deleted_sessions} chat sessions and their messages (document_id={document_id}, document_key={document_key})")
    
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
    return messages


async def find_session_by_document(
    document_key: Optional[str] = None,
    document_id: Optional[str] = None,
    title: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Find an existing chat session by document_key, document_id, or title.
    Returns the most recently updated session if multiple matches exist.
    """
    conditions: List[Dict[str, Any]] = []
    
    # Build query conditions
    if document_id:
        doc_id_str = str(document_id).strip()
        if doc_id_str and doc_id_str.lower() not in {"none", "null"}:
            conditions.append({"metadata.document_id": doc_id_str})
            try:
                conditions.append({"metadata.document_id": ObjectId(doc_id_str)})
            except Exception:
                pass
    
    if document_key:
        doc_key_str = str(document_key).strip()
        if doc_key_str and doc_key_str.lower() not in {"none", "null"}:
            # Normalize document_key (remove .pdf extension if present)
            normalized_key = doc_key_str
            if normalized_key.lower().endswith(".pdf"):
                normalized_key = normalized_key[:-4].strip()
            
            # Try various key formats
            key_variants = {normalized_key, f"{normalized_key}.pdf", doc_key_str}
            for key in key_variants:
                conditions.append({"metadata.document_key": key})
                conditions.append({"metadata.document_key_base": key})
                conditions.append({"metadata.document_filename": key})
    
    if title:
        title_str = str(title).strip()
        if title_str:
            # Match exact title or title pattern "Chat: {title}"
            conditions.append({"title": title_str})
            if not title_str.startswith("Chat:"):
                conditions.append({"title": f"Chat: {title_str}"})
    
    if not conditions:
        return None
    
    # Build query
    query: Dict[str, Any]
    if len(conditions) == 1:
        query = conditions[0]
    else:
        query = {"$or": conditions}
    
    # Add user_id filter if provided
    if user_id:
        query["user_id"] = user_id
    
    # Find the most recently updated matching session
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
    session["_id"] = str(session.get("_id"))
    session["messages"] = messages
    return session
