"""
PDF Keyword Highlighter using Term Matching

This module parses PDF files using PyMuPDF and highlights keywords/terms
found in the document using either N-gram or Trie-based matching approaches.

Features:
- PDF text extraction with PyMuPDF (fitz)
- Two matching algorithms: N-gram and Trie (user selectable)
- Keyword location finding with page and bounding box information
- PDF highlighting with customizable colors
- Efficiency logging for comparison

Usage:
    python pdf_highlighter.py <pdf_path> [--method ngram|trie] [--terms draft.json]
"""

import json
import re
import string
import time
import logging
import argparse
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('PDFHighlighter')

# Try to import PyMuPDF
try:
    import fitz  # PyMuPDF
except ImportError:
    raise ImportError("Please install PyMuPDF: pip install pymupdf")

# Try to import NLTK for lemmatization
try:
    import nltk
    from nltk.stem import WordNetLemmatizer
    
    nltk.download('punkt', quiet=True)
    nltk.download('wordnet', quiet=True)
    nltk.download('punkt_tab', quiet=True)
except ImportError:
    raise ImportError("Please install nltk: pip install nltk")


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class MatchLocation:
    """Represents a found keyword location in the PDF."""
    page_num: int
    matched_text: str
    term_name: str
    url: str
    short_definition: str
    rect: Optional[fitz.Rect] = None  # Bounding box in PDF coordinates


# ============================================================================
# TRIE DATA STRUCTURE
# ============================================================================

class TrieNode:
    """A node in the Trie data structure."""
    
    def __init__(self):
        self.children: Dict[str, 'TrieNode'] = {}
        self.term_data: Optional[Dict[str, Any]] = None
        self.is_end_of_term: bool = False


class Trie:
    """Trie (prefix tree) for efficient term matching."""
    
    def __init__(self):
        self.root = TrieNode()
        self.num_terms = 0
        self.max_depth = 0
    
    def insert(self, tokens: List[str], term_data: Dict[str, Any]) -> None:
        node = self.root
        for token in tokens:
            if token not in node.children:
                node.children[token] = TrieNode()
            node = node.children[token]
        
        node.is_end_of_term = True
        node.term_data = term_data
        self.num_terms += 1
        self.max_depth = max(self.max_depth, len(tokens))
    
    def search_longest_match(self, tokens: List[str], start_idx: int) -> Optional[Tuple]:
        node = self.root
        longest_match = None
        current_idx = start_idx
        
        while current_idx < len(tokens):
            token = tokens[current_idx]
            if token not in node.children:
                break
            node = node.children[token]
            if node.is_end_of_term:
                longest_match = (node.term_data, current_idx)
            current_idx += 1
        
        return longest_match


# ============================================================================
# BASE TERM MATCHER
# ============================================================================

class BaseTermMatcher:
    """Base class for term matching with common utilities."""
    
    def __init__(self, draft_terms: List[Dict[str, Any]]):
        self.lemmatizer = WordNetLemmatizer()
        self.draft_terms = draft_terms
    
    def _normalize_text(self, text: str) -> str:
        """Normalize text: lowercase and remove punctuation."""
        text = text.lower()
        text = text.translate(str.maketrans(string.punctuation, ' ' * len(string.punctuation)))
        text = ' '.join(text.split())
        return text
    
    def _lemmatize_tokens(self, tokens: List[str]) -> List[str]:
        """Lemmatize a list of tokens."""
        return [self.lemmatizer.lemmatize(token) for token in tokens]
    
    def _normalize_and_lemmatize(self, text: str) -> str:
        """Normalize text and lemmatize tokens."""
        normalized = self._normalize_text(text)
        tokens = normalized.split()
        lemmatized_tokens = self._lemmatize_tokens(tokens)
        return ' '.join(lemmatized_tokens)
    
    def match(self, text: str) -> List[Dict[str, Any]]:
        raise NotImplementedError


# ============================================================================
# N-GRAM TERM MATCHER
# ============================================================================

class NGramTermMatcher(BaseTermMatcher):
    """N-gram based term matcher."""
    
    def __init__(self, draft_terms: List[Dict[str, Any]]):
        super().__init__(draft_terms)
        
        build_start = time.perf_counter()
        
        self.term_index: Dict[str, Dict[str, Any]] = {}
        self.max_ngram_size = 1
        
        for term in draft_terms:
            normalized_name = self._normalize_and_lemmatize(term["name"])
            self.term_index[normalized_name] = term
            token_count = len(normalized_name.split())
            if token_count > self.max_ngram_size:
                self.max_ngram_size = token_count
        
        build_time = (time.perf_counter() - build_start) * 1000
        logger.info(f"[N-GRAM] Index build time: {build_time:.4f} ms")
        logger.info(f"[N-GRAM] Terms indexed: {len(self.term_index)}, Max n-gram: {self.max_ngram_size}")
    
    def _generate_ngrams(self, tokens: List[str], n: int) -> List[Tuple]:
        ngrams = []
        for i in range(len(tokens) - n + 1):
            ngram_tokens = tokens[i:i + n]
            ngram_text = ' '.join(ngram_tokens)
            ngrams.append((ngram_text, i, i + n - 1))
        return ngrams
    
    def match(self, text: str) -> List[Dict[str, Any]]:
        match_start = time.perf_counter()
        
        normalized_text = self._normalize_text(text)
        tokens = normalized_text.split()
        lemmatized_tokens = self._lemmatize_tokens(tokens)
        
        matched_positions = set()
        matches = []
        ngram_iterations = 0
        
        for n in range(self.max_ngram_size, 0, -1):
            ngrams = self._generate_ngrams(lemmatized_tokens, n)
            ngram_iterations += len(ngrams)
            
            for ngram_text, start_idx, end_idx in ngrams:
                positions = set(range(start_idx, end_idx + 1))
                if positions & matched_positions:
                    continue
                
                if ngram_text in self.term_index:
                    term = self.term_index[ngram_text]
                    original_matched_text = ' '.join(tokens[start_idx:end_idx + 1])
                    
                    matches.append({
                        "matched_text": original_matched_text,
                        "term_name": term["name"],
                        "url": term["url"],
                        "short_definition": term["short_definition"],
                        "start_idx": start_idx,
                        "end_idx": end_idx
                    })
                    matched_positions.update(positions)
        
        total_time = (time.perf_counter() - match_start) * 1000
        logger.info(f"[N-GRAM] Match time: {total_time:.4f} ms, N-grams: {ngram_iterations}, Matches: {len(matches)}")
        
        return matches


# ============================================================================
# TRIE TERM MATCHER
# ============================================================================

class TrieTermMatcher(BaseTermMatcher):
    """Trie-based term matcher for efficient matching."""
    
    def __init__(self, draft_terms: List[Dict[str, Any]]):
        super().__init__(draft_terms)
        self.trie = Trie()
        
        build_start = time.perf_counter()
        
        for term in draft_terms:
            normalized_name = self._normalize_and_lemmatize(term["name"])
            tokens = normalized_name.split()
            self.trie.insert(tokens, term)
        
        build_time = (time.perf_counter() - build_start) * 1000
        logger.info(f"[TRIE] Index build time: {build_time:.4f} ms")
        logger.info(f"[TRIE] Terms indexed: {self.trie.num_terms}, Max depth: {self.trie.max_depth}")
    
    def match(self, text: str) -> List[Dict[str, Any]]:
        match_start = time.perf_counter()
        
        normalized_text = self._normalize_text(text)
        tokens = normalized_text.split()
        lemmatized_tokens = self._lemmatize_tokens(tokens)
        
        matches = []
        i = 0
        iterations = 0
        
        while i < len(lemmatized_tokens):
            iterations += 1
            result = self.trie.search_longest_match(lemmatized_tokens, i)
            
            if result:
                term_data, end_idx = result
                original_matched_text = ' '.join(tokens[i:end_idx + 1])
                
                matches.append({
                    "matched_text": original_matched_text,
                    "term_name": term_data["name"],
                    "url": term_data["url"],
                    "short_definition": term_data["short_definition"],
                    "start_idx": i,
                    "end_idx": end_idx
                })
                i = end_idx + 1
            else:
                i += 1
        
        total_time = (time.perf_counter() - match_start) * 1000
        logger.info(f"[TRIE] Match time: {total_time:.4f} ms, Iterations: {iterations}, Matches: {len(matches)}")
        
        return matches


# ============================================================================
# PDF HIGHLIGHTER
# ============================================================================

class PDFHighlighter:
    """
    PDF Highlighter that finds and highlights terms in PDF documents.
    
    Supports both N-gram and Trie-based matching approaches.
    """
    
    # Highlight colors (RGB normalized to 0-1)
    HIGHLIGHT_COLORS = {
        "yellow": (1, 1, 0),
        "green": (0.5, 1, 0.5),
        "cyan": (0, 1, 1),
        "magenta": (1, 0.5, 1),
        "orange": (1, 0.8, 0.4),
    }
    
    def __init__(self, draft_terms: List[Dict[str, Any]], method: str = "trie"):
        """
        Initialize the PDF Highlighter.
        
        Args:
            draft_terms: List of term dictionaries with 'name', 'url', 'short_definition'
            method: Matching method - 'trie' or 'ngram'
        """
        self.method = method.lower()
        self.draft_terms = draft_terms
        
        if self.method == "trie":
            self.matcher = TrieTermMatcher(draft_terms)
            logger.info("Using TRIE-based matching")
        else:
            self.matcher = NGramTermMatcher(draft_terms)
            logger.info("Using N-GRAM-based matching")
    
    def extract_text_from_pdf(self, pdf_path: str) -> Dict[int, str]:
        """
        Extract text from each page of the PDF.
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            Dictionary mapping page numbers to text content
        """
        doc = fitz.open(pdf_path)
        page_texts = {}
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_texts[page_num] = page.get_text()
        
        doc.close()
        return page_texts
    
    def find_matches_in_pdf(self, pdf_path: str) -> List[MatchLocation]:
        """
        Find all term matches in the PDF.
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            List of MatchLocation objects with page numbers and positions
        """
        logger.info(f"Processing PDF: {pdf_path}")
        
        doc = fitz.open(pdf_path)
        all_matches: List[MatchLocation] = []
        
        total_start = time.perf_counter()
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_text = page.get_text()
            
            # Find matches using the selected method
            matches = self.matcher.match(page_text)
            
            for match in matches:
                # Search for the matched text to get bounding rectangles
                text_instances = page.search_for(match["matched_text"])
                
                if text_instances:
                    for rect in text_instances:
                        all_matches.append(MatchLocation(
                            page_num=page_num,
                            matched_text=match["matched_text"],
                            term_name=match["term_name"],
                            url=match["url"],
                            short_definition=match["short_definition"],
                            rect=rect
                        ))
                else:
                    # Record match even without exact position
                    all_matches.append(MatchLocation(
                        page_num=page_num,
                        matched_text=match["matched_text"],
                        term_name=match["term_name"],
                        url=match["url"],
                        short_definition=match["short_definition"],
                        rect=None
                    ))
        
        total_time = (time.perf_counter() - total_start) * 1000
        logger.info(f"Total PDF processing time: {total_time:.4f} ms")
        logger.info(f"Total matches found: {len(all_matches)}")
        
        doc.close()
        return all_matches
    
    def highlight_pdf(
        self,
        pdf_path: str,
        output_path: Optional[str] = None,
        color: str = "yellow"
    ) -> Tuple[str, List[MatchLocation]]:
        """
        Highlight all matched terms in the PDF and save to a new file.
        
        Args:
            pdf_path: Path to the input PDF file
            output_path: Path for the highlighted PDF (default: adds '_highlighted' suffix)
            color: Highlight color name (yellow, green, cyan, magenta, orange)
            
        Returns:
            Tuple of (output_path, list of all matches)
        """
        if output_path is None:
            path = Path(pdf_path)
            output_path = str(path.parent / f"{path.stem}_highlighted{path.suffix}")
        
        highlight_color = self.HIGHLIGHT_COLORS.get(color, self.HIGHLIGHT_COLORS["yellow"])
        
        logger.info(f"Highlighting PDF: {pdf_path}")
        logger.info(f"Output: {output_path}")
        logger.info(f"Color: {color}")
        
        doc = fitz.open(pdf_path)
        all_matches: List[MatchLocation] = []
        highlights_added = 0
        
        total_start = time.perf_counter()
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_text = page.get_text()
            
            # Find matches
            matches = self.matcher.match(page_text)
            
            for match in matches:
                # Search for the matched text to get bounding rectangles
                text_instances = page.search_for(match["matched_text"])
                
                for rect in text_instances:
                    # Add highlight annotation
                    highlight = page.add_highlight_annot(rect)
                    highlight.set_colors(stroke=highlight_color)
                    highlight.set_info(
                        title=match["term_name"],
                        content=match["short_definition"]
                    )
                    highlight.update()
                    highlights_added += 1
                    
                    all_matches.append(MatchLocation(
                        page_num=page_num,
                        matched_text=match["matched_text"],
                        term_name=match["term_name"],
                        url=match["url"],
                        short_definition=match["short_definition"],
                        rect=rect
                    ))
        
        # Save the highlighted PDF
        doc.save(output_path)
        doc.close()
        
        total_time = (time.perf_counter() - total_start) * 1000
        logger.info(f"Total highlighting time: {total_time:.4f} ms")
        logger.info(f"Highlights added: {highlights_added}")
        logger.info(f"Saved to: {output_path}")
        
        return output_path, all_matches


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def load_draft_json(filepath: str) -> List[Dict[str, Any]]:
    """Load draft terms from a JSON file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


# Sample terms for testing when no JSON file is provided
SAMPLE_DRAFT_TERMS = [
    {
        "name": "Music Information Retrieval",
        "url": "https://en.wikipedia.org/wiki/Music_information_retrieval",
        "short_definition": "An interdisciplinary science of retrieving information from music."
    },
    {
        "name": "Machine Learning",
        "url": "https://en.wikipedia.org/wiki/Machine_learning",
        "short_definition": "A branch of AI that enables systems to learn from experience."
    },
    {
        "name": "Deep Learning",
        "url": "https://en.wikipedia.org/wiki/Deep_learning",
        "short_definition": "Neural networks with multiple layers for complex pattern modeling."
    },
    {
        "name": "Natural Language Processing",
        "url": "https://en.wikipedia.org/wiki/Natural_language_processing",
        "short_definition": "AI focused on interaction between computers and human language."
    },
    {
        "name": "Information Retrieval",
        "url": "https://en.wikipedia.org/wiki/Information_retrieval",
        "short_definition": "Obtaining relevant information system resources."
    },
    {
        "name": "Health Sciences",
        "url": "https://en.wikipedia.org/wiki/Health_sciences",
        "short_definition": "Applied sciences for delivering healthcare."
    },
    {
        "name": "Patient Safety",
        "url": "https://en.wikipedia.org/wiki/Patient_safety",
        "short_definition": "Prevention and reduction of errors in healthcare."
    },
    {
        "name": "Artificial Intelligence",
        "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
        "short_definition": "Intelligence demonstrated by machines."
    },
    {
        "name": "Neural Network",
        "url": "https://en.wikipedia.org/wiki/Neural_network",
        "short_definition": "Computing systems inspired by biological neural networks."
    },
    {
        "name": "Computer Vision",
        "url": "https://en.wikipedia.org/wiki/Computer_vision",
        "short_definition": "Field dealing with how computers gain understanding from images."
    }
]


# ============================================================================
# MAIN - CLI INTERFACE
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="PDF Keyword Highlighter - Find and highlight terms in PDF documents",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python pdf_highlighter.py paper.pdf
  python pdf_highlighter.py paper.pdf --method ngram
  python pdf_highlighter.py paper.pdf --method trie --terms draft.json
  python pdf_highlighter.py paper.pdf --color green --output highlighted_paper.pdf
        """
    )
    
    parser.add_argument("pdf_path", nargs="?", help="Path to the PDF file to process")
    parser.add_argument(
        "--method", "-m",
        choices=["ngram", "trie"],
        default="trie",
        help="Matching method: 'ngram' or 'trie' (default: trie)"
    )
    parser.add_argument(
        "--terms", "-t",
        default="draft_concepts_v1_lv0123.json",
        help="Path to JSON file with terms (default: draft.json)"
    )
    parser.add_argument(
        "--output", "-o",
        help="Output path for highlighted PDF (default: adds '_highlighted' suffix)"
    )
    parser.add_argument(
        "--color", "-c",
        choices=["yellow", "green", "cyan", "magenta", "orange"],
        default="yellow",
        help="Highlight color (default: yellow)"
    )
    parser.add_argument(
        "--find-only", "-f",
        action="store_true",
        help="Only find matches without creating highlighted PDF"
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run demo mode with sample text (no PDF required)"
    )
    
    args = parser.parse_args()
    
    # Demo mode
    if args.demo:
        print("=" * 70)
        print("PDF HIGHLIGHTER DEMO MODE")
        print("=" * 70)
        
        sample_text = """
        This research paper explores the intersection of music information retrieval and
        machine learning techniques. We apply deep learning models with neural networks
        to improve accuracy in health sciences applications. The system uses natural 
        language processing for text analysis. Artificial intelligence and computer vision
        methods are also discussed.
        """
        
        print(f"\n[Sample Text]")
        print("-" * 70)
        print(sample_text.strip())
        
        print(f"\n[Testing N-GRAM Method]")
        print("-" * 70)
        ngram_matcher = NGramTermMatcher(SAMPLE_DRAFT_TERMS)
        ngram_matches = ngram_matcher.match(sample_text)
        for match in ngram_matches:
            print(f"  Found: '{match['matched_text']}' -> {match['term_name']}")
        
        print(f"\n[Testing TRIE Method]")
        print("-" * 70)
        trie_matcher = TrieTermMatcher(SAMPLE_DRAFT_TERMS)
        trie_matches = trie_matcher.match(sample_text)
        for match in trie_matches:
            print(f"  Found: '{match['matched_text']}' -> {match['term_name']}")
        
        print("\n" + "=" * 70)
        print("To process a PDF, run:")
        print("  python pdf_highlighter.py <your_pdf.pdf> --method trie")
        return
    
    # Check if PDF path is provided
    if not args.pdf_path:
        parser.print_help()
        print("\nError: PDF path is required (or use --demo for demo mode)")
        return
    
    # Check if PDF exists
    if not Path(args.pdf_path).exists():
        print(f"Error: PDF file not found: {args.pdf_path}")
        return
    
    # Load terms
    try:
        draft_terms = load_draft_json(args.terms)
        print(f"[INFO] Loaded {len(draft_terms)} terms from {args.terms}")
    except FileNotFoundError:
        draft_terms = SAMPLE_DRAFT_TERMS
        print(f"[INFO] Terms file not found, using {len(draft_terms)} sample terms")
    
    # Initialize highlighter
    highlighter = PDFHighlighter(draft_terms, method=args.method)
    
    print("\n" + "=" * 70)
    print(f"PROCESSING: {args.pdf_path}")
    print(f"METHOD: {args.method.upper()}")
    print("=" * 70)
    
    if args.find_only:
        # Only find matches
        matches = highlighter.find_matches_in_pdf(args.pdf_path)
        
        print(f"\n[Found {len(matches)} matches]")
        print("-" * 70)
        
        for i, match in enumerate(matches, 1):
            print(f"\n  Match {i}:")
            print(f"    Page: {match.page_num + 1}")
            print(f"    Text: \"{match.matched_text}\"")
            print(f"    Term: {match.term_name}")
            print(f"    URL: {match.url}")
            if match.rect:
                print(f"    Position: ({match.rect.x0:.1f}, {match.rect.y0:.1f})")
    else:
        # Highlight and save
        output_path, matches = highlighter.highlight_pdf(
            args.pdf_path,
            output_path=args.output,
            color=args.color
        )
        
        print(f"\n[Results]")
        print("-" * 70)
        print(f"  Matches found: {len(matches)}")
        print(f"  Output saved to: {output_path}")
        
        # Show unique terms found
        unique_terms = set(m.term_name for m in matches)
        print(f"\n[Unique Terms Highlighted ({len(unique_terms)})]")
        for term in sorted(unique_terms):
            count = sum(1 for m in matches if m.term_name == term)
            print(f"  - {term} ({count} occurrences)")
    
    print("\n" + "=" * 70)
    print("DONE!")
    print("=" * 70)


if __name__ == "__main__":
    main()
