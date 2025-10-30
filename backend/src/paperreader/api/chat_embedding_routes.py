"""
Chat Embedding Routes - API endpoints for managing chat embeddings
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime

from paperreader.services.chat.chat_embedding_service import chat_embedding_service

router = APIRouter()

class EmbeddingStatsResponse(BaseModel):
    total_embeddings: int
    unembedded_messages: int
    last_processed: Optional[datetime]

class SearchChatResponse(BaseModel):
    query: str
    results: List[dict]
    total_found: int

@router.get("/stats", response_model=EmbeddingStatsResponse)
async def get_embedding_stats():
    """Get statistics about chat embeddings"""
    try:
        # Get total embeddings count
        total_embeddings = await chat_embedding_service.persistent_store.get_embedding_count() if chat_embedding_service.persistent_store else 0
        
        # Get unembedded messages count
        unembedded = await chat_embedding_service.get_unembedded_messages(limit=1000)
        unembedded_count = len(unembedded)
        
        return EmbeddingStatsResponse(
            total_embeddings=total_embeddings,
            unembedded_messages=unembedded_count,
            last_processed=None  # Could be implemented later
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/process-unembedded")
async def process_unembedded_messages(limit: int = Query(50, ge=1, le=200)):
    """Process unembedded chat messages"""
    try:
        result = await chat_embedding_service.embed_unembedded_messages(limit=limit)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search", response_model=SearchChatResponse)
async def search_chat_history(
    query: str,
    top_k: int = Query(5, ge=1, le=20),
    image: Optional[str] = None
):
    """Search chat history using embeddings"""
    try:
        results = await chat_embedding_service.search_chat_history(
            query=query,
            top_k=top_k,
            image=image
        )
        
        return SearchChatResponse(
            query=query,
            results=results,
            total_found=len(results)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/clear-all")
async def clear_all_embeddings():
    """Clear all chat embeddings (use with caution)"""
    try:
        if chat_embedding_service.persistent_store:
            await chat_embedding_service.persistent_store.clear_all_embeddings()
            return {"message": "All chat embeddings cleared successfully"}
        else:
            return {"message": "No persistent store available"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health_check():
    """Health check for chat embedding service"""
    try:
        # Check if service is properly initialized
        if chat_embedding_service.persistent_store is None:
            return {"status": "warning", "message": "Persistent store not initialized"}
        
        # Try to get stats
        stats = await get_embedding_stats()
        return {
            "status": "healthy",
            "message": "Chat embedding service is working",
            "stats": stats
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}