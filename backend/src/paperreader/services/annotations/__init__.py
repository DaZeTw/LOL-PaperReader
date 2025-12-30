"""Repository for user annotations (highlights and notes)."""

from paperreader.services.annotations.repository import (
    save_user_annotation,
    get_user_annotations,
    get_user_annotation_by_id,
    update_user_annotation,
    delete_user_annotation,
    delete_user_annotations_by_document,
    create_annotation_indexes,
)

__all__ = [
    "save_user_annotation",
    "get_user_annotations",
    "get_user_annotation_by_id",
    "update_user_annotation",
    "delete_user_annotation",
    "delete_user_annotations_by_document",
    "create_annotation_indexes",
]

