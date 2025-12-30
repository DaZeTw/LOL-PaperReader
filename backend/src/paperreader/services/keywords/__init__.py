"""
Keywords extraction service package.

Provides KeyBERT-based academic keyword extraction with:
- BERT embeddings for semantic understanding
- MMR diversity for non-redundant results
- Ontology alignment with domain concepts
"""

from .keybert_extractor import AcademicKeywordExtractor
from .concept_refiner import ConceptRefiner, RefinedConcept

__all__ = [
    "AcademicKeywordExtractor",
    "ConceptRefiner", 
    "RefinedConcept"
]
