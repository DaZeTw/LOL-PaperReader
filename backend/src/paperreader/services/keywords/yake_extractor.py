"""
YAKE (Yet Another Keyword Extractor) based keyword extraction service.

YAKE is a lightweight, unsupervised keyword extraction method.
Much faster than KeyBERT but may be less accurate for domain-specific terms.
"""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import fitz  # PyMuPDF


@dataclass
class ExtractedKeyword:
    """Represents an extracted keyword with metadata."""
    keyword: str
    score: float  # Higher = better (converted from YAKE's lower = better)
    yake_score: float  # Original YAKE score (lower = better)
    category: str
    word_count: int

    def to_dict(self) -> dict:
        return {
            "keyword": self.keyword,
            "score": round(self.score, 4),
            "yake_score": round(self.yake_score, 6),
            "category": self.category,
            "word_count": self.word_count,
        }


# PDF ligature replacements
LIGATURE_MAP = {
    '\ufb01': 'fi', '\ufb02': 'fl', '\ufb00': 'ff', '\ufb03': 'ffi', '\ufb04': 'ffl',
    '\ufb05': 'st', '\ufb06': 'st', '\u2014': '-', '\u2013': '-', '\u2018': "'", '\u2019': "'",
    '\u201c': '"', '\u201d': '"', '\u2026': '...', '\u2022': '', '\u00b7': '', '\u00d7': 'x',
}

# Author names to filter
AUTHOR_NAMES = {
    'vaswani', 'bengio', 'hinton', 'lecun', 'goodfellow', 'sutskever',
    'schmidhuber', 'hochreiter', 'graves', 'bahdanau', 'cho', 'luong',
    'mikolov', 'pennington', 'manning', 'jurafsky', 'collobert', 'weston',
    'krizhevsky', 'simonyan', 'szegedy', 'devlin', 'radford', 'brown',
    'raffel', 'shazeer', 'parmar', 'uszkoreit', 'jones', 'gomez', 'kaiser',
    'polosukhin', 'ginsburg', 'wojna', 'zhu', 'srivastava', 'kingma',
    'sennrich', 'wu', 'schuster', 'johnson', 'gehring', 'auli',
    'yann', 'dauphin', 'marcus', 'mary', 'mitchell', 'dyer', 'clark',
    'vinyals', 'oriol', 'zaremba', 'wojciech', 'jozefowicz', 'rafal',
    'chung', 'junyoung', 'kyunghyun', 'ilya', 'yoshua', 'geoffrey',
    'ruslan', 'salakhutdinov', 'andrew', 'ng', 'chris', 'deng', 'li',
    'slav', 'petrov', 'percy', 'liang', 'socher', 'karpathy', 'fei',
    'jason', 'leon', 'bottou', 'wang', 'zhang', 'liu', 'chen',
    'ashish', 'noam', 'niki', 'lukasz', 'llion', 'illia', 'jakob',
    'minh', 'thang', 'yonghui', 'mike', 'quoc', 'jeff', 'dean',
    'google', 'facebook', 'meta', 'openai', 'deepmind', 'microsoft',
    'brain', 'research', 'university', 'stanford', 'berkeley', 'mit',
}

# Generic terms to filter
GENERIC_TERMS = {
    'proposed method', 'experimental results', 'state art',
    'previous work', 'related work', 'future work',
}


class YakeKeywordExtractor:
    """
    YAKE-based keyword extractor for PDF documents.

    Usage:
        extractor = YakeKeywordExtractor()
        keywords = extractor.extract_from_pdf(pdf_path, top_n=20)
        # or
        keywords = extractor.extract_from_text(text, top_n=20)
    """

    def __init__(
        self,
        language: str = "en",
        max_ngram: int = 3,
        dedup_threshold: float = 0.7,
        window_size: int = 1,
    ):
        """
        Initialize the YAKE keyword extractor.

        Args:
            language: Language code (default: "en")
            max_ngram: Maximum n-gram size (default: 3)
            dedup_threshold: Deduplication threshold (default: 0.7)
            window_size: Context window size (default: 1)
        """
        self.language = language
        self.max_ngram = max_ngram
        self.dedup_threshold = dedup_threshold
        self.window_size = window_size

    def extract_text_from_pdf(self, pdf_path: Path) -> str:
        """Extract text from PDF using PyMuPDF."""
        doc = fitz.open(str(pdf_path))
        text_parts = []

        for page in doc:
            text_parts.append(page.get_text())

        doc.close()
        return "\n".join(text_parts)

    def preprocess_text(self, text: str) -> str:
        """Clean text for better extraction."""
        # Fix ligatures
        for lig, replacement in LIGATURE_MAP.items():
            text = text.replace(lig, replacement)

        # Remove URLs and references
        text = re.sub(r'https?://\S+', '', text)
        text = re.sub(r'\[\d+(?:,\s*\d+)*\]', '', text)
        text = re.sub(r'\(\s*\w+(?:\s+et\s+al\.?)?\s*,?\s*\d{4}\s*\)', '', text)

        # Remove common PDF artifacts
        text = re.sub(r'\b(et\s+al\.?|fig\.?\s*\d*|table\s*\d*)\b', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\b(doi|isbn|issn|arxiv)\s*:?\s*[\d\w./\-]+', '', text, flags=re.IGNORECASE)

        # Clean up whitespace
        text = re.sub(r'\s+', ' ', text)

        return text.strip()

    def is_valid_keyword(self, keyword: str) -> bool:
        """Check if a keyword is valid."""
        words = keyword.lower().split()

        # Must have 1-3 words
        if len(words) < 1 or len(words) > 3:
            return False

        # Skip if contains author names
        if any(w in AUTHOR_NAMES for w in words):
            return False

        # Skip generic terms
        keyword_lower = keyword.lower()
        if any(g in keyword_lower for g in GENERIC_TERMS):
            return False

        # Skip if contains numbers
        if re.search(r'\d', keyword):
            return False

        # Minimum length
        if len(keyword) < 4:
            return False

        return True

    def categorize_keyword(self, keyword: str) -> str:
        """Infer category from keyword content."""
        keyword_lower = keyword.lower()

        if any(w in keyword_lower for w in ['access control', 'rbac', 'permission', 'authorization', 'security', 'policy']):
            return 'Security'
        if any(w in keyword_lower for w in ['health', 'medical', 'clinical', 'patient', 'healthcare']):
            return 'Health & Medicine'
        if any(w in keyword_lower for w in ['neural', 'network', 'deep', 'cnn', 'rnn', 'lstm', 'transformer', 'attention']):
            return 'Neural Architectures'
        if any(w in keyword_lower for w in ['learning', 'classification', 'regression', 'clustering', 'training']):
            return 'Machine Learning'
        if any(w in keyword_lower for w in ['language', 'text', 'nlp', 'word', 'sentence', 'semantic']):
            return 'NLP & Language Models'
        if any(w in keyword_lower for w in ['image', 'visual', 'object', 'detection', 'segmentation']):
            return 'Computer Vision'
        if any(w in keyword_lower for w in ['graph', 'knowledge', 'ontology', 'embedding']):
            return 'AI Concepts'
        if any(w in keyword_lower for w in ['data', 'statistic', 'analysis', 'dataset', 'metric']):
            return 'Data & Statistics'
        if any(w in keyword_lower for w in ['algorithm', 'optimization', 'method', 'approach', 'technique']):
            return 'Science & Research'

        return 'Other'

    def extract_from_text(
        self,
        text: str,
        top_n: int = 20,
    ) -> List[ExtractedKeyword]:
        """
        Extract keywords from text using YAKE.

        Args:
            text: Input text
            top_n: Number of keywords to return

        Returns:
            List of ExtractedKeyword objects sorted by score (higher = better)
        """
        import yake

        # Clean text
        text = self.preprocess_text(text)

        # Initialize YAKE
        kw_extractor = yake.KeywordExtractor(
            lan=self.language,
            n=self.max_ngram,
            dedupLim=self.dedup_threshold,
            dedupFunc='seqm',
            windowsSize=self.window_size,
            top=top_n * 3,  # Extract more to filter
            features=None
        )

        # Extract keywords
        # YAKE returns (keyword, score) where LOWER score = more important
        keywords = kw_extractor.extract_keywords(text)

        # Filter and format results
        results: List[ExtractedKeyword] = []
        seen: set = set()

        for keyword, yake_score in keywords:
            keyword_lower = keyword.lower()

            # Skip duplicates
            if keyword_lower in seen:
                continue

            # Skip invalid keywords
            if not self.is_valid_keyword(keyword):
                continue

            seen.add(keyword_lower)

            # Convert YAKE score (lower = better) to similarity score (higher = better)
            # YAKE scores are typically 0-1, sometimes higher
            score = max(0, 1 - yake_score) if yake_score < 1 else 1 / (1 + yake_score)

            results.append(ExtractedKeyword(
                keyword=keyword,
                score=score,
                yake_score=yake_score,
                category=self.categorize_keyword(keyword),
                word_count=len(keyword.split())
            ))

            if len(results) >= top_n:
                break

        return results

    def extract_from_pdf(
        self,
        pdf_path: Path,
        top_n: int = 20,
    ) -> List[ExtractedKeyword]:
        """
        Extract keywords from a PDF file.

        Args:
            pdf_path: Path to the PDF file
            top_n: Number of keywords to return

        Returns:
            List of ExtractedKeyword objects sorted by score (higher = better)
        """
        text = self.extract_text_from_pdf(pdf_path)
        return self.extract_from_text(text, top_n)


# Module-level convenience functions
_default_extractor: Optional[YakeKeywordExtractor] = None


def _get_extractor() -> YakeKeywordExtractor:
    """Get or create the default extractor instance."""
    global _default_extractor
    if _default_extractor is None:
        _default_extractor = YakeKeywordExtractor()
    return _default_extractor


def extract_keywords_from_pdf(
    pdf_path: Path,
    top_n: int = 20,
) -> List[ExtractedKeyword]:
    """
    Extract keywords from a PDF file using YAKE.

    Args:
        pdf_path: Path to the PDF file
        top_n: Number of keywords to return

    Returns:
        List of ExtractedKeyword objects
    """
    return _get_extractor().extract_from_pdf(pdf_path, top_n)


def extract_keywords_from_text(
    text: str,
    top_n: int = 20,
) -> List[ExtractedKeyword]:
    """
    Extract keywords from text using YAKE.

    Args:
        text: Input text
        top_n: Number of keywords to return

    Returns:
        List of ExtractedKeyword objects
    """
    return _get_extractor().extract_from_text(text, top_n)
