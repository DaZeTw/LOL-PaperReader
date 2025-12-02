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
import time
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import threading

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
        _log.warning(f"[PDF] ⚠️ Failed to extract text layout for page {page_index + 1}: {exc}")
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
        text_type = "heading" if is_bold_detected and len(full_text) < 100 else "paragraph"

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
        _log.warning(f"[PDF] ⚠️ Failed to enumerate embedded images on page {page_index + 1}: {exc}")

    image_counter = 1
    for img_index, img in enumerate(image_list):
        try:
            xref = img[0]
            extracted = doc.extract_image(xref)
            img_bytes = extracted.get("image")
            img_ext = extracted.get("ext", "png")
            if not img_bytes:
                continue

            image_filename = f"{pdf_stem}-p{page_index + 1}-img{image_counter:03d}.{img_ext}"
            image_path = images_dir / image_filename
            try:
                with open(image_path, "wb") as fh:
                    fh.write(img_bytes)
            except FileNotFoundError as exc:
                # Directory may have been cleaned up by the caller (e.g. /tmp cleaned); skip silently
                _log.debug(
                    "[PDF] Skipping embedded image %s on page %s – destination disappeared: %s",
                    image_filename,
                    page_index + 1,
                    exc,
                )
                continue

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
            _log.warning(f"[PDF] ⚠️ Error extracting embedded image {img_index} on page {page_index + 1}: {exc}")

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
                _log.debug(f"[PDF] ⚠️ Failed to rasterize vector figure on page {page_index + 1}: {exc}")

    return image_elements, images_saved


def _extract_table_elements(
    page: "fitz.Page", page_index: int, tables_dir: Path, pdf_stem: str
) -> Tuple[List[Dict[str, Any]], int]:
    table_elements: List[Dict[str, Any]] = []
    tables_dir.mkdir(parents=True, exist_ok=True)
    tables_saved = 0

    try:
        tables = page.find_tables()
        # Ensure tables is always iterable (handle None case)
        if tables is None:
            tables = []
    except Exception as exc:
        _log.warning(f"[PDF] ⚠️ Table detection failed on page {page_index + 1}: {exc}")
        return table_elements, tables_saved

    for table_idx, table in enumerate(tables):
        try:
            df = table.to_pandas()
        except Exception as exc:
            _log.debug(f"[PDF] ⚠️ Failed to convert table {table_idx} on page {page_index + 1}: {exc}")
            continue
        if df.empty:
            continue

        table_id = f"table_{table_idx + 1}"
        csv_filename = f"{pdf_stem}-p{page_index + 1}-{table_id}.csv"
        csv_path = tables_dir / csv_filename
        try:
            df.to_csv(csv_path, index=False)
            _log.debug(
                "[PDF] Saved table %s on page %s -> %s",
                table_id,
                page_index + 1,
                csv_path,
            )
        except Exception as exc:
            _log.warning(f"[PDF] ⚠️ Failed to save CSV for table {table_idx} on page {page_index + 1}: {exc}")
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
                "preview": (table_text[:300] + "...") if len(table_text) > 300 else table_text,
            }
        )
        tables_saved += 1

    return table_elements, tables_saved


def _clean_overlapping_elements(
    text_elements: List[Dict[str, Any]],
    image_elements: List[Dict[str, Any]],
    table_elements: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    IMAGE_OVERLAP_THRESHOLD = 0.7
    TABLE_OVERLAP_THRESHOLD = 0.95

    for text_elem in text_elements:
        text_bbox = text_elem.get("bbox") or [0, 0, 0, 0]
        text_rect = fitz.Rect(text_bbox)
        text_area = text_rect.get_area()
        if text_area == 0:
            continue

        keep = True
        text_page = text_elem.get("page")

        for image in image_elements:
            if image.get("page") != text_page:
                continue
            img_rect = fitz.Rect(image.get("bbox") or [0, 0, 0, 0])
            if not text_rect.intersects(img_rect):
                continue
            overlap = (text_rect & img_rect).get_area()
            if overlap / text_area > IMAGE_OVERLAP_THRESHOLD:
                keep = False
                break
        if not keep:
            continue

        for table in table_elements:
            if table.get("page") != text_page:
                continue
            tbl_rect = fitz.Rect(table.get("bbox") or [0, 0, 0, 0])
            if not text_rect.intersects(tbl_rect):
                continue
            overlap = (text_rect & tbl_rect).get_area()
            if overlap / text_area > TABLE_OVERLAP_THRESHOLD:
                keep = False
                break

        if keep:
            cleaned.append(text_elem)

    return cleaned


def _merge_to_markdown(
    text_elements: List[Dict[str, Any]],
    image_elements: List[Dict[str, Any]],
    table_elements: List[Dict[str, Any]],
) -> str:
    def _get_position(elem: Dict[str, Any]) -> Tuple[float, float]:
        pos = elem.get("position") or {}
        x = pos.get("x")
        y = pos.get("y")
        if x is not None and y is not None:
            return float(x), float(y)

        bbox = elem.get("bbox") or []
        if len(bbox) >= 2:
            return float(bbox[0]), float(bbox[1])

        return 0.0, 0.0

    def _get_bbox(elem: Dict[str, Any]) -> Tuple[float, float, float, float]:
        bbox = elem.get("bbox")
        if bbox and len(bbox) == 4:
            return float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])

        pos = elem.get("position") or {}
        x = float(pos.get("x", 0.0))
        y = float(pos.get("y", 0.0))
        width = float(pos.get("width", 0.0))
        height = float(pos.get("height", 0.0))
        return x, y, x + width, y + height

    pages: Dict[int, Dict[str, Any]] = {}

    for elem in text_elements:
        page = elem.get("page", 1)
        pages.setdefault(page, {"text": [], "images": [], "tables": []})
        pages[page]["text"].append(elem)

    for img in image_elements:
        page = img.get("page", 1)
        pages.setdefault(page, {"text": [], "images": [], "tables": []})
        pages[page]["images"].append(img)

    for table in table_elements:
        page = table.get("page", 1)
        pages.setdefault(page, {"text": [], "images": [], "tables": []})
        pages[page]["tables"].append(table)

    markdown_lines: List[str] = []
    for page_num in sorted(pages.keys()):
        page_data = pages[page_num]
        markdown_lines.append(f"# Page {page_num}\n")

        text_blocks = sorted(
            page_data["text"],
            key=lambda t: (_get_position(t)[1], _get_position(t)[0], t.get("block_id", 0)),
        )
        images_sorted = sorted(
            page_data["images"], key=lambda img: (_get_position(img)[1], _get_position(img)[0])
        )
        tables_sorted = sorted(
            page_data["tables"], key=lambda tbl: (_get_position(tbl)[1], _get_position(tbl)[0])
        )

        img_index = 0
        tbl_index = 0

        def _append_image(elem: Dict[str, Any]) -> None:
            image_id = elem.get("image_id", "image")
            rel_path = elem.get("relative_path") or elem.get("filename") or ""
            markdown_lines.append(f"![{image_id}]({rel_path})\n")

        def _append_table(elem: Dict[str, Any]) -> None:
            table_id = elem.get("table_id", "Table")
            rel_path = elem.get("relative_path") or elem.get("filename") or ""
            markdown_lines.append(f"### {table_id.replace('_', ' ').title()}\n")
            markdown_lines.append(f"[View CSV]({rel_path})\n")

        if not text_blocks:
            for img in images_sorted:
                _append_image(img)
            for table in tables_sorted:
                _append_table(table)
            markdown_lines.append("")
            continue

        for text in text_blocks:
            _, current_y = _get_position(text)
            x0, _, x1, _ = _get_bbox(text)
            if x1 <= x0:
                x1 = float("inf")

            while img_index < len(images_sorted):
                img = images_sorted[img_index]
                img_x, img_y = _get_position(img)
                if img_y <= current_y and img_x < x1:
                    _append_image(img)
                    img_index += 1
                else:
                    break

            while tbl_index < len(tables_sorted):
                tbl = tables_sorted[tbl_index]
                tbl_x, tbl_y = _get_position(tbl)
                if tbl_y <= current_y and tbl_x < x1:
                    _append_table(tbl)
                    tbl_index += 1
                else:
                    break

            content = text.get("content", "").strip()
            if not content:
                continue
            if text.get("text_type") == "heading" and len(content) < 150:
                markdown_lines.append(f"## {content}\n")
            else:
                markdown_lines.append(f"{content}\n")

        while img_index < len(images_sorted):
            _append_image(images_sorted[img_index])
            img_index += 1

        while tbl_index < len(tables_sorted):
            _append_table(tables_sorted[tbl_index])
            tbl_index += 1

        markdown_lines.append("")

    return "\n".join(markdown_lines).strip()


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

        imgs, img_count = _extract_image_elements(page, page_index, images_dir, pdf_stem, doc)
        image_elements.extend(imgs)
        total_images_saved += img_count

        tables, tbl_count = _extract_table_elements(page, page_index, tables_dir, pdf_stem)
        table_elements.extend(tables)
        total_tables_saved += tbl_count

    cleaned_text = _clean_overlapping_elements(text_elements, image_elements, table_elements)
    markdown_content = _merge_to_markdown(cleaned_text, image_elements, table_elements)
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

