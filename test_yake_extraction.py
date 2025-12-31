#!/usr/bin/env python3
"""
PDF Keyword Extractor using YAKE (Yet Another Keyword Extractor)

YAKE is a lightweight, unsupervised keyword extraction method.
Much faster than KeyBERT but may be less accurate for domain-specific terms.

Usage:
    python test_yake_extraction.py <pdf_path> [-n TOP_N]
    
Examples:
    python test_yake_extraction.py paper.pdf
    python test_yake_extraction.py paper.pdf -n 30
"""

import argparse
import json
import re
import sys
from pathlib import Path


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF using PyMuPDF."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("Error: PyMuPDF not installed. Run: pip install pymupdf")
        sys.exit(1)
    
    doc = fitz.open(pdf_path)
    text_parts = []
    
    for page in doc:
        text_parts.append(page.get_text())
    
    doc.close()
    return "\n".join(text_parts)


# PDF ligature replacements
LIGATURE_MAP = {
    'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff', 'ﬃ': 'ffi', 'ﬄ': 'ffl',
    'ﬅ': 'st', 'ﬆ': 'st', '—': '-', '–': '-', ''': "'", ''': "'",
    '"': '"', '"': '"', '…': '...', '•': '', '·': '', '×': 'x',
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


def preprocess_text(text: str) -> str:
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


def is_valid_keyword(keyword: str) -> bool:
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


def categorize_keyword(keyword: str) -> str:
    """Infer category from keyword content."""
    keyword_lower = keyword.lower()
    
    if any(w in keyword_lower for w in ['access control', 'rbac', 'permission', 'authorization', 'security', 'policy']):
        return 'Security'
    if any(w in keyword_lower for w in ['health', 'medical', 'clinical', 'patient', 'healthcare']):
        return 'Healthcare'
    if any(w in keyword_lower for w in ['neural', 'network', 'deep', 'cnn', 'rnn', 'lstm', 'transformer', 'attention']):
        return 'Deep Learning'
    if any(w in keyword_lower for w in ['learning', 'classification', 'regression', 'clustering', 'training']):
        return 'Machine Learning'
    if any(w in keyword_lower for w in ['language', 'text', 'nlp', 'word', 'sentence', 'semantic']):
        return 'NLP'
    if any(w in keyword_lower for w in ['image', 'visual', 'object', 'detection', 'segmentation']):
        return 'Computer Vision'
    if any(w in keyword_lower for w in ['graph', 'knowledge', 'ontology', 'embedding']):
        return 'Knowledge Representation'
    
    return 'Extracted'


def extract_keywords_yake(text: str, top_n: int = 20, max_ngram: int = 3) -> list:
    """Extract keywords using YAKE."""
    try:
        import yake
    except ImportError:
        print("Error: YAKE not installed. Run: pip install yake")
        sys.exit(1)
    
    # Clean text
    text = preprocess_text(text)
    
    # Initialize YAKE
    # deduplication_threshold: lower = more strict deduplication
    # windowSize: context window for calculating keyword importance
    kw_extractor = yake.KeywordExtractor(
        lan="en",                      # Language
        n=max_ngram,                   # Max n-gram size
        dedupLim=0.7,                  # Deduplication threshold
        dedupFunc='seqm',              # Deduplication function
        windowsSize=1,                 # Window size
        top=top_n * 3,                 # Extract more to filter
        features=None                  # Use default features
    )
    
    # Extract keywords
    # YAKE returns (keyword, score) where LOWER score = more important
    keywords = kw_extractor.extract_keywords(text)
    
    # Filter and format results
    results = []
    seen = set()
    
    for keyword, score in keywords:
        keyword_lower = keyword.lower()
        
        # Skip duplicates
        if keyword_lower in seen:
            continue
        
        # Skip invalid keywords
        if not is_valid_keyword(keyword):
            continue
        
        seen.add(keyword_lower)
        
        # Convert YAKE score (lower = better) to similarity score (higher = better)
        # YAKE scores are typically 0-1, sometimes higher
        similarity = max(0, 1 - score) if score < 1 else 1 / (1 + score)
        
        results.append({
            'keyword': keyword,
            'score': round(similarity, 4),
            'yake_score': round(score, 6),  # Original YAKE score
            'category': categorize_keyword(keyword),
            'word_count': len(keyword.split())
        })
        
        if len(results) >= top_n:
            break
    
    return results


def main():
    parser = argparse.ArgumentParser(
        description="Extract keywords from a PDF using YAKE",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("pdf_path", help="Path to the PDF file")
    parser.add_argument("-n", "--top-n", type=int, default=20, help="Number of keywords")
    parser.add_argument("-m", "--max-ngram", type=int, default=3, help="Max words per keyword")
    parser.add_argument("-o", "--output", help="Output JSON file (optional)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    
    args = parser.parse_args()
    
    # Check PDF exists
    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"Error: PDF not found: {pdf_path}")
        sys.exit(1)
    
    print(f"📄 Processing: {pdf_path.name}")
    print("-" * 50)
    
    # Extract text
    print("Extracting text from PDF...")
    text = extract_text_from_pdf(str(pdf_path))
    print(f"Extracted {len(text)} characters")
    
    if args.verbose:
        print(f"\nFirst 500 chars:\n{text[:500]}...\n")
    
    # Extract keywords with YAKE
    print(f"\nExtracting top {args.top_n} keywords using YAKE...")
    keywords = extract_keywords_yake(text, args.top_n, args.max_ngram)
    
    print("-" * 50)
    print(f"✅ Found {len(keywords)} keywords:\n")
    
    # Display results
    for i, kw in enumerate(keywords, 1):
        name = kw['keyword']
        score = kw['score']
        yake_score = kw['yake_score']
        category = kw['category']
        
        print(f"  {i:2}. {name} (sim={score:.3f}, yake={yake_score:.4f}) [{category}]")
    
    # Save to file
    if args.output:
        output_path = Path(args.output)
        with open(output_path, 'w') as f:
            json.dump({
                "pdf": str(pdf_path),
                "method": "YAKE",
                "keywords": keywords,
                "count": len(keywords)
            }, f, indent=2)
        print(f"\n💾 Saved to: {output_path}")
    
    return keywords


if __name__ == "__main__":
    main()
