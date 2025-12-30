"""
KeyBERT-based Academic Keyword Extractor

Uses BERT embeddings + MMR diversity to extract semantically relevant
academic concepts from PDF text. Much more accurate than pattern matching
due to contextual understanding.

Features:
- BERT-based semantic extraction
- MMR for diverse, non-redundant keywords  
- Seed keywords from ontology for guided extraction
- Multi-word phrase extraction (n-grams 2-5)
- Improved preprocessing to remove PDF artifacts and OWL syntax
"""

from typing import List, Dict, Optional, Tuple
import re
import logging

logger = logging.getLogger(__name__)

# Lazy load KeyBERT to avoid startup overhead
_keybert_model = None


def get_keybert_model(model_name: str = "all-MiniLM-L6-v2"):
    """Lazy load KeyBERT model for performance."""
    global _keybert_model
    if _keybert_model is None:
        try:
            from keybert import KeyBERT
            logger.info(f"Loading KeyBERT with model: {model_name}")
            _keybert_model = KeyBERT(model=model_name)
            logger.info("KeyBERT model loaded successfully")
        except ImportError:
            logger.error("KeyBERT not installed. Run: pip install keybert")
            raise
    return _keybert_model


# PDF ligature replacements
LIGATURE_MAP = {
    'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff', 'ﬃ': 'ffi', 'ﬄ': 'ffl',
    'ﬅ': 'st', 'ﬆ': 'st', '—': '-', '–': '-', ''': "'", ''': "'",
    '"': '"', '"': '"', '…': '...', '•': '', '·': '', '×': 'x',
}

# Words that should not end a keyphrase
WEAK_ENDING_WORDS = {
    'able', 'having', 'making', 'using', 'based', 'need', 'needed',
    'used', 'given', 'following', 'including', 'considered', 'related',
    'various', 'different', 'several', 'many', 'other', 'such',
    'thang', 'minh', 'noam', 'ilya', 'et', 'al', 'arxiv',
}

# Common author surnames and first names to filter
AUTHOR_NAMES = {
    # Common ML/AI researcher names
    'vaswani', 'bengio', 'hinton', 'lecun', 'goodfellow', 'sutskever',
    'schmidhuber', 'hochreiter', 'graves', 'bahdanau', 'cho', 'luong',
    'mikolov', 'pennington', 'manning', 'jurafsky', 'collobert', 'weston',
    'krizhevsky', 'simonyan', 'szegedy', 'he', 'resnet', 'vgg',
    'devlin', 'radford', 'brown', 'raffel', 'shazeer', 'parmar',
    'uszkoreit', 'jones', 'gomez', 'kaiser', 'polosukhin', 'aidan',
    'ginsburg', 'wojna', 'zhu', 'srivastava', 'dropout', 'kingma',
    'ba', 'adam', 'ioffe', 'batch', 'sennrich', 'wu', 'schuster',
    'johnson', 'gehring', 'auli', 'kalchbrenner', 'espeholt',
    'yann', 'dauphin', 'marcus', 'mary', 'mitchell', 'dyer', 'clark',
    'vinyals', 'oriol', 'zaremba', 'wojciech', 'jozefowicz', 'rafal',
    'chung', 'junyoung', 'kyunghyun', 'ilya', 'yoshua', 'geoffrey',
    'ruslan', 'salakhutdinov', 'andrew', 'ng', 'chris', 'deng', 'li',
    'slav', 'petrov', 'percy', 'liang', 'socher', 'karpathy', 'fei',
    'jason', 'weston', 'leon', 'bottou', 'wang', 'zhang', 'liu', 'chen',
    # First names
    'ashish', 'noam', 'niki', 'lukasz', 'llion', 'illia', 'jakob',
    'minh', 'thang', 'yonghui', 'mike', 'quoc', 'jeff', 'dean',
    # Common single-word company/org names
    'google', 'facebook', 'meta', 'openai', 'deepmind', 'microsoft',
    'brain', 'research', 'university', 'stanford', 'berkeley', 'mit',
    'toronto', 'montreal', 'cmu', 'harvard', 'princeton', 'cornell',
}

# Conference/journal names to filter
CONFERENCE_NAMES = {
    'nips', 'neurips', 'icml', 'iclr', 'cvpr', 'iccv', 'eccv',
    'acl', 'emnlp', 'naacl', 'coling', 'aaai', 'ijcai', 'uai',
    'icra', 'iros', 'kdd', 'www', 'sigir', 'wsdm', 'cikm',
    'arxiv', 'preprint', 'proceedings', 'conference', 'journal',
    'transactions', 'workshop', 'symposium', 'advances', 'annual',
}

# Words that should not start a keyphrase
WEAK_STARTING_WORDS = {
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'when', 'where',
    'which', 'that', 'this', 'these', 'those', 'it', 'its',
    'can', 'could', 'would', 'should', 'may', 'might', 'must',
    'will', 'shall', 'have', 'has', 'had', 'be', 'been', 'being',
    'is', 'are', 'was', 'were', 'do', 'does', 'did',
}


class AcademicKeywordExtractor:
    """
    Extract academic keywords using KeyBERT with domain-specific enhancements.
    
    Features:
    - BERT-based semantic extraction
    - MMR for diverse, non-redundant keywords
    - Improved preprocessing for academic PDFs
    - Filtering of garbage patterns and OWL syntax
    """
    
    def __init__(
        self,
        model_name: str = "all-MiniLM-L6-v2",
        seed_keywords: Optional[List[str]] = None
    ):
        self.model_name = model_name
        self.seed_keywords = seed_keywords or []
        self._model = None
    
    @property
    def model(self):
        """Lazy load the model."""
        if self._model is None:
            self._model = get_keybert_model(self.model_name)
        return self._model
    
    def extract(
        self,
        text: str,
        top_n: int = 20,
        keyphrase_ngram_range: Tuple[int, int] = (1, 3),  # 1-3 words per keyword
        diversity: float = 0.5,  # Lowered for more relevant results
        use_mmr: bool = True,
        seed_keywords: Optional[List[str]] = None,
        min_score: float = 0.2  # Increased minimum score
    ) -> List[Dict]:
        """
        Extract keywords from text using KeyBERT.
        """
        if not text or len(text.strip()) < 50:
            logger.warning("Text too short for keyword extraction")
            return []
        
        # Clean text
        text = self._preprocess_text(text)
        
        # Truncate if too long
        max_chars = 50000
        if len(text) > max_chars:
            logger.info(f"Truncating text from {len(text)} to {max_chars} chars")
            text = text[:max_chars]
        
        seeds = seed_keywords or self.seed_keywords
        
        try:
            if use_mmr:
                keywords = self.model.extract_keywords(
                    text,
                    keyphrase_ngram_range=keyphrase_ngram_range,
                    stop_words='english',
                    use_mmr=True,
                    diversity=diversity,
                    top_n=top_n * 3,  # Extract more to filter
                    seed_keywords=seeds if seeds else None
                )
            else:
                keywords = self.model.extract_keywords(
                    text,
                    keyphrase_ngram_range=keyphrase_ngram_range,
                    stop_words='english',
                    use_maxsum=True,
                    nr_candidates=top_n * 4,
                    top_n=top_n * 3
                )
        except Exception as e:
            logger.error(f"KeyBERT extraction failed: {e}")
            return []
        
        # Filter and validate keywords
        results = []
        seen_keywords = set()
        
        for keyword, score in keywords:
            keyword_lower = keyword.lower().strip()
            
            # Skip duplicates
            if keyword_lower in seen_keywords:
                continue
            
            # Skip low scores
            if score < min_score:
                continue
            
            # Validate keyword quality
            if not self._is_valid_keyword(keyword_lower):
                continue
            
            seen_keywords.add(keyword_lower)
            word_count = len(keyword.split())
            results.append({
                'keyword': keyword,
                'score': float(score),
                'word_count': word_count
            })
            
            if len(results) >= top_n:
                break
        
        logger.info(f"Extracted {len(results)} valid keywords from {len(text)} chars")
        return results
    
    def _preprocess_text(self, text: str) -> str:
        """Clean text for better extraction."""
        # Fix common PDF ligatures
        for lig, replacement in LIGATURE_MAP.items():
            text = text.replace(lig, replacement)
        
        # Remove OWL/ontology syntax patterns (camelCase identifiers)
        text = re.sub(r'\b(has|is|get|set)[A-Z][a-zA-Z]*\b', '', text)
        text = re.sub(r'\b[a-z]+[A-Z][a-zA-Z]+[A-Z][a-zA-Z]*\b', '', text)  # camelCase
        text = re.sub(r'\b[A-Z][a-z]+[A-Z][a-zA-Z]+\b', '', text)  # CamelCase
        
        # Remove URLs and emails
        text = re.sub(r'https?://\S+', '', text)
        text = re.sub(r'\S+@\S+\.\S+', '', text)
        
        # Remove reference markers
        text = re.sub(r'\[\d+(?:,\s*\d+)*\]', '', text)  # [1], [1, 2]
        text = re.sub(r'\(\s*\w+(?:\s+et\s+al\.?)?\s*,?\s*\d{4}\s*\)', '', text)  # (Smith 2020)
        
        # Remove common PDF artifacts
        text = re.sub(r'\b(et\s+al\.?|fig\.?\s*\d*|table\s*\d*|equation\s*\d*)\b', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\b(doi|isbn|issn|arxiv)\s*:?\s*[\d\w./\-]+', '', text, flags=re.IGNORECASE)
        
        # Remove page/section numbers
        text = re.sub(r'\b(page|section|chapter|appendix)\s*[A-Z]?\d*\b', '', text, flags=re.IGNORECASE)
        
        # Remove single letters and numbers standing alone
        text = re.sub(r'\b[a-zA-Z]\b', ' ', text)
        text = re.sub(r'\b\d+\b', ' ', text)
        
        # Clean up special characters and whitespace
        text = re.sub(r'[^\w\s\-]', ' ', text)
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    def _is_valid_keyword(self, keyword: str) -> bool:
        """Check if a keyword is valid (not garbage)."""
        words = keyword.split()
        words_lower = [w.lower() for w in words]
        
        # Must have 1-3 words
        if len(words) < 1 or len(words) > 3:
            return False
        
        # Check for weak starting/ending words
        if words_lower[0] in WEAK_STARTING_WORDS:
            return False
        if words_lower[-1] in WEAK_ENDING_WORDS:
            return False
        
        # Reject if contains author names
        author_count = sum(1 for w in words_lower if w in AUTHOR_NAMES)
        if author_count >= 1:
            return False
        
        # Reject if contains conference/journal names
        if any(w in CONFERENCE_NAMES for w in words_lower):
            return False
        
        # Reject if most words are very short (< 3 chars)
        short_words = sum(1 for w in words if len(w) < 3)
        if short_words > len(words) * 0.4:
            return False
        
        # Reject if contains numbers
        if re.search(r'\d', keyword):
            return False
        
        # Reject OWL-like patterns
        if re.search(r'(has|is|get|set)[A-Z]', keyword):
            return False
        
        # Reject if keyword is just repeated words
        if len(set(words_lower)) < len(words) * 0.7:
            return False
        
        # Minimum keyword length
        if len(keyword) < 8:
            return False
        
        return True
    
    def extract_with_frequency(
        self,
        text: str,
        top_n: int = 20,
        **kwargs
    ) -> List[Dict]:
        """
        Extract keywords and count their occurrences in text.
        """
        keywords = self.extract(text, top_n=top_n, **kwargs)
        text_lower = text.lower()
        
        for kw in keywords:
            keyword_lower = kw['keyword'].lower()
            frequency = text_lower.count(keyword_lower)
            kw['frequency'] = max(1, frequency)
        
        return keywords


class SpecterKeywordExtractor(AcademicKeywordExtractor):
    """
    Uses SPECTER model fine-tuned on scientific papers.
    Better for academic/research documents but slower.
    """
    
    def __init__(self, seed_keywords: Optional[List[str]] = None):
        super().__init__(
            model_name="allenai/specter",
            seed_keywords=seed_keywords
        )
