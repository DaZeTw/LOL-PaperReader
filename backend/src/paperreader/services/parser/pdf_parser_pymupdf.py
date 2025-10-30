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
from typing import Dict, Any, List, Optional

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
    
    output_dir.mkdir(parents=True, exist_ok=True)
    pdf_stem = input_pdf_path.stem
    
    _log.info(f"Parsing PDF {input_pdf_path.name} với PyMuPDF...")
    
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
    
    # Extract text và structure từ mỗi page
    markdown_lines = []
    page_count = len(doc)
    
    for page_num in range(page_count):
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
                        # Detect potential headings (bold, large font, or all caps)
                        spans = line.get("spans", [])
                        if spans:
                            first_span = spans[0]
                            font_size = first_span.get("size", 0)
                            is_bold = "bold" in first_span.get("font", "").lower()
                            is_large = font_size > 12  # Larger than normal text
                            is_short = len(line_text) < 100
                            
                            # If looks like heading, make it a subheading
                            if (is_bold or is_large) and is_short and line_text:
                                block_text.append(f"### {line_text}")
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
        
        # Extract page as image (optional)
        try:
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better quality
            img_path = output_dir / f"{pdf_stem}-page-{page_num + 1}.png"
            pix.save(img_path)
            outputs["page_images"].append(str(img_path))
        except Exception as e:
            _log.warning(f"Failed to extract page {page_num + 1} image: {e}")
    
    doc.close()
    
    # Lưu markdown file
    md_embed = output_dir / f"{pdf_stem}-embedded.md"
    markdown_content = "\n".join(markdown_lines)
    
    # Clean up markdown
    markdown_content = _clean_markdown(markdown_content)
    
    with open(md_embed, "w", encoding="utf-8") as f:
        f.write(markdown_content)
    
    outputs["markdown_embedded"] = str(md_embed)
    outputs["markdown_referenced"] = str(md_embed)  # Same file for now
    
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

