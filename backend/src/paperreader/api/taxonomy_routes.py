"""
Taxonomy API routes - Proxy to external taxonomy service.

Proxies requests to the taxonomy API at http://65.109.74.92:18000
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import httpx


router = APIRouter(prefix="/api/taxonomy", tags=["Taxonomy"])

# External taxonomy API base URL
TAXONOMY_API_BASE = "http://65.109.74.92:18000"


# ============================================================================
# Response Models (matching frontend expectations)
# ============================================================================

class ConceptSearchItem(BaseModel):
    id: str
    name: str
    score: float


class SearchResponse(BaseModel):
    items: List[ConceptSearchItem]


class ConceptResponse(BaseModel):
    id: str
    name: str
    definition: str
    level: Optional[int] = None
    category: Optional[str] = None
    ambiguous_with: Optional[List[str]] = None


class RelatedConcept(BaseModel):
    id: str
    name: str


class SiblingsResponse(BaseModel):
    siblings: List[RelatedConcept]


class DescendantsResponse(BaseModel):
    descendants: List[RelatedConcept]


# ============================================================================
# API Endpoints (Proxy to external service)
# ============================================================================

@router.get("/search", response_model=SearchResponse)
async def search_concepts(
    query: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(5, ge=1, le=50, description="Maximum results to return")
) -> SearchResponse:
    """Search for concepts by name. Proxies to external taxonomy API."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.get(
                f"{TAXONOMY_API_BASE}/search",
                params={"query": query, "limit": limit}
            )
            res.raise_for_status()
            data = res.json()
            
            # Transform response to match frontend expectations
            # External API returns {"query": ..., "items": [...]}
            raw_items = data.get("items", []) if isinstance(data, dict) else data
            items = [
                ConceptSearchItem(
                    id=str(item.get("id", "")),
                    name=item.get("name", ""),
                    score=item.get("score", 0.0)
                )
                for item in raw_items
                if isinstance(item, dict)
            ]
            return SearchResponse(items=items)
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=str(e))
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Taxonomy service unavailable: {e}")


@router.get("/concepts/{concept_id}", response_model=ConceptResponse)
async def get_concept(concept_id: str) -> ConceptResponse:
    """Get concept details by ID. Proxies to external taxonomy API."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.get(f"{TAXONOMY_API_BASE}/concepts/{concept_id}")
            res.raise_for_status()
            data = res.json()
            
            return ConceptResponse(
                id=str(data.get("id", concept_id)),
                name=data.get("name", ""),
                definition=data.get("definition", ""),
                level=data.get("level"),
                category=data.get("category"),
                ambiguous_with=data.get("ambiguous_with")
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Concept not found: {concept_id}")
            raise HTTPException(status_code=e.response.status_code, detail=str(e))
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Taxonomy service unavailable: {e}")


@router.get("/concepts/{concept_id}/siblings", response_model=SiblingsResponse)
async def get_siblings(
    concept_id: str,
    limit: int = Query(10, ge=1, le=50, description="Maximum siblings to return")
) -> SiblingsResponse:
    """Get sibling concepts. Proxies to external taxonomy API."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.get(
                f"{TAXONOMY_API_BASE}/concepts/{concept_id}/siblings",
                params={"limit": limit}
            )
            res.raise_for_status()
            data = res.json()
            
            # External API may return {"siblings": [...]} or just [...]
            raw_items = data.get("siblings", data) if isinstance(data, dict) else data
            siblings = [
                RelatedConcept(id=str(item.get("id", "")), name=item.get("name", ""))
                for item in raw_items
                if isinstance(item, dict)
            ]
            return SiblingsResponse(siblings=siblings)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Concept not found: {concept_id}")
            raise HTTPException(status_code=e.response.status_code, detail=str(e))
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Taxonomy service unavailable: {e}")


@router.get("/concepts/{concept_id}/descendants", response_model=DescendantsResponse)
async def get_descendants(
    concept_id: str,
    max_nodes: int = Query(10, ge=1, le=50, description="Maximum descendants to return")
) -> DescendantsResponse:
    """Get descendant concepts. Proxies to external taxonomy API."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.get(
                f"{TAXONOMY_API_BASE}/concepts/{concept_id}/descendants",
                params={"max_nodes": max_nodes}
            )
            res.raise_for_status()
            data = res.json()
            
            # External API may return {"descendants": [...]} or just [...]
            raw_items = data.get("descendants", data) if isinstance(data, dict) else data
            descendants = [
                RelatedConcept(id=str(item.get("id", "")), name=item.get("name", ""))
                for item in raw_items
                if isinstance(item, dict)
            ]
            return DescendantsResponse(descendants=descendants)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Concept not found: {concept_id}")
            raise HTTPException(status_code=e.response.status_code, detail=str(e))
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Taxonomy service unavailable: {e}")
