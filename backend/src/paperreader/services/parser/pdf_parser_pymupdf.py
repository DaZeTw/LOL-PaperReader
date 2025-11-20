"""
PDF Parser using PyMuPDF (fitz)

Lightweight PDF parser thay thế docling.
PyMuPDF là một lựa chọn tốt vì:
- Nhẹ hơn nhiều so với docling (không cần torch/Docker image 7GB)
- Nhanh và hiệu quả
- Hỗ trợ text extraction tốt
- Có thể extract images và metadata
"""
import logging
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import threading
import numpy as np

try:
    import fitz  # PyMuPDF
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False
    logging.warning("PyMuPDF not installed. Install with: pip install pymupdf")

_log = logging.getLogger(__name__)
# Ensure parser logs are visible by default (INFO)
if not _log.handlers:
    logging.basicConfig(level=logging.INFO)
_log.setLevel(logging.INFO)

# Cancel flag - will be set from pdf_routes module
_PARSE_CANCEL_FLAG = None  # Will be set to threading.Event from pdf_routes


def set_parse_cancel_flag(cancel_flag):
    """Set the cancel flag from pdf_routes module."""
    global _PARSE_CANCEL_FLAG
    _PARSE_CANCEL_FLAG = cancel_flag


def _check_parse_cancel():
    """Check if cancel flag is set and raise exception if so."""
    if _PARSE_CANCEL_FLAG is not None and _PARSE_CANCEL_FLAG.is_set():
        _log.warning("⚠️ PDF parsing cancelled - cancel flag is set")
        raise RuntimeError("PDF parsing was cancelled - output directory was cleared")


def _simple_kmeans(data: np.ndarray, k: int, max_iters: int = 50) -> Tuple[np.ndarray, np.ndarray]:
    """
    Simple k-means clustering without sklearn.

    Args:
        data: 1D array of values to cluster
        k: Number of clusters
        max_iters: Maximum iterations

    Returns:
        (centroids, labels) - sorted centroids and cluster assignment for each data point
    """
    if len(data) < k:
        # Not enough data points, return data as centroids
        return np.sort(data)[:k], np.arange(len(data))

    # Initialize centroids using quantiles
    percentiles = np.linspace(0, 100, k + 2)[1:-1]
    centroids = np.percentile(data, percentiles)

    for _ in range(max_iters):
        # Assign points to nearest centroid
        distances = np.abs(data[:, np.newaxis] - centroids)
        labels = np.argmin(distances, axis=1)

        # Update centroids
        new_centroids = np.array([data[labels == i].mean() if np.any(labels == i) else centroids[i]
                                   for i in range(k)])

        # Check convergence
        if np.allclose(centroids, new_centroids):
            break

        centroids = new_centroids

    # Sort centroids in ascending order and reassign labels
    sort_idx = np.argsort(centroids)
    centroids = centroids[sort_idx]

    # Remap labels to match sorted centroids
    label_mapping = {old_label: new_label for new_label, old_label in enumerate(sort_idx)}
    labels = np.array([label_mapping[label] for label in labels])

    return centroids, labels


def build_heading_signatures(doc: "fitz.Document") -> Dict[str, Tuple[float, float]]:
    """
    Pass 1: Build heading signatures by clustering font sizes across all pages.

    Returns:
        Dict with keys: level_1_sizes, level_2_sizes, level_3_sizes
        Each value is a tuple (min_size, max_size) for that heading level
    """
    all_font_sizes = []
    all_line_data = []  # Store (font_size, line_text, span_count) for analysis

    # Collect all font sizes from all pages
    for page_num in range(len(doc)):
        page = doc[page_num]
        text_dict = page.get_text("dict")

        for block in text_dict.get("blocks", []):
            if "lines" in block:
                for line in block["lines"]:
                    spans = line.get("spans", [])
                    if not spans:
                        continue

                    # Get average font size for this line
                    line_sizes = [s.get("size", 0) for s in spans if s.get("size", 0) > 0]
                    if line_sizes:
                        avg_line_size = np.mean(line_sizes)
                        line_text = " ".join(s.get("text", "").strip() for s in spans).strip()

                        if line_text and len(line_text) > 2:  # Skip very short lines
                            all_font_sizes.append(avg_line_size)
                            all_line_data.append((avg_line_size, line_text, len(spans)))

    if len(all_font_sizes) < 10:
        # Not enough data, return default signatures
        _log.warning("Not enough text data for heading detection, using defaults")
        return {
            "level_1_sizes": (16.0, 20.0),
            "level_2_sizes": (14.0, 16.0),
            "level_3_sizes": (12.0, 14.0),
            "body_text_size": 11.0
        }

    font_sizes_array = np.array(all_font_sizes)

    # Calculate body text size (median or mode of most common cluster)
    body_text_size = np.median(font_sizes_array)

    # Filter to potential headings (larger than body text + some margin)
    heading_threshold = body_text_size * 1.05
    potential_headings = font_sizes_array[font_sizes_array >= heading_threshold]

    if len(potential_headings) < 3:
        # Very few headings detected, use simple heuristics
        _log.info(f"Few potential headings found ({len(potential_headings)}), using simple thresholds")
        return {
            "level_1_sizes": (body_text_size * 1.3, body_text_size * 2.0),
            "level_2_sizes": (body_text_size * 1.15, body_text_size * 1.3),
            "level_3_sizes": (body_text_size * 1.05, body_text_size * 1.15),
            "body_text_size": float(body_text_size)
        }

    # Cluster potential headings into 3 groups (H1, H2, H3)
    k = min(3, len(np.unique(potential_headings)))
    centroids, labels = _simple_kmeans(potential_headings, k)

    # Build size ranges for each cluster
    signatures = {"body_text_size": float(body_text_size)}

    level_names = ["level_3_sizes", "level_2_sizes", "level_1_sizes"]  # Reversed because centroids are sorted ascending

    for i in range(k):
        cluster_sizes = potential_headings[labels == i]
        if len(cluster_sizes) > 0:
            level_name = level_names[-(i+1)] if i < len(level_names) else f"level_{i}_sizes"
            signatures[level_name] = (float(cluster_sizes.min()), float(cluster_sizes.max()))

    # Ensure all three levels exist
    for level_name in ["level_1_sizes", "level_2_sizes", "level_3_sizes"]:
        if level_name not in signatures:
            # Fill missing levels with reasonable defaults
            if level_name == "level_1_sizes":
                signatures[level_name] = (body_text_size * 1.4, body_text_size * 2.0)
            elif level_name == "level_2_sizes":
                signatures[level_name] = (body_text_size * 1.2, body_text_size * 1.4)
            else:
                signatures[level_name] = (body_text_size * 1.05, body_text_size * 1.2)

    _log.info(f"Built heading signatures: {signatures}")
    return signatures


def is_heading_v2(
    line_text: str,
    spans: List[Dict],
    block: Dict,
    page: "fitz.Page",
    signatures: Dict[str, Tuple[float, float]],
    common_sections: set
) -> Tuple[bool, int]:
    """
    Pass 2: Detect if a line is a heading using signatures + layout heuristics.

    Returns:
        (is_heading: bool, heading_level: int) where level is 1-3
    """
    if not line_text.strip() or not spans:
        return False, 0

    # Calculate average font size for this line
    line_sizes = [s.get("size", 0) for s in spans if s.get("size", 0) > 0]
    if not line_sizes:
        return False, 0

    avg_font_size = np.mean(line_sizes)
    body_text_size = signatures.get("body_text_size", 11.0)

    # Determine which cluster this font size belongs to
    heading_level = 0
    size_match_score = 0

    for level, (min_size, max_size) in [
        (1, signatures.get("level_1_sizes", (16, 20))),
        (2, signatures.get("level_2_sizes", (14, 16))),
        (3, signatures.get("level_3_sizes", (12, 14)))
    ]:
        if min_size <= avg_font_size <= max_size:
            heading_level = level
            size_match_score = 3
            break

    # If no exact match, check if significantly larger than body text
    if heading_level == 0 and avg_font_size > body_text_size * 1.1:
        heading_level = 3  # Default to H3
        size_match_score = 1

    if heading_level == 0:
        return False, 0  # Not in any heading size range

    # Apply layout heuristics
    score = size_match_score

    # 1. Short text (headings are typically concise)
    text_len = len(line_text.strip())
    if text_len < 60:
        score += 2
    elif text_len < 100:
        score += 1
    elif text_len > 200:
        score -= 2

    # 2. Few spans (headings usually uniform formatting)
    if len(spans) <= 2:
        score += 1

    # 3. Font style (bold)
    font_name = spans[0].get("font", "").lower()
    if "bold" in font_name:
        score += 2

    # 4. Block height (headings often have more vertical space)
    block_bbox = block.get("bbox", (0, 0, 0, 0))
    block_height = block_bbox[3] - block_bbox[1]
    if block_height > avg_font_size * 1.5:
        score += 1

    # 5. Left alignment (small indentation)
    page_width = page.rect.width
    left_margin = block_bbox[0]
    if left_margin < page_width * 0.2:  # Left 20% of page
        score += 1

    # 6. No trailing period
    if not line_text.strip().endswith('.'):
        score += 1

    # 7. No colon at end (reduces false positives from figure captions)
    if line_text.strip().endswith(':'):
        score -= 2

    # 8. ALL CAPS bonus
    text_stripped = line_text.strip()
    if text_stripped.isupper() and len(text_stripped) > 3:
        score += 2

    # 9. Common academic section names
    text_lower = line_text.lower().strip()
    if any(text_lower.startswith(section) for section in common_sections):
        score += 4

    # 10. Numbered sections (1., 1.1, I., A., etc.)
    if re.match(r'^(\d+\.)+\s', line_text) or re.match(r'^[IVX]+\.\s', line_text) or re.match(r'^[A-Z]\.\s', line_text):
        score += 2

    # Decision threshold
    is_heading = score >= 3

    return is_heading, heading_level if is_heading else 0


def parse_pdf_with_pymupdf(input_pdf_path: Path, output_dir: Path) -> Dict[str, Any]:
    """
    Parse PDF sử dụng PyMuPDF và output markdown format tương thích với loader.

    Args:
        input_pdf_path: Đường dẫn đến file PDF
        output_dir: Thư mục output để lưu kết quả

    Returns:
        Dict chứa outputs với format tương thích với code cũ:
        {
            "markdown_embedded": str,  # Path to markdown file
            "page_images": List[str],   # Paths to page images (optional)
            "figures": List[str],       # Paths to extracted figures (optional)
        }
    """
    if not HAS_PYMUPDF:
        raise RuntimeError(
            "PyMuPDF not installed. Install with: pip install pymupdf"
        )

    # Check cancel flag before starting
    _check_parse_cancel()

    output_dir.mkdir(parents=True, exist_ok=True)
    pdf_stem = input_pdf_path.stem

    _log.info(f"Parsing PDF {input_pdf_path.name} với PyMuPDF...")

    # Check cancel flag before opening PDF
    _check_parse_cancel()

    # Mở PDF
    doc = fitz.open(input_pdf_path)

    outputs = {
        "page_images": [],
        "figures": [],
        "tables_csv": [],
        "tables_html": [],
        "markdown_embedded": None,
        "markdown_referenced": None,
        "html": None,
    }

    # Pass 1: Build heading signatures from all pages
    _log.info("Pass 1: Building heading signatures from document font sizes...")
    heading_signatures = build_heading_signatures(doc)

    # Common academic section names (lowercase for case-insensitive matching)
    common_sections = {
        'abstract', 'introduction', 'background', 'related work', 'methodology',
        'methods', 'approach', 'implementation', 'results', 'experiments',
        'evaluation', 'discussion', 'conclusion', 'conclusions', 'future work',
        'acknowledgments', 'acknowledgements', 'references', 'bibliography',
        'appendix', 'preliminaries', 'overview', 'summary', 'contributions',
        'problem statement', 'motivation', 'limitations', 'findings'
    }

    # Extract text và structure từ mỗi page
    markdown_lines = []
    page_count = len(doc)

    _log.info(f"Pass 2: Processing {page_count} pages with heading detection...")

    for page_num in range(page_count):
        # Check cancel flag before processing each page
        _check_parse_cancel()
        page = doc[page_num]

        # Extract text với layout preservation
        text_dict = page.get_text("dict")

        # Tạo markdown cho page này
        # Sử dụng format "## Page X" để loader có thể tách sections
        page_lines = [f"## Page {page_num + 1}\n"]

        # Extract text từ blocks, preserve structure
        for block in text_dict.get("blocks", []):
            if "lines" in block:  # Text block
                block_text = []

                # Collect text từ tất cả lines trong block
                for line in block["lines"]:
                    line_text = " ".join(
                        span["text"].strip()
                        for span in line.get("spans", [])
                        if span.get("text", "").strip()
                    )
                    if line_text.strip():
                        # Use 2-pass heading detection
                        spans = line.get("spans", [])
                        is_heading, heading_level = is_heading_v2(
                            line_text,
                            spans,
                            block,
                            page,
                            heading_signatures,
                            common_sections
                        )

                        if is_heading:
                            # Use detected heading level
                            heading_marker = '#' * heading_level
                            block_text.append(f"{heading_marker} {line_text}")
                        else:
                            block_text.append(line_text)

                if block_text:
                    page_lines.append("\n".join(block_text))
                    page_lines.append("")  # Empty line between blocks

            # Extract images nếu có
            if "image" in block:
                try:
                    img_index = len(outputs["figures"])
                    img = block.get("image", {})
                    # PyMuPDF images are in block data, extract if needed
                    # For now, just note it exists
                    _log.debug(f"Found image in page {page_num + 1}, block")
                except Exception:
                    pass

        markdown_lines.extend(page_lines)

        # SKIP page image extraction - not used in pipeline, only slows down parsing
        # page_images are for preview/debug only and are skipped in pdf_routes.py anyway
        # If needed for debugging, can be enabled with an environment variable
        # For now, skip to speed up parsing significantly (saves ~1-2s per page)

    doc.close()
    
    # Check cancel flag before saving markdown
    _check_parse_cancel()
    
    # Lưu markdown file
    md_embed = output_dir / f"{pdf_stem}-embedded.md"
    markdown_content = "\n".join(markdown_lines)
    
    # Clean up markdown
    markdown_content = _clean_markdown(markdown_content)
    
    # Final cancel check before writing file
    _check_parse_cancel()
    
    # Save markdown file (for backward compatibility, but also return content)
    with open(md_embed, "w", encoding="utf-8") as f:
        f.write(markdown_content)
    
    outputs["markdown_embedded"] = str(md_embed)
    outputs["markdown_referenced"] = str(md_embed)  # Same file for now
    # Add markdown content directly to output (no need to read file later)
    outputs["markdown_content"] = markdown_content
    
    _log.info(f"Đã parse PDF thành công. Output: {md_embed}")
    
    return outputs


def _clean_markdown(text: str) -> str:
    """Clean và format markdown text"""
    # Remove excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Remove leading/trailing whitespace from lines
    lines = [line.rstrip() for line in text.split('\n')]
    
    # Join và return
    return '\n'.join(lines)


# Alias để tương thích với code cũ
def parse_pdf_with_docling(input_pdf_path: Path, output_dir: Path) -> dict:
    """
    Wrapper function tương thích với code cũ.
    Gọi parse_pdf_with_pymupdf thay vì docling.
    """
    return parse_pdf_with_pymupdf(input_pdf_path, output_dir)

