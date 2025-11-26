from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional, Sequence

from bson import ObjectId

from .repository import CollectionRecord


def _stringify(value: Optional[ObjectId | str]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return str(value)
    return str(value)


def _stringify_ids(values: Sequence[ObjectId | str] | None) -> list[str]:
    if not values:
        return []
    return [str(item) for item in values if item is not None]


def _isoformat(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return None


def format_collection_for_response(collection: CollectionRecord) -> Dict[str, Any]:
    return {
        "_id": _stringify(collection.get("_id")),
        "user_id": _stringify(collection.get("user_id")),
        "name": collection.get("name"),
        "description": collection.get("description"),
        "document_ids": _stringify_ids(collection.get("document_ids") or []),
        "created_at": _isoformat(collection.get("created_at")),
        "updated_at": _isoformat(collection.get("updated_at")),
    }

