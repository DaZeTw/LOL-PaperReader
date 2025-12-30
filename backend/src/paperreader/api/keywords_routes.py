"""
Keyword Extraction API Routes

Provides endpoints for extracting and refining academic keywords from text
using KeyBERT with BERT embeddings.

Endpoints:
- POST /api/keywords/extract - Extract keywords from text
- GET /api/keywords/document/{document_id} - Get keywords for a document
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Body, Query
from pydantic import BaseModel, Field
import json
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/keywords", tags=["Keywords"])


# ============================================================================
# Ontology Loading
# ============================================================================

# Path to draft concepts (ontology terms)
ONTOLOGY_PATH = Path(__file__).parent.parent.parent.parent.parent / "public" / "draft_concepts_v1_lv0123.json"

# Initialize ontology dict
ONTOLOGY: dict = {}


def load_ontology() -> dict:
    """Load ontology terms from JSON file."""
    global ONTOLOGY
    if ONTOLOGY:
        return ONTOLOGY
    
    try:
        if ONTOLOGY_PATH.exists():
            with open(ONTOLOGY_PATH, 'r', encoding='utf-8') as f:
                terms = json.load(f)
            # Index by normalized name
            ONTOLOGY = {term['name'].lower().strip(): term for term in terms}
            logger.info(f"Loaded {len(ONTOLOGY)} ontology terms from {ONTOLOGY_PATH}")
        else:
            logger.warning(f"Ontology file not found: {ONTOLOGY_PATH}")
    except Exception as e:
        logger.error(f"Failed to load ontology: {e}")
    
    return ONTOLOGY


# Load ontology on module import
load_ontology()


# ============================================================================
# Request/Response Models
# ============================================================================

class ExtractionRequest(BaseModel):
    """Request body for keyword extraction."""
    text: str = Field(..., min_length=50, description="Text to extract keywords from")
    top_n: int = Field(20, ge=5, le=50, description="Number of keywords to extract")
    use_mmr: bool = Field(True, description="Use MMR for diversity")
    diversity: float = Field(0.7, ge=0.0, le=1.0, description="MMR diversity factor")
    min_ngram: int = Field(2, ge=1, le=5, description="Minimum words per keyphrase")
    max_ngram: int = Field(5, ge=2, le=7, description="Maximum words per keyphrase")
    exclude_generic: bool = Field(True, description="Exclude generic academic terms")


class KeywordItem(BaseModel):
    """A single extracted keyword."""
    concept: str
    score: float
    is_ontology_aligned: bool
    frequency: int
    category: str
    url: Optional[str] = None
    short_definition: Optional[str] = None


class ExtractionResponse(BaseModel):
    """Response from keyword extraction."""
    keywords: List[KeywordItem]
    raw_count: int = Field(description="Number of raw keywords before refinement")
    refined_count: int = Field(description="Number of keywords after refinement")
    model: str = Field(description="Model used for extraction")


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/extract", response_model=ExtractionResponse)
async def extract_keywords(request: ExtractionRequest):
    """
    Extract and refine keywords from text using KeyBERT.
    
    Uses BERT embeddings for semantic extraction with MMR diversity.
    Results are filtered to remove generic academic terms and aligned
    with the domain ontology when possible.
    
    **Example:**
    ```json
    {
      "text": "This paper presents a convolutional neural network for image classification...",
      "top_n": 15,
      "use_mmr": true,
      "diversity": 0.7
    }
    ```
    """
    try:
        # Lazy import to avoid loading model on startup
        from paperreader.services.keywords.keybert_extractor import AcademicKeywordExtractor
        from paperreader.services.keywords.concept_refiner import ConceptRefiner
        
        # Initialize extractor
        extractor = AcademicKeywordExtractor()
        
        # Extract with KeyBERT
        raw_keywords = extractor.extract_with_frequency(
            text=request.text,
            top_n=request.top_n * 2,  # Extract more, filter later
            keyphrase_ngram_range=(request.min_ngram, request.max_ngram),
            use_mmr=request.use_mmr,
            diversity=request.diversity
        )
        
        # Refine with ontology matching
        refiner = ConceptRefiner(ONTOLOGY)
        refined = refiner.refine(
            raw_keywords,
            max_concepts=request.top_n,
            exclude_generic=request.exclude_generic
        )
        
        return ExtractionResponse(
            keywords=[KeywordItem(**r.to_dict()) for r in refined],
            raw_count=len(raw_keywords),
            refined_count=len(refined),
            model="all-MiniLM-L6-v2"
        )
    
    except ImportError as e:
        logger.error(f"KeyBERT not installed: {e}")
        raise HTTPException(
            status_code=503,
            detail="KeyBERT not available. Install with: pip install keybert sentence-transformers"
        )
    except Exception as e:
        logger.error(f"Keyword extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/extract-simple")
async def extract_keywords_simple(
    text: str = Query(..., min_length=50, description="Text to extract keywords from"),
    top_n: int = Query(15, ge=5, le=30, description="Number of keywords")
):
    """
    Simple GET endpoint for keyword extraction.
    
    For quick testing or simple integrations.
    """
    request = ExtractionRequest(text=text, top_n=top_n)
    return await extract_keywords(request)


@router.get("/ontology/stats")
async def get_ontology_stats():
    """Get statistics about the loaded ontology."""
    return {
        "total_terms": len(ONTOLOGY),
        "path": str(ONTOLOGY_PATH),
        "loaded": len(ONTOLOGY) > 0,
        "sample_terms": list(ONTOLOGY.keys())[:10] if ONTOLOGY else []
    }


@router.get("/health")
async def health_check():
    """Check if the keyword extraction service is healthy."""
    try:
        # Try to import KeyBERT
        from keybert import KeyBERT
        keybert_available = True
    except ImportError:
        keybert_available = False
    
    return {
        "status": "healthy" if keybert_available else "degraded",
        "keybert_available": keybert_available,
        "ontology_loaded": len(ONTOLOGY) > 0,
        "ontology_count": len(ONTOLOGY)
    }
