from __future__ import annotations

from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, validator

from paperreader.api.dependencies import require_user_id
from paperreader.services.collections import (
    add_document_to_collection,
    create_collection,
    delete_all_collections_for_user,
    delete_collection,
    format_collection_for_response,
    get_collection_by_id,
    get_collections_by_user_id,
    remove_document_from_collection,
    update_collection,
)
from paperreader.services.documents.repository import get_documents_by_ids, to_object_id
from paperreader.services.documents.utils import format_document_for_response

router = APIRouter(prefix="/api/collections", tags=["Collections"])


class CreateCollectionRequest(BaseModel):
    name: str = Field(..., description="Collection name")
    description: Optional[str] = Field(None, description="Optional description")

    @validator("name")
    def validate_name(cls, value: str) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Collection name is required")
        return value.strip()

    @validator("description")
    def normalize_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip()


class UpdateCollectionRequest(BaseModel):
    name: Optional[str] = Field(None, description="Updated collection name")
    description: Optional[str] = Field(None, description="Updated description")

    @validator("name")
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if not value.strip():
            raise ValueError("Collection name must be a non-empty string")
        return value.strip()

    @validator("description")
    def normalize_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip()


class DeleteCollectionsRequest(BaseModel):
    confirm: Optional[bool] = Field(False, description="Must be true to delete all collections")


class AddDocumentRequest(BaseModel):
    documentId: str = Field(..., description="Document identifier to add to the collection")

    @validator("documentId")
    def validate_document_id(cls, value: str) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("documentId is required")
        return value.strip()


def _ensure_object_id(identifier: str, label: str) -> ObjectId:
    object_id = to_object_id(identifier)
    if not object_id:
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    return object_id


def _extract_document_ids(raw_ids: Optional[List[Any]]) -> List[ObjectId]:
    if not raw_ids:
        return []
    object_ids: List[ObjectId] = []
    for raw_id in raw_ids:
        if isinstance(raw_id, ObjectId):
            object_ids.append(raw_id)
            continue
        parsed = to_object_id(str(raw_id))
        if parsed:
            object_ids.append(parsed)
    return object_ids


@router.get("")
async def list_collections(user_id: str = Depends(require_user_id)):
    collections = await get_collections_by_user_id(user_id)
    formatted = [format_collection_for_response(collection) for collection in collections]
    return {"collections": formatted}


@router.post("", status_code=201)
async def create_collection_route(
    payload: CreateCollectionRequest,
    user_id: str = Depends(require_user_id),
):
    collection = await create_collection(user_id, payload.name, payload.description)
    return {"collection": format_collection_for_response(collection)}


@router.post("/delete")
async def delete_collections_route(
    payload: DeleteCollectionsRequest,
    user_id: str = Depends(require_user_id),
):
    if payload.confirm is not True:
        raise HTTPException(
            status_code=400,
            detail="Confirmation required. Set `confirm: true` to delete all collections.",
        )

    deleted_count = await delete_all_collections_for_user(user_id)
    return {"deletedCount": deleted_count}


@router.get("/{collection_id}")
async def get_collection_route(
    collection_id: str,
    user_id: str = Depends(require_user_id),
):
    object_id = _ensure_object_id(collection_id, "collection ID")

    collection = await get_collection_by_id(object_id, user_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    document_ids = _extract_document_ids(collection.get("document_ids"))
    documents = await get_documents_by_ids(user_id, document_ids) if document_ids else []
    formatted_documents = [format_document_for_response(doc) for doc in documents]

    return {
        "collection": format_collection_for_response(collection),
        "documents": formatted_documents,
    }


@router.put("/{collection_id}")
async def update_collection_route(
    collection_id: str,
    payload: UpdateCollectionRequest,
    user_id: str = Depends(require_user_id),
):
    object_id = _ensure_object_id(collection_id, "collection ID")

    updates: Dict[str, Any] = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.description is not None:
        # Maintain parity with the Next.js API where null/empty -> empty string
        updates["description"] = payload.description or ""

    updated = await update_collection(object_id, user_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Collection not found")

    return {"collection": format_collection_for_response(updated)}


@router.delete("/{collection_id}")
async def delete_collection_route(
    collection_id: str,
    user_id: str = Depends(require_user_id),
):
    object_id = _ensure_object_id(collection_id, "collection ID")

    deleted = await delete_collection(object_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Collection not found")

    return {"success": True}


@router.post("/{collection_id}/documents")
async def add_document_to_collection_route(
    collection_id: str,
    payload: AddDocumentRequest,
    user_id: str = Depends(require_user_id),
):
    collection_object_id = _ensure_object_id(collection_id, "collection ID")
    document_object_id = _ensure_object_id(payload.documentId, "document ID")

    updated = await add_document_to_collection(collection_object_id, user_id, document_object_id)
    if not updated:
        raise HTTPException(
            status_code=404,
            detail="Collection or document not found, or document does not belong to the user",
        )

    return {"collection": format_collection_for_response(updated)}


@router.delete("/{collection_id}/documents/{document_id}")
async def remove_document_from_collection_route(
    collection_id: str,
    document_id: str,
    user_id: str = Depends(require_user_id),
):
    collection_object_id = _ensure_object_id(collection_id, "collection ID")
    document_object_id = _ensure_object_id(document_id, "document ID")

    updated = await remove_document_from_collection(collection_object_id, user_id, document_object_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Collection not found")

    return {"collection": format_collection_for_response(updated)}

