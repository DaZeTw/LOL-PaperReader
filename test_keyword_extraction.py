#!/usr/bin/env python3
"""
PDF Keyword Extractor Test Script

Extracts keywords from a PDF using KeyBERT.
Can run standalone (without backend server) or via API.

Usage:
    python test_keyword_extraction.py <pdf_path> [--api]
    
Examples:
    # Direct extraction (no server needed)
    python test_keyword_extraction.py paper.pdf
    
    # Via API (requires backend running)
    python test_keyword_extraction.py paper.pdf --api
"""

import argparse
import json
import sys
from pathlib import Path

# Add backend to path for direct imports
sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))


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


def extract_keywords_direct(text: str, top_n: int = 20) -> list:
    """Extract keywords directly using KeyBERT (no API)."""
    try:
        from paperreader.services.keywords.keybert_extractor import AcademicKeywordExtractor
        from paperreader.services.keywords.concept_refiner import ConceptRefiner
    except ImportError:
        # Fallback to using KeyBERT directly
        try:
            from keybert import KeyBERT
        except ImportError:
            print("Error: KeyBERT not installed. Run: pip install keybert")
            sys.exit(1)
        
        print("Using KeyBERT directly (service not available)...")
        kw_model = KeyBERT()
        keywords = kw_model.extract_keywords(
            text,
            keyphrase_ngram_range=(2, 5),
            stop_words='english',
            use_mmr=True,
            diversity=0.7,
            top_n=top_n
        )
        return [{"keyword": kw, "score": float(score)} for kw, score in keywords]
    
    print("Using AcademicKeywordExtractor...")
    
    # Use the full extraction pipeline
    extractor = AcademicKeywordExtractor()
    raw_keywords = extractor.extract_with_frequency(
        text=text,
        top_n=top_n * 2,
        use_mmr=True,
        diversity=0.7
    )
    
    # Load ontology for refinement
    ontology_path = Path(__file__).parent / "public" / "draft_concepts_v1_lv0123.json"
    ontology = {}
    if ontology_path.exists():
        with open(ontology_path, 'r') as f:
            terms = json.load(f)
            ontology = {term['name'].lower(): term for term in terms}
        print(f"Loaded {len(ontology)} ontology terms")
    
    # Refine
    refiner = ConceptRefiner(ontology)
    refined = refiner.refine(raw_keywords, max_concepts=top_n)
    
    return [concept.to_dict() for concept in refined]


def extract_keywords_api(text: str, top_n: int = 20, api_url: str = "http://localhost:8080") -> list:
    """Extract keywords via the backend API."""
    try:
        import requests
    except ImportError:
        print("Error: requests not installed. Run: pip install requests")
        sys.exit(1)
    
    response = requests.post(
        f"{api_url}/api/keywords/extract",
        json={
            "text": text,
            "top_n": top_n,
            "use_mmr": True,
            "diversity": 0.7,
            "exclude_generic": True
        },
        timeout=60
    )
    
    if response.status_code != 200:
        print(f"API Error: {response.status_code} - {response.text}")
        sys.exit(1)
    
    data = response.json()
    return data.get("keywords", [])


def main():
    parser = argparse.ArgumentParser(
        description="Extract keywords from a PDF using KeyBERT",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("pdf_path", help="Path to the PDF file")
    parser.add_argument("--api", action="store_true", help="Use API instead of direct extraction")
    parser.add_argument("--api-url", default="http://localhost:8080", help="Backend API URL")
    parser.add_argument("-n", "--top-n", type=int, default=20, help="Number of keywords to extract")
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
    
    # Extract text from PDF
    print("Extracting text from PDF...")
    text = extract_text_from_pdf(str(pdf_path))
    print(f"Extracted {len(text)} characters from {text.count(chr(12)) + 1} pages")
    
    if args.verbose:
        print(f"\nFirst 500 chars:\n{text[:500]}...\n")
    
    # Extract keywords
    print(f"\nExtracting top {args.top_n} keywords...")
    
    if args.api:
        print(f"Using API: {args.api_url}")
        keywords = extract_keywords_api(text, args.top_n, args.api_url)
    else:
        keywords = extract_keywords_direct(text, args.top_n)
    
    print("-" * 50)
    print(f"✅ Found {len(keywords)} keywords:\n")
    
    # Display results
    for i, kw in enumerate(keywords, 1):
        if isinstance(kw, dict):
            name = kw.get("concept", kw.get("keyword", ""))
            score = kw.get("score", 0)
            aligned = kw.get("is_ontology_aligned", False)
            category = kw.get("category", "")
            
            aligned_marker = "📚" if aligned else "  "
            category_str = f" [{category}]" if category else ""
            
            print(f"  {i:2}. {aligned_marker} {name} ({score:.3f}){category_str}")
        else:
            print(f"  {i:2}. {kw}")
    
    # Save to file if requested
    if args.output:
        output_path = Path(args.output)
        with open(output_path, 'w') as f:
            json.dump({
                "pdf": str(pdf_path),
                "keywords": keywords,
                "count": len(keywords)
            }, f, indent=2)
        print(f"\n💾 Saved to: {output_path}")
    
    return keywords


if __name__ == "__main__":
    main()
