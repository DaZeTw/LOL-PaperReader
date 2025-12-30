"""
Post-processing refinement for KeyBERT results.

Filters generic academic terms, aligns with domain ontology,
and produces high-precision concept lists.
"""

from typing import List, Dict, Set, Optional
from dataclasses import dataclass, asdict
import re
import logging

logger = logging.getLogger(__name__)


@dataclass
class RefinedConcept:
    """A refined academic concept with metadata."""
    concept: str
    score: float
    is_ontology_aligned: bool
    frequency: int
    category: str
    url: str = ""
    short_definition: str = ""
    
    def to_dict(self) -> Dict:
        return asdict(self)


# Generic terms that appear in most academic papers - penalize these heavily
GENERIC_TERMS: Set[str] = {
    # Methodology terms (HIGH frequency in all papers)
    'proposed method', 'proposed approach', 'proposed model', 'proposed framework',
    'proposed system', 'proposed algorithm', 'proposed technique',
    'experimental results', 'experimental evaluation', 'experimental analysis',
    'performance evaluation', 'performance analysis', 'performance comparison',
    
    # State of the art references
    'state art', 'state-of-the-art', 'sota', 'baseline model', 'baseline method',
    
    # Related work
    'previous work', 'related work', 'future work', 'future research',
    'research question', 'research problem', 'research gap',
    
    # Contributions
    'main contribution', 'key contribution', 'novel contribution',
    
    # Data terms
    'training data', 'test data', 'input data', 'output data',
    'ground truth', 'labeled data', 'unlabeled data',
    
    # Evaluation
    'ablation study', 'case study', 'empirical study',
    'quantitative analysis', 'qualitative analysis',
    
    # Scale
    'large scale', 'small scale', 'real world', 'real-world',
    
    # Quality
    'high quality', 'low quality', 'high performance', 'low performance',
    
    # Common ML/DL (too generic unless more specific)
    'machine learning', 'deep learning', 'neural network', 'neural networks',
    'artificial intelligence', 'feature extraction', 'feature learning',
    
    # Generic phrases
    'first step', 'next step', 'final step', 'main idea', 'key idea',
    'important role', 'key role', 'main goal', 'key goal',
    'paper proposes', 'paper presents', 'paper introduces',
    'section describes', 'section presents', 'section discusses',
}

# Single generic words to check
GENERIC_SINGLE_WORDS: Set[str] = {
    'method', 'approach', 'technique', 'system', 'model', 'framework',
    'algorithm', 'process', 'application', 'evaluation', 'experiment',
    'result', 'analysis', 'study', 'research', 'paper', 'work',
    'data', 'information', 'knowledge', 'problem', 'solution',
    'feature', 'property', 'type', 'level', 'domain', 'field',
    'effect', 'impact', 'role', 'development', 'implementation',
    'performance', 'accuracy', 'improvement', 'comparison',
}


def normalize_text(text: str) -> str:
    """Normalize text for matching."""
    text = text.lower().strip()
    text = re.sub(r'\s+', ' ', text)
    return text


def is_generic_term(keyword: str) -> bool:
    """Check if a keyword is generic academic terminology."""
    normalized = normalize_text(keyword)
    words = normalized.split()
    
    # Check exact phrase match
    if normalized in GENERIC_TERMS:
        return True
    
    # Check if any generic phrase is contained
    for generic in GENERIC_TERMS:
        if generic in normalized:
            return True
    
    # Single word in generic list
    if len(words) == 1 and words[0] in GENERIC_SINGLE_WORDS:
        return True
    
    # If ALL words are generic single words, it's generic
    if all(w in GENERIC_SINGLE_WORDS for w in words):
        return True
    
    # If more than 60% of words are generic, likely generic phrase
    generic_count = sum(1 for w in words if w in GENERIC_SINGLE_WORDS)
    if len(words) > 1 and generic_count / len(words) >= 0.6:
        return True
    
    return False


class ConceptRefiner:
    """
    Refine KeyBERT results with ontology matching and filtering.
    
    Applies:
    1. Generic term penalty/exclusion
    2. Ontology alignment boost
    3. Word count preferences (3-5 words preferred)
    4. Diversity filtering
    """
    
    def __init__(self, ontology_terms: Optional[Dict[str, Dict]] = None):
        """
        Args:
            ontology_terms: Dict mapping normalized term name -> term data
                           e.g. {"convolutional neural network": {"url": "...", "short_definition": "..."}}
        """
        self.ontology = ontology_terms or {}
        logger.info(f"ConceptRefiner initialized with {len(self.ontology)} ontology terms")
    
    def refine(
        self,
        keybert_results: List[Dict],
        max_concepts: int = 15,
        generic_penalty: float = 0.5,
        ontology_boost: float = 0.3,
        min_word_count: int = 2,
        max_word_count: int = 6,
        exclude_generic: bool = True
    ) -> List[RefinedConcept]:
        """
        Refine KeyBERT results into high-quality academic concepts.
        
        Args:
            keybert_results: Raw results from KeyBERT extractor
            max_concepts: Maximum concepts to return
            generic_penalty: Score penalty for generic terms
            ontology_boost: Score boost for ontology-aligned terms
            min_word_count: Minimum words in concept
            max_word_count: Maximum words in concept
            exclude_generic: Completely exclude clearly generic terms
        
        Returns:
            List of RefinedConcept objects sorted by score
        """
        refined = []
        seen_concepts = set()
        
        for item in keybert_results:
            keyword = item.get('keyword', '')
            score = item.get('score', 0.0)
            word_count = item.get('word_count', len(keyword.split()))
            frequency = item.get('frequency', 1)
            
            # Skip empty
            if not keyword:
                continue
            
            # Skip if too short or too long
            if word_count < min_word_count or word_count > max_word_count:
                continue
            
            # Skip duplicates
            normalized = normalize_text(keyword)
            if normalized in seen_concepts:
                continue
            seen_concepts.add(normalized)
            
            # Check for generic terms
            is_generic = is_generic_term(keyword)
            if is_generic:
                if exclude_generic:
                    logger.debug(f"Excluding generic term: {keyword}")
                    continue
                score -= generic_penalty
            
            # Check ontology alignment
            ontology_match = self._find_ontology_match(normalized)
            is_aligned = ontology_match is not None
            
            if is_aligned:
                score += ontology_boost
                # Use ontology metadata
                url = ontology_match.get('url', '')
                short_definition = ontology_match.get('short_definition', '')
                category = self._categorize_term(ontology_match)
            else:
                url = ''
                short_definition = ''
                category = self._infer_category(keyword)
            
            # Skip if score too low after adjustments
            if score < 0.1:
                continue
            
            # Prefer 3-4 word phrases slightly
            if 3 <= word_count <= 4:
                score += 0.05
            
            refined.append(RefinedConcept(
                concept=keyword,
                score=round(score, 4),
                is_ontology_aligned=is_aligned,
                frequency=frequency,
                category=category,
                url=url,
                short_definition=short_definition
            ))
        
        # Sort by score descending
        refined.sort(key=lambda x: x.score, reverse=True)
        
        logger.info(f"Refined {len(keybert_results)} keywords to {len(refined)} concepts")
        return refined[:max_concepts]
    
    def _find_ontology_match(self, normalized: str) -> Optional[Dict]:
        """Find a matching term in the ontology."""
        # Exact match
        if normalized in self.ontology:
            return self.ontology[normalized]
        
        # Try without hyphens
        no_hyphen = normalized.replace('-', ' ')
        if no_hyphen in self.ontology:
            return self.ontology[no_hyphen]
        
        return None
    
    def _categorize_term(self, ontology_match: Dict) -> str:
        """Determine category from ontology data."""
        # Try to extract from URL or name
        url = ontology_match.get('url', '').lower()
        name = ontology_match.get('name', '').lower()
        
        if 'machine_learning' in url or 'learning' in name:
            return 'Machine Learning'
        if 'neural' in name or 'deep_learning' in url:
            return 'Deep Learning'
        if 'nlp' in url or 'natural_language' in url or 'language' in name:
            return 'NLP'
        if 'computer_vision' in url or 'image' in name or 'visual' in name:
            return 'Computer Vision'
        if 'statistics' in url or 'probability' in name:
            return 'Statistics'
        
        return 'Other'
    
    def _infer_category(self, keyword: str) -> str:
        """Infer category from keyword content."""
        keyword_lower = keyword.lower()
        
        # Security & Access Control
        if any(w in keyword_lower for w in ['access control', 'rbac', 'permission', 'authorization', 'authentication', 'security', 'policy']):
            return 'Security'
        
        # Healthcare
        if any(w in keyword_lower for w in ['health', 'medical', 'clinical', 'patient', 'healthcare', 'hospital']):
            return 'Healthcare'
        
        # Deep Learning
        if any(w in keyword_lower for w in ['neural', 'network', 'deep', 'cnn', 'rnn', 'lstm', 'transformer', 'attention']):
            return 'Deep Learning'
        
        # Machine Learning
        if any(w in keyword_lower for w in ['learning', 'classification', 'regression', 'clustering', 'training', 'prediction']):
            return 'Machine Learning'
        
        # NLP
        if any(w in keyword_lower for w in ['language', 'text', 'nlp', 'word', 'sentence', 'semantic', 'parsing']):
            return 'NLP'
        
        # Computer Vision
        if any(w in keyword_lower for w in ['image', 'visual', 'object', 'detection', 'segmentation', 'recognition']):
            return 'Computer Vision'
        
        # Knowledge Representation
        if any(w in keyword_lower for w in ['graph', 'knowledge', 'ontology', 'embedding', 'reasoning', 'semantic web']):
            return 'Knowledge Representation'
        
        # Database & Information Systems
        if any(w in keyword_lower for w in ['database', 'query', 'retrieval', 'storage', 'index']):
            return 'Information Systems'
        
        # Software Engineering
        if any(w in keyword_lower for w in ['software', 'architecture', 'design pattern', 'component', 'service']):
            return 'Software Engineering'
        
        return 'Extracted'
