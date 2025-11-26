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

