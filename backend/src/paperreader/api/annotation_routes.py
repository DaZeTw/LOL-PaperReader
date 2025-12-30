"""
API routes for user annotations (highlights and notes).

Provides CRUD operations for user-created annotations on PDF documents.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from paperreader.api.dependencies import require_user_id
from paperreader.services.annotations.repository import (
    save_user_annotation,
    get_user_annotations,
    get_user_annotation_by_id,
    update_user_annotation,
    delete_user_annotation,
    delete_user_annotations_by_document,
)
from paperreader.services.documents.repository import get_document_by_id, to_object_id

router = APIRouter()


# ==================== Pydantic Models ====================

class HighlightArea(BaseModel):
    """Highlight area coordinates."""
    left: float = Field(..., description="Left position as percentage (0-100)")
    top: float = Field(..., description="Top position as percentage (0-100)")
    width: float = Field(..., description="Width as percentage (0-100)")
    height: float = Field(..., description="Height as percentage (0-100)")
    pageIndex: int = Field(..., description="Page index (0-based)")


class CreateAnnotationRequest(BaseModel):
    """Request model for creating an annotation."""
    document_id: str = Field(..., description="Document ID")
    content: str = Field(..., description="Note content")
    highlight_areas: List[HighlightArea] = Field(..., description="List of highlight areas")
    quote: str = Field(..., description="The highlighted text")
    page_index: int = Field(..., description="Page index (0-based)")
    color: Optional[str] = Field(default="#ffff00", description="Highlight color (hex)")


class UpdateAnnotationRequest(BaseModel):
    """Request model for updating an annotation."""
    content: Optional[str] = Field(None, description="Note content")
    highlight_areas: Optional[List[HighlightArea]] = Field(None, description="List of highlight areas")
    quote: Optional[str] = Field(None, description="The highlighted text")
    page_index: Optional[int] = Field(None, description="Page index (0-based)")
    color: Optional[str] = Field(None, description="Highlight color (hex)")


class AnnotationResponse(BaseModel):
    """Response model for an annotation."""
    _id: str
    user_id: str
    document_id: str
    content: str
    highlight_areas: List[dict]
    quote: str
    page_index: int
    color: str
    created_at: str
    updated_at: str


# ==================== API Routes ====================

@router.post("", response_model=dict)
async def create_annotation(
    request: CreateAnnotationRequest,
    user_id: str = Depends(require_user_id),
):
    """
    Create a new user annotation (highlight/note).
    
    Requires:
    - user_id from authentication
    - document_id must be valid
    """
    # Verify document exists
    doc_object_id = to_object_id(request.document_id)
    if not doc_object_id:
        raise HTTPException(status_code=400, detail=f"Invalid document_id: {request.document_id}")
    
    document = await get_document_by_id(doc_object_id)
    if not document:
        raise HTTPException(status_code=404, detail=f"Document not found: {request.document_id}")
    
    # Convert HighlightArea models to dicts
    highlight_areas_dict = [area.model_dump() for area in request.highlight_areas]
    
    try:
        annotation_id = await save_user_annotation(
            user_id=user_id,
            document_id=request.document_id,
            content=request.content,
            highlight_areas=highlight_areas_dict,
            quote=request.quote,
            page_index=request.page_index,
            color=request.color,
        )
        
        return {
            "status": "success",
            "annotation_id": annotation_id,
            "message": "Annotation created successfully",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[AnnotationAPI] Error creating annotation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create annotation: {str(e)}")


@router.get("", response_model=List[AnnotationResponse])
async def list_annotations(
    document_id: Optional[str] = Query(None, description="Filter by document ID"),
    user_id: str = Depends(require_user_id),
):
    """
    Get all annotations for the authenticated user.
    
    Optionally filter by document_id.
    """
    try:
        annotations = await get_user_annotations(
            user_id=user_id,
            document_id=document_id,
        )
        
        # Convert datetime objects to ISO format strings
        for ann in annotations:
            if "created_at" in ann and hasattr(ann["created_at"], "isoformat"):
                ann["created_at"] = ann["created_at"].isoformat()
            if "updated_at" in ann and hasattr(ann["updated_at"], "isoformat"):
                ann["updated_at"] = ann["updated_at"].isoformat()
        
        return annotations
    except Exception as e:
        print(f"[AnnotationAPI] Error listing annotations: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list annotations: {str(e)}")


@router.get("/{annotation_id}", response_model=AnnotationResponse)
async def get_annotation(
    annotation_id: str,
    user_id: str = Depends(require_user_id),
):
    """
    Get a specific annotation by ID.
    
    Only returns annotations owned by the authenticated user.
    """
    annotation = await get_user_annotation_by_id(
        annotation_id=annotation_id,
        user_id=user_id,
    )
    
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    
    # Convert datetime objects to ISO format strings
    if "created_at" in annotation and hasattr(annotation["created_at"], "isoformat"):
        annotation["created_at"] = annotation["created_at"].isoformat()
    if "updated_at" in annotation and hasattr(annotation["updated_at"], "isoformat"):
        annotation["updated_at"] = annotation["updated_at"].isoformat()
    
    return annotation


@router.put("/{annotation_id}", response_model=dict)
async def update_annotation(
    annotation_id: str,
    request: UpdateAnnotationRequest,
    user_id: str = Depends(require_user_id),
):
    """
    Update an existing annotation.
    
    Only updates annotations owned by the authenticated user.
    """
    # Convert HighlightArea models to dicts if provided
    highlight_areas_dict = None
    if request.highlight_areas is not None:
        highlight_areas_dict = [area.model_dump() for area in request.highlight_areas]
    
    success = await update_user_annotation(
        annotation_id=annotation_id,
        user_id=user_id,
        content=request.content,
        highlight_areas=highlight_areas_dict,
        quote=request.quote,
        page_index=request.page_index,
        color=request.color,
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Annotation not found or not owned by user")
    
    return {
        "status": "success",
        "message": "Annotation updated successfully",
    }


@router.delete("/{annotation_id}", response_model=dict)
async def delete_annotation(
    annotation_id: str,
    user_id: str = Depends(require_user_id),
):
    """
    Delete an annotation.
    
    Only deletes annotations owned by the authenticated user.
    """
    success = await delete_user_annotation(
        annotation_id=annotation_id,
        user_id=user_id,
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Annotation not found or not owned by user")
    
    return {
        "status": "success",
        "message": "Annotation deleted successfully",
    }


@router.delete("/document/{document_id}", response_model=dict)
async def delete_annotations_by_document(
    document_id: str,
    user_id: str = Depends(require_user_id),
):
    """
    Delete all annotations for a specific document.
    
    Only deletes annotations owned by the authenticated user.
    """
    deleted_count = await delete_user_annotations_by_document(
        user_id=user_id,
        document_id=document_id,
    )
    
    return {
        "status": "success",
        "deleted_count": deleted_count,
        "message": f"Deleted {deleted_count} annotation(s)",
    }

