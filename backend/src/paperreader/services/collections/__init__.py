"""Collections service helpers."""

from .repository import (
    CollectionRecord,
    add_document_to_collection,
    create_collection,
    delete_all_collections_for_user,
    delete_collection,
    get_collection_by_id,
    get_collections_by_user_id,
    remove_document_from_collection,
    update_collection,
)
from .utils import format_collection_for_response

__all__ = [
    "CollectionRecord",
    "add_document_to_collection",
    "create_collection",
    "delete_all_collections_for_user",
    "delete_collection",
    "format_collection_for_response",
    "get_collection_by_id",
    "get_collections_by_user_id",
    "remove_document_from_collection",
    "update_collection",
]

