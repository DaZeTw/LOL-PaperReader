"""
PDF Bounding Box Finder
Finds bounding boxes for text chunks in PDF pages using fuzzy matching.
Based on pdf-find-bbox.ipynb algorithm.
"""

import fitz  # PyMuPDF
import re
import unicodedata
from typing import List, Dict, Optional, Tuple
from pathlib import Path
from difflib import SequenceMatcher


# ============================ #
#     TEXT NORMALIZATION       #
# ============================ #

def fold_math_and_greek(text: str) -> str:
    """Convert Greek letters and math Unicode to ASCII semantic names."""
    out = []
    for ch in text:
        try:
            name = unicodedata.name(ch)
        except ValueError:
            continue

        # Greek letters (all variants)
        if "GREEK" in name:
            base = name.split("LETTER")[-1].strip().lower()
            out.append(base)
            continue

        # Mathematical alphanumeric symbols
        if "MATHEMATICAL" in name:
            parts = name.split()
            base = parts[-1].lower()
            out.append(base)
            continue

        # All other characters: keep raw
        out.append(ch)

    return "".join(out)


def normalize(text: str) -> str:
    """Normalize text for fuzzy matching."""
    if not text:
        return ""

    # Fold Greek & Math Unicode to ASCII words
    text = fold_math_and_greek(text)

    # Lowercase
    text = text.lower()

    # Remove stray symbols except basic punctuation
    text = re.sub(r"[^a-z0-9\s.,;:()\[\]{}+\-=/]", " ", text)

    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()

    return text


def fuzzy(a: str, b: str) -> float:
    """Calculate fuzzy match ratio between two strings."""
    return SequenceMatcher(None, a, b).ratio()


def match_percentage(combined: str, chunk: str) -> float:
    """Percentage of chunk that appears in combined."""
    if not chunk or not combined:
        return 0.0

    matcher = SequenceMatcher(None, chunk, combined)
    matched = sum(block.size for block in matcher.get_matching_blocks())
    pct = (matched / len(chunk)) * 100
    return round(pct, 2)


# ============================ #
#       SPAN EXTRACTION        #
# ============================ #

def extract_spans(page: fitz.Page) -> List[Dict]:
    """Extract text spans from a PDF page."""
    dict_data = page.get_text("dict")
    spans = []

    for block in dict_data.get("blocks", []):
        if block["type"] != 0:
            continue  # only text blocks

        for line in block.get("lines", []):
            for span in line.get("spans", []):
                spans.append({
                    "text": span["text"],
                    "bbox": span["bbox"],
                    "line_bbox": line["bbox"],
                    "font": span.get("font"),
                    "size": span.get("size"),
                })

    return spans


# ============================ #
#      SEED-BASED MATCHING     #
# ============================ #

def get_seed(chunk_text: str, lengths: List[int] = [10, 5, 2]) -> List[str]:
    """Generate search seeds from chunk text."""
    words = normalize(chunk_text).split()
    return ["".join(words[:l]) for l in lengths if len(words) >= l]


def find_candidate_spans(
    spans: List[Dict],
    seeds: List[str],
    seed_threshold: float = 0.40
) -> List[int]:
    """Find candidate span indices that match seeds."""
    matched_indices = set()
    for seed in seeds:
        for idx, sp in enumerate(spans):
            score = fuzzy(normalize(sp["text"]), seed)
            if score >= seed_threshold:
                matched_indices.add(idx)

    return list(matched_indices)


def expand_best_span_match(
    spans: List[Dict],
    chunk_text: str,
    candidate_indices: List[int],
    window: int = 100
) -> Tuple[Optional[Tuple[int, int]], float]:
    """Expand candidate spans to find best matching range."""
    normalized_chunk = normalize(chunk_text)
    best_score = 0
    best_range = None

    for start in candidate_indices:
        combined = ""
        for j in range(start, min(start + window, len(spans))):
            combined += spans[j]["text"]
            score = match_percentage(normalize(combined), normalized_chunk)

            if score > best_score:
                best_score = score
                best_range = (start, j)

    return best_range, best_score


def find_best_span_match(
    spans: List[Dict],
    chunk_text: str,
    threshold: float = 0.75
) -> Tuple[Optional[Tuple[int, int]], float]:
    """Find best matching span range for given chunk text."""
    seeds = get_seed(chunk_text)
    candidates = find_candidate_spans(spans, seeds)

    if not candidates:
        return None, 0

    best_range, best_score = expand_best_span_match(
        spans, chunk_text, candidates, window=100
    )

    if best_score >= threshold:
        return best_range, best_score

    return None, best_score


# ============================ #
#      BBOX GENERATION         #
# ============================ #

def merge_spans_into_line_bboxes(
    spans: List[Dict],
    span_range: Tuple[int, int]
) -> List[Dict]:
    """Merge spans into line-level bounding boxes."""
    start, end = span_range
    selected = spans[start:end + 1]

    line_map = {}
    for sp in selected:
        lx0, ly0, lx1, ly1 = sp["line_bbox"]
        key = (ly0, ly1)

        if key not in line_map:
            line_map[key] = [lx0, ly0, lx1, ly1]
        else:
            line_map[key][0] = min(line_map[key][0], lx0)
            line_map[key][2] = max(line_map[key][2], lx1)

    # Convert to list and sort by vertical position
    bboxes = [
        {"x0": v[0], "y0": v[1], "x1": v[2], "y1": v[3]}
        for v in line_map.values()
    ]
    bboxes.sort(key=lambda b: b["y0"])

    return bboxes


def normalize_bboxes(
    bboxes: List[Dict],
    page_width: float,
    page_height: float
) -> List[Dict]:
    """Normalize bounding boxes to 0-1 range."""
    normalized = []
    for box in bboxes:
        norm_box = {
            "x0": box["x0"] / page_width,
            "y0": box["y0"] / page_height,
            "x1": box["x1"] / page_width,
            "y1": box["y1"] / page_height,
        }
        normalized.append(norm_box)
    return normalized


# ============================ #
#      MAIN API FUNCTION       #
# ============================ #

def find_text_bboxes(
    pdf_path: str,
    page_number: int,
    chunk_text: str,
    threshold: float = 0.75
) -> Dict:
    """
    Find bounding boxes for a text chunk in a PDF page.

    Args:
        pdf_path: Path to PDF file
        page_number: Page number (1-indexed)
        chunk_text: Text to find
        threshold: Minimum match score (0-1)

    Returns:
        Dict with keys:
            - found: bool
            - score: float
            - bboxes: List[Dict] (normalized x0, y0, x1, y1)
    """
    try:
        doc = fitz.open(pdf_path)
        page = doc[page_number - 1]  # Convert to 0-indexed

        spans = extract_spans(page)
        span_range, score = find_best_span_match(spans, chunk_text, threshold)

        if not span_range:
            doc.close()
            return {"found": False, "score": score, "bboxes": []}

        bboxes = merge_spans_into_line_bboxes(spans, span_range)
        page_width, page_height = page.rect.width, page.rect.height
        normalized_bboxes = normalize_bboxes(bboxes, page_width, page_height)

        doc.close()
        return {"found": True, "score": score, "bboxes": normalized_bboxes}

    except Exception as e:
        print(f"[ERROR] bbox_finder: {e}")
        return {"found": False, "score": 0, "bboxes": [], "error": str(e)}


def find_text_bboxes_batch(
    pdf_path: str,
    requests: List[Dict[str, any]]
) -> List[Dict]:
    """
    Find bounding boxes for multiple text chunks efficiently.

    Args:
        pdf_path: Path to PDF file
        requests: List of dicts with keys: page_number, chunk_text, threshold (optional)

    Returns:
        List of bbox results matching input order
    """
    try:
        doc = fitz.open(pdf_path)
        results = []

        # Group requests by page for efficiency
        page_groups = {}
        for i, req in enumerate(requests):
            page_num = req["page_number"]
            if page_num not in page_groups:
                page_groups[page_num] = []
            page_groups[page_num].append((i, req))

        # Process each page once
        page_results = {}
        for page_num, page_requests in page_groups.items():
            try:
                page = doc[page_num - 1]
                spans = extract_spans(page)
                page_width, page_height = page.rect.width, page.rect.height

                for orig_idx, req in page_requests:
                    chunk_text = req["chunk_text"]
                    threshold = req.get("threshold", 0.75)

                    span_range, score = find_best_span_match(spans, chunk_text, threshold)

                    if not span_range:
                        page_results[orig_idx] = {
                            "found": False, "score": score, "bboxes": []
                        }
                    else:
                        bboxes = merge_spans_into_line_bboxes(spans, span_range)
                        normalized_bboxes = normalize_bboxes(bboxes, page_width, page_height)
                        page_results[orig_idx] = {
                            "found": True, "score": score, "bboxes": normalized_bboxes
                        }
            except Exception as e:
                print(f"[ERROR] bbox_finder page {page_num}: {e}")
                for orig_idx, _ in page_requests:
                    page_results[orig_idx] = {
                        "found": False, "score": 0, "bboxes": [], "error": str(e)
                    }

        # Reconstruct results in original order
        results = [page_results[i] for i in range(len(requests))]
        doc.close()
        return results

    except Exception as e:
        print(f"[ERROR] bbox_finder batch: {e}")
        return [{"found": False, "score": 0, "bboxes": [], "error": str(e)}
                for _ in requests]
