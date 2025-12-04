"""
PDF Parser using PyMuPDF (fitz)

Lightweight PDF parser thay thế docling.
PyMuPDF là một lựa chọn tốt vì:
- Nhẹ hơn nhiều so với docling (không cần torch/Docker image 7GB)
- Nhanh và hiệu quả
- Hỗ trợ text extraction tốt
- Có thể extract images và metadata
"""

import json
import logging
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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


def _extract_text_elements(page: "fitz.Page", page_index: int) -> List[Dict[str, Any]]:
    text_elements: List[Dict[str, Any]] = []
    try:
        layout = page.get_text("dict", flags=fitz.TEXTFLAGS_DICT)
    except Exception as exc:
        _log.warning(
            f"[PDF] ⚠️ Failed to extract text layout for page {page_index + 1}: {exc}"
        )
        return text_elements

    for block_idx, block in enumerate(layout.get("blocks", [])):
        if "lines" not in block:
            continue

        block_bbox = block.get("bbox", [0, 0, 0, 0])
        x0, y0, x1, y1 = block_bbox
        block_lines: List[str] = []
        is_bold_detected = False

        for line in block.get("lines", []):
            for span in line.get("spans", []):
                raw_text = span.get("text", "")
                if not raw_text or not raw_text.strip():
                    continue
                block_lines.append(raw_text.strip())
                if span.get("flags", 0) & (2**4):
                    is_bold_detected = True

        if not block_lines:
            continue

        full_text = " ".join(block_lines)
        text_type = (
            "heading" if is_bold_detected and len(full_text) < 100 else "paragraph"
        )

        text_elements.append(
            {
                "page": page_index + 1,
                "block_id": block_idx,
                "type": "text",
                "text_type": text_type,
                "content": full_text,
                "bbox": block_bbox,
                "position": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0},
                "is_bold": is_bold_detected,
            }
        )

    return text_elements


def _extract_image_elements(
    page: "fitz.Page",
    page_index: int,
    images_dir: Path,
    pdf_stem: str,
    doc: "fitz.Document",
) -> Tuple[List[Dict[str, Any]], int]:
    image_elements: List[Dict[str, Any]] = []
    images_saved = 0
    images_dir.mkdir(parents=True, exist_ok=True)

    image_list = []
    try:
        image_list = page.get_images(full=True)
    except Exception as exc:
        _log.warning(
            f"[PDF] ⚠️ Failed to enumerate embedded images on page {page_index + 1}: {exc}"
        )

    image_counter = 1
    for img_index, img in enumerate(image_list):
        try:
            xref = img[0]
            extracted = doc.extract_image(xref)
            img_bytes = extracted.get("image")
            img_ext = extracted.get("ext", "png")
            if not img_bytes:
                continue

            image_filename = (
                f"{pdf_stem}-p{page_index + 1}-img{image_counter:03d}.{img_ext}"
            )
            image_path = images_dir / image_filename
            with open(image_path, "wb") as fh:
                fh.write(img_bytes)

            bbox = list(img[1:5]) if len(img) >= 5 else [0, 0, 0, 0]
            x0, y0, x1, y1 = bbox

            image_elements.append(
                {
                    "page": page_index + 1,
                    "image_id": f"p{page_index + 1}_img{image_counter:03d}",
                    "type": "image",
                    "filename": image_filename,
                    "relative_path": f"images/{image_filename}",
                    "local_path": str(image_path),
                    "bbox": bbox,
                    "position": {"x": x0, "y": y0},
                    "source": "embedded",
                }
            )
            images_saved += 1
            image_counter += 1
        except Exception as exc:
            _log.warning(
                f"[PDF] ⚠️ Error extracting embedded image {img_index} on page {page_index + 1}: {exc}"
            )

    # Attempt to capture vector drawings as images as well
    try:
        drawings = page.get_drawings()
    except Exception as exc:
        _log.debug(f"[PDF] Skipping vector drawings on page {page_index + 1}: {exc}")
        drawings = []

    if drawings:
        groups: List[Dict[str, Any]] = []
        for path in drawings:
            rect = path.get("rect", fitz.Rect(0, 0, 0, 0))
            if rect.width <= 0 or rect.height <= 0:
                continue
            merged = False
            for group in groups:
                expanded = group["rect"] + (-30, -30, 30, 30)
                if rect.intersects(expanded):
                    group["rect"] = group["rect"] | rect
                    group["paths"].append(path)
                    merged = True
                    break
            if not merged:
                groups.append({"rect": rect, "paths": [path]})

        for group in groups:
            rect: fitz.Rect = group["rect"]
            if (
                rect.width <= 50
                or rect.height <= 50
                or rect.width >= page.rect.width * 0.95
                or rect.height >= page.rect.height * 0.95
                or len(group["paths"]) <= 2
            ):
                continue

            clip_rect = (rect + (-10, -10, 10, 10)) & page.rect
            if clip_rect.width <= 30 or clip_rect.height <= 30:
                continue

            figure_filename = f"{pdf_stem}-p{page_index + 1}-img{image_counter:03d}.png"
            figure_path = images_dir / figure_filename
            try:
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip_rect)
                pix.save(str(figure_path))
                image_elements.append(
                    {
                        "page": page_index + 1,
                        "image_id": f"p{page_index + 1}_img{image_counter:03d}",
                        "type": "image",
                        "filename": figure_filename,
                        "relative_path": f"images/{figure_filename}",
                        "local_path": str(figure_path),
                        "bbox": [rect.x0, rect.y0, rect.x1, rect.y1],
                        "position": {"x": rect.x0, "y": rect.y0},
                        "source": "vector",
                    }
                )
                images_saved += 1
                image_counter += 1
            except Exception as exc:
                _log.debug(
                    f"[PDF] ⚠️ Failed to rasterize vector figure on page {page_index + 1}: {exc}"
                )

    return image_elements, images_saved


def _extract_table_elements(
    page: "fitz.Page", page_index: int, tables_dir: Path, pdf_stem: str
) -> Tuple[List[Dict[str, Any]], int]:
    table_elements: List[Dict[str, Any]] = []
    tables_dir.mkdir(parents=True, exist_ok=True)
    tables_saved = 0

    try:
        tables = page.find_tables()
    except Exception as exc:
        _log.warning(f"[PDF] ⚠️ Table detection failed on page {page_index + 1}: {exc}")
        return table_elements, tables_saved

    for table_idx, table in enumerate(tables):
        try:
            df = table.to_pandas()
        except Exception as exc:
            _log.debug(
                f"[PDF] ⚠️ Failed to convert table {table_idx} on page {page_index + 1}: {exc}"
            )
            continue
        if df.empty:
            continue

        table_id = f"table_{table_idx + 1}"
        csv_filename = f"{pdf_stem}-p{page_index + 1}-{table_id}.csv"
        csv_path = tables_dir / csv_filename
        try:
            df.to_csv(csv_path, index=False)
        except Exception as exc:
            _log.warning(
                f"[PDF] ⚠️ Failed to save CSV for table {table_idx} on page {page_index + 1}: {exc}"
            )
            continue

        table_text = df.to_string(index=False)
        bbox = list(table.bbox) if table.bbox else [0, 0, 0, 0]
        x0, y0, x1, y1 = bbox

        table_elements.append(
            {
                "page": page_index + 1,
                "table_id": table_id,
                "type": "table",
                "filename": csv_filename,
                "relative_path": f"tables/{csv_filename}",
                "local_path": str(csv_path),
                "bbox": bbox,
                "position": {"x": x0, "y": y0},
                "preview": (
                    (table_text[:300] + "...") if len(table_text) > 300 else table_text
                ),
            }
        )
        tables_saved += 1

    return table_elements, tables_saved


def _clean_text_blocks_in_figures_tables(
    text_elements, image_elements, table_elements, overlap_threshold=0.8
):
    """Clean text blocks that significantly overlap with figure or table regions"""

    def get_overlap_ratio(text_bbox, other_bbox):
        """Calculate overlap ratio between two bounding boxes"""
        text_rect = fitz.Rect(text_bbox)
        other_rect = fitz.Rect(other_bbox)

        if not text_rect.intersects(other_rect):
            return 0.0

        overlap_rect = text_rect & other_rect  # Intersection
        overlap_area = overlap_rect.get_area()
        text_area = text_rect.get_area()

        if text_area == 0:
            return 0.0

        return overlap_area / text_area

    cleaned_text_elements = []
    removed_count = 0

    for text_element in text_elements:
        text_bbox = text_element["bbox"]
        page_num = text_element["page"]
        should_keep = True

        # Check overlap with images on the same page
        for image_element in image_elements:
            if image_element["page"] == page_num:
                image_bbox = image_element["bbox"]
                overlap_ratio = get_overlap_ratio(text_bbox, image_bbox)

                if overlap_ratio > overlap_threshold:
                    print(
                        f"[REMOVE] Text block {text_element['block_id']} on page {page_num}: {overlap_ratio:.2f} overlap with image {image_element['image_id']}"
                    )
                    should_keep = False
                    break

        # Check overlap with tables on the same page (if text wasn't already removed)
        if should_keep:
            for table_element in table_elements:
                if table_element["page"] == page_num:
                    table_bbox = table_element["bbox"]
                    overlap_ratio = get_overlap_ratio(text_bbox, table_bbox)

                    if overlap_ratio > overlap_threshold:
                        should_keep = False
                        break

        if should_keep:
            cleaned_text_elements.append(text_element)
        else:
            removed_count += 1

    return cleaned_text_elements


def _clean_overlapping_images(image_elements, overlap_threshold=0.3):
    """Clean overlapping images, keeping the largest one"""

    def get_overlap_ratio(bbox1, bbox2):
        """Calculate overlap ratio between two bounding boxes"""
        rect1 = fitz.Rect(bbox1)
        rect2 = fitz.Rect(bbox2)

        if not rect1.intersects(rect2):
            return 0.0

        overlap_rect = rect1 & rect2
        overlap_area = overlap_rect.get_area()

        # Use the smaller area as denominator for overlap ratio
        area1 = rect1.get_area()
        area2 = rect2.get_area()
        smaller_area = min(area1, area2)

        if smaller_area == 0:
            return 0.0

        return overlap_area / smaller_area

    def get_image_area(img):
        """Calculate image area"""
        bbox = img["bbox"]
        return (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])

    # Group images by page
    page_images = {}
    for img in image_elements:
        page_num = img["page"]
        if page_num not in page_images:
            page_images[page_num] = []
        page_images[page_num].append(img)

    cleaned_images = []
    removed_count = 0

    for page_num, images in page_images.items():
        # Sort images by area (largest first)
        images_by_size = sorted(images, key=get_image_area, reverse=True)

        kept_images = []

        for img in images_by_size:
            should_keep = True
            img_bbox = img["bbox"]

            # Check against all already kept images on this page
            for kept_img in kept_images:
                kept_bbox = kept_img["bbox"]
                overlap_ratio = get_overlap_ratio(img_bbox, kept_bbox)

                if overlap_ratio > overlap_threshold:
                    kept_area = get_image_area(kept_img)
                    current_area = get_image_area(img)
                    print(
                        f"[REMOVE] Image {img['image_id']} (area: {current_area:.0f}) on page {page_num}: {overlap_ratio:.2f} overlap with larger image {kept_img['image_id']} (area: {kept_area:.0f})"
                    )
                    should_keep = False
                    break

            if should_keep:
                kept_images.append(img)
            else:
                removed_count += 1

        cleaned_images.extend(kept_images)

    return cleaned_images


def _merge_elements_by_reading_order(text_elements, image_elements, table_elements):
    """Merge text, images, and tables in proper reading order considering column layout"""

    # Group elements by page
    page_elements = {}

    # Initialize page structure
    for text_elem in text_elements:
        page_num = text_elem["page"]
        if page_num not in page_elements:
            page_elements[page_num] = {
                "text": [],
                "images": [],
                "tables": [],
                "merged_content": [],
            }
        page_elements[page_num]["text"].append(text_elem)

    # Add images and tables to their respective pages
    for img_elem in image_elements:
        page_num = img_elem["page"]
        if page_num in page_elements:
            page_elements[page_num]["images"].append(img_elem)

    for table_elem in table_elements:
        page_num = table_elem["page"]
        if page_num in page_elements:
            page_elements[page_num]["tables"].append(table_elem)

    # Process each page
    all_merged_content = []

    for page_num in sorted(page_elements.keys()):
        page_data = page_elements[page_num]

        print(f"\n--- Processing Page {page_num} ---")
        print(f"Text blocks: {len(page_data['text'])}")
        print(f"Images: {len(page_data['images'])}")
        print(f"Tables: {len(page_data['tables'])}")

        # Keep text blocks in original order (already in reading order from PyMuPDF)
        text_blocks = page_data["text"]

        # Sort images and tables by Y position, then by X position
        images = page_data["images"]
        tables = page_data["tables"]

        page_content = []
        page_content.append(
            {
                "type": "page_header",
                "content": f"# Page {page_num}\n\n",
                "page": page_num,
                "position": {"x": 0, "y": 0},
            }
        )

        # Initialize pointers for images and tables
        img_index = 0
        table_index = 0

        # Loop through text elements in their original order
        for text_i, text_block in enumerate(text_blocks):
            text_bbox = text_block["bbox"]
            current_page = text_block["page"]
            current_y = text_bbox[1]  # Y position
            x_end = text_bbox[2]

            # Check if we should insert images before this text block
            while img_index < len(images):
                img = images[img_index]
                img_bbox = img["bbox"]
                img_page = img["page"]
                img_x = img_bbox[0]
                img_y = img_bbox[1]

                # Insert image if it's on same page and positioned before current text block
                if img_page == current_page and img_y <= current_y and img_x < x_end:
                    # Create image content
                    if "filename" in img:
                        content = f"![{img['image_id']}]({img['filename']})\n\n"
                    else:
                        content = f"*[Image: {img['image_id']}]*\n\n"

                    page_content.append(
                        {
                            "type": "image",
                            "content": content,
                            "image_type": img["type"],
                            "page": page_num,
                            "position": {"x": img_bbox[0], "y": img_y},
                            "image_id": img["image_id"],
                        }
                    )

                    img_index += 1
                else:
                    break

            # Check if we should insert tables before this text block
            while table_index < len(tables):
                table = tables[table_index]
                table_bbox = table["bbox"]
                table_page = table["page"]
                table_x = table_bbox[0]
                table_y = table_bbox[1]

                # Insert table if it's on same page and positioned before current text block
                if (
                    table_page == current_page
                    and table_y <= current_y
                    and table_x < x_end
                ):
                    # Create table content
                    content = f"### {table['table_id'].replace('_', ' ').title()}\n\n"
                    if "files" in table:
                        content += f"[CSV]({table['files']['csv']}) | [HTML]({table['files']['html']})\n\n"
                    if "content_preview" in table:
                        content += f"```\n{table['content_preview'][:300]}...\n```\n\n"

                    page_content.append(
                        {
                            "type": "table",
                            "content": content,
                            "page": page_num,
                            "position": {"x": table_bbox[0], "y": table_y},
                            "table_id": table["table_id"],
                            "dimensions": table.get("dimensions", {}),
                        }
                    )

                    table_index += 1
                else:
                    break
            # Add current text block
            text_content = text_block["content"].strip()
            if text_content:
                # Determine if heading or paragraph
                if text_block.get("text_type") == "heading":
                    final_text = f"## {text_content}\n\n"
                else:
                    final_text = f"{text_content}\n\n"

                page_content.append(
                    {
                        "type": "text",
                        "content": final_text,
                        "text_type": text_block.get("text_type", "paragraph"),
                        "page": page_num,
                        "position": {"x": text_bbox[0], "y": text_bbox[1]},
                        "block_id": text_block.get("block_id", 0),
                    }
                )

        page_elements[page_num]["merged_content"] = page_content
        all_merged_content.extend(page_content)

    return all_merged_content, page_elements


def parse_pdf_with_pymupdf(input_pdf_path: Path, output_dir: Path) -> Dict[str, Any]:
    """
    Parse PDF sử dụng PyMuPDF theo pipeline tương tự notebook tham chiếu.

    Trả về markdown, metadata, danh sách ảnh/tables và thống kê phục vụ chunking.
    """
    if not HAS_PYMUPDF:
        raise RuntimeError("PyMuPDF not installed. Install with: pip install pymupdf")

    _check_parse_cancel()
    start_time = time.time()

    output_dir.mkdir(parents=True, exist_ok=True)
    images_dir = output_dir / "images"
    tables_dir = output_dir / "tables"
    pdf_stem = input_pdf_path.stem

    _log.info(f"[PDF] Parsing {input_pdf_path.name} with PyMuPDF...")

    _check_parse_cancel()
    doc = fitz.open(input_pdf_path)

    text_elements: List[Dict[str, Any]] = []
    image_elements: List[Dict[str, Any]] = []
    table_elements: List[Dict[str, Any]] = []
    total_images_saved = 0
    total_tables_saved = 0

    for page_index in range(len(doc)):
        _check_parse_cancel()
        page = doc[page_index]

        text_elements.extend(_extract_text_elements(page, page_index))

        imgs, img_count = _extract_image_elements(
            page, page_index, images_dir, pdf_stem, doc
        )
        image_elements.extend(imgs)
        total_images_saved += img_count

        tables, tbl_count = _extract_table_elements(
            page, page_index, tables_dir, pdf_stem
        )
        table_elements.extend(tables)
        total_tables_saved += tbl_count

    cleaned_text = _clean_text_blocks_in_figures_tables(
        text_elements, image_elements, table_elements
    )
    cleaned_images = _clean_overlapping_images(image_elements)
    merged_content, page_structure = _merge_elements_by_reading_order(
        cleaned_text, cleaned_images, table_elements
    )
    markdown_content = []
    for item in merged_content:
        markdown_content.append(item["content"])
    markdown_content = _clean_markdown(markdown_content)

    md_path = output_dir / f"{pdf_stem}.md"
    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write(markdown_content)

    metadata = {
        "filename": input_pdf_path.name,
        "title": doc.metadata.get("title") or pdf_stem,
        "author": doc.metadata.get("author") or "",
        "subject": doc.metadata.get("subject") or "",
        "keywords": doc.metadata.get("keywords") or "",
        "creator": doc.metadata.get("creator") or "",
        "producer": doc.metadata.get("producer") or "",
        "creation_date": doc.metadata.get("creationDate") or "",
        "total_pages": len(doc),
        "processing_time": round(time.time() - start_time, 2),
        "images_saved": total_images_saved,
        "tables_saved": total_tables_saved,
    }

    metadata_path = output_dir / "metadata.json"
    try:
        with open(metadata_path, "w", encoding="utf-8") as fh:
            json.dump(metadata, fh, indent=2, ensure_ascii=False)
    except Exception as exc:
        _log.debug(f"[PDF] ⚠️ Failed to persist metadata.json: {exc}")

    doc.close()

    _log.info(
        f"[PDF] ✅ Parsed {input_pdf_path.name}: pages={metadata['total_pages']}, "
        f"images={total_images_saved}, tables={total_tables_saved}"
    )

    return {
        "markdown_embedded": str(md_path),
        "markdown_referenced": str(md_path),
        "markdown_content": markdown_content,
        "num_pages": metadata["total_pages"],
        "metadata": metadata,
        "image_files": image_elements,
        "table_files": table_elements,
    }


def _clean_markdown(text: str) -> str:
    """Clean và format markdown text"""
    # Remove excessive whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Remove leading/trailing whitespace from lines
    lines = [line.rstrip() for line in text.split("\n")]

    # Join và return
    return "\n".join(lines)


# Alias để tương thích với code cũ
def parse_pdf_with_docling(input_pdf_path: Path, output_dir: Path) -> dict:
    """
    Wrapper function tương thích với code cũ.
    Gọi parse_pdf_with_pymupdf thay vì docling.
    """
    return parse_pdf_with_pymupdf(input_pdf_path, output_dir)
