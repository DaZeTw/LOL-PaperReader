from typing import Dict, Any, List, Optional, Iterable
import logging
from pathlib import Path
import re
import os
import json

# Import cancel check function
try:
    from ..qa.pipeline import _check_cancel
except ImportError:
    # Fallback if import fails
    def _check_cancel(operation: str = "operation") -> None:
        pass

# --- Semantic Splitter (llama_index) ---
# Use thread-local storage to avoid NLTK thread-safety issues
import threading
_semantic_splitter_lock = threading.Lock()
_semantic_splitter_initialized = False

try:
    import torch
    from llama_index.core.node_parser import SemanticSplitterNodeParser
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding
    from llama_index.core import Document

    _DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    _EMBED_MODEL = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5", device=_DEVICE)
    _SPLITTER = SemanticSplitterNodeParser(
        buffer_size=1,
        breakpoint_percentile_threshold=95,
        embed_model=_EMBED_MODEL
    )
    _HAS_SEMANTIC = True
    _semantic_splitter_initialized = True
except Exception as exc:
    import logging

    logging.getLogger(__name__).error(
        "Semantic splitter initialization failed: %s", exc, exc_info=True
    )
    _SPLITTER = None
    _HAS_SEMANTIC = False

BASE_OUTPUT_DIR = r'.\paperreader\services\parser\output'

logger = logging.getLogger(__name__)

def extract_images(text: str) -> (str, List[Dict[str, str]]):
    """Extract images from markdown text, skipping base64-encoded inline images.
    
    OPTIMIZED: Simplified figure_id search to improve performance for large markdown files.
    """
    images: List[Dict[str, str]] = []
    img_pattern = re.compile(r'!\[(.*?)\]\((.*?)\)', flags=re.DOTALL)
    cleaned_parts: List[str] = []
    last_idx = 0
    
    # Pre-compile figure/page patterns for faster matching
    figure_pattern = re.compile(r'^(Figure\s+\d+)\s*:\s*(.*)', flags=re.IGNORECASE)
    page_pattern = re.compile(r'^#\s*Page\s+(\d+)', flags=re.IGNORECASE)

    for m in img_pattern.finditer(text):
        start, end = m.span()
        alt_text, data = m.groups()

        cleaned_parts.append(text[last_idx:start])

        # Skip base64-encoded images
        if data.startswith('data:'):
            last_idx = end
            continue

        # OPTIMIZED: Simplified figure_id search - only check last 500 chars (faster)
        # and limit to 20 lines max to avoid slow processing
        context = text[:start]
        window_start = max(0, len(context) - 500)  # Reduced from 1000 to 500
        window = context[window_start:]
        candidate_caption = alt_text.strip()
        figure_id = ""
        page_number: Optional[int] = None

        # Limit to last 20 lines max for performance
        lines = window.splitlines()
        for line in reversed(lines[-20:]):  # Only check last 20 lines
            stripped = line.strip()
            if not stripped: 
                continue
            if stripped.startswith('#'):
                page_match = page_pattern.match(stripped)
                if page_match and page_number is None:
                    try:
                        page_number = int(page_match.group(1))
                    except ValueError:
                        page_number = None
                # Do not break immediately; keep scanning for figure caption
                # but avoid looping unnecessarily
            m_fig = figure_pattern.match(stripped)
            if m_fig:
                figure_id, caption_text = m_fig.groups()
                candidate_caption = caption_text.strip()
                break

        # Construct file path
        normalized_data = data.replace("\\", "/")
        images.append({
            'caption': candidate_caption or 'Image',
            'data': normalized_data,
            'figure_id': figure_id or '',
            'alt_text': alt_text.strip(),
            'page': page_number,
        })
        
        # IMPORTANT: Giữ lại path trong text tạm thời để có thể match khi chunking
        # Path sẽ được loại bỏ khỏi text sau khi match trong chunking
        cleaned_parts.append(normalized_data)
        last_idx = end

    cleaned_parts.append(text[last_idx:])
    # OPTIMIZED: Use compiled pattern for faster substitution
    newline_pattern = re.compile(r'\n\s*\n+')
    text_clean = newline_pattern.sub('\n\n', ''.join(cleaned_parts)).strip()
    return text_clean, images


# --- Main chunking function ---
def _ensure_semantic_splitter(splitter: Optional[Any]) -> Any:
    if splitter:
        return splitter
    if _HAS_SEMANTIC and _SPLITTER:
        return _SPLITTER
    raise RuntimeError(
        "Semantic splitter is not available. Install the required dependencies "
        "for llama_index and torch to enable semantic chunking."
    )


def _chunk_has_table_reference(chunk_text: str, table_entry: Dict[str, Any]) -> bool:
    candidates: Iterable[str] = [
        table_entry.get("relative_path") or "",
        table_entry.get("data") or "",
        table_entry.get("label") or "",
    ]
    for candidate in candidates:
        if not candidate:
            continue
        normalized = candidate.replace("\\", "/")
        if normalized and normalized.lower() in chunk_text.lower():
            return True
    # Also look for common extensions explicitly if the text references them
    if ".csv" in chunk_text.lower() or ".html" in chunk_text.lower():
        return True
    return False


def split_sections_into_chunks(
    docs: List[Dict[str, Any]],
    max_chars: int = 1200,
    overlap: int = 200,
    semantic_splitter: Optional[Any] = None
) -> List[Dict[str, Any]]:
    """
    Chia sections thành semantic chunks, gán ảnh dựa vào figure_id xuất hiện.
    Nếu chunk không chứa figure_id nào, images=None.
    """
    _ = max_chars  # Parameters retained for backward compatibility
    _ = overlap
    chunks: List[Dict[str, Any]] = []
    use_splitter = _ensure_semantic_splitter(semantic_splitter)

    # Check cancel flag at start
    try:
        _check_cancel("Before chunking")
    except Exception:
        pass  # If cancel check fails, continue (for backward compatibility)

    for doc in docs:
        # Check cancel flag before processing each document
        try:
            _check_cancel(f"Before chunking document {doc.get('doc_id', 'unknown')}")
        except Exception:
            pass
        
        doc_id = doc.get("doc_id", "doc")

        for sec in doc.get("sections", []):
            # Check cancel flag before processing each section
            try:
                _check_cancel(f"Before chunking section {sec.get('title', 'unknown')}")
            except Exception:
                pass
            text = sec.get("text", "") or ""
            title = sec.get("title", "") or ""
            page = sec.get("page")

            # Tách ảnh
            text_clean, extracted_images = extract_images(text)
            for img in extracted_images:
                img.setdefault("page", page)
            # Ensure images is always a list (handle None case)
            sec_images = sec.get("images")
            if sec_images is None:
                sec_images = []
            elif not isinstance(sec_images, list):
                sec_images = [sec_images] if sec_images else []
            images = sec_images + extracted_images

            if not text_clean.strip() and not images:
                continue

            if not text_clean.strip():
                if images:
                    chunks.append(
                        {
                            "doc_id": doc_id,
                            "title": title,
                            "page": page,
                            "text": "",
                            "images": images,
                        }
                    )
                continue

            try:
                _check_cancel("Before semantic splitting")
            except Exception:
                pass

            # Use lock to ensure thread-safe access to semantic splitter
            # This prevents NLTK thread-safety issues when processing multiple PDFs
            with _semantic_splitter_lock:
                try:
                    nodes = use_splitter.get_nodes_from_documents([Document(text=text_clean)])
                except Exception as exc:
                    raise RuntimeError(f"Semantic splitter failed while processing document '{doc_id}': {exc}") from exc

            for n in nodes:
                try:
                    _check_cancel("Before processing semantic node")
                except Exception:
                    pass

                content = (n.text or "").strip()
                if not content:
                    continue

                chunk_images = [
                    img for img in images
                    if img.get("figure_id") and img["figure_id"] in content
                ]

                payload: Dict[str, Any] = {
                    "doc_id": doc_id,
                    "title": title,
                    "page": page,
                    "text": content,
                }
                if chunk_images:
                    payload["images"] = chunk_images

                chunks.append(payload)

    return chunks


def split_markdown_into_chunks(
    markdown_content: str,
    doc_id: str,
    source_path: str = None,
    max_chars: int = 1200,
    overlap: int = 200,
    semantic_splitter: Optional[Any] = None,
    assets: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Chunking trực tiếp từ markdown content (bỏ qua doc format trung gian).
    Nhanh hơn vì không cần parse markdown thành sections trước.
    
    Args:
        markdown_content: Markdown text content
        doc_id: Document identifier
        source_path: Optional source path
        max_chars: Maximum characters per chunk
        overlap: Overlap between chunks
        semantic_splitter: Optional semantic splitter
    
    Returns:
        List of chunks with format: {"doc_id": str, "title": str, "page": int, "text": str, "images": List}
    """
    import time
    start_time = time.time()
    
    print(f"[CHUNKING] Starting split_markdown_into_chunks for doc_id={doc_id}, content_length={len(markdown_content)}")
    
    chunks: List[Dict[str, Any]] = []
    assets = assets or {}
    image_assets = assets.get("images") or {}
    table_assets = assets.get("tables") or {}
    # Use semantic splitter if available (preferred over length-based splitting)
    _ = max_chars  # Parameters retained for backward compatibility
    _ = overlap
    use_splitter = _ensure_semantic_splitter(semantic_splitter)
    print(f"[CHUNKING] Semantic splitter available: True, _HAS_SEMANTIC={_HAS_SEMANTIC}")
    
    # Check cancel flag at start
    try:
        _check_cancel("Before chunking markdown")
    except Exception:
        pass
    
    # Tách ảnh từ markdown (có thể chậm với markdown lớn)
    # Lưu ý: extract_images sẽ giữ lại path trong text, chỉ extract metadata
    extract_start = time.time()
    text_clean, extracted_images = extract_images(markdown_content)
    # Tạo lookup map từ path đến image metadata để match nhanh hơn
    image_path_lookup: Dict[str, Dict[str, Any]] = {}
    for img in extracted_images:
        img_path = (img.get("data") or "").replace("\\", "/")
        if img_path:
            image_path_lookup[img_path] = dict(img)
            # Also index by filename for flexible matching
            img_filename = Path(img_path).name
            if img_filename and img_filename != img_path:
                image_path_lookup[img_filename] = dict(img)
    pending_markdown_images: List[Dict[str, Any]] = [dict(img) for img in extracted_images]
    extract_time = time.time() - extract_start
    if extract_time > 1.0:
        print(f"[CHUNKING] ⚠️ extract_images took {extract_time:.2f}s (slow for {len(markdown_content)} chars)")
    
    # Tách theo headings để lấy title cho mỗi section
    # OPTIMIZED: Sử dụng regex compile trước để nhanh hơn
    split_start = time.time()
    heading_pattern = re.compile(r'(?=^#{1,3}\s)', re.MULTILINE)
    parts = heading_pattern.split(text_clean)
    split_time = time.time() - split_start
    if split_time > 1.0:
        print(f"[CHUNKING] ⚠️ Regex split took {split_time:.2f}s (slow for {len(text_clean)} chars)")
    
    current_title = "Document"
    current_page = 1
    
    for part in parts:
        part = part.strip()
        if not part:
            continue
        
        # Tách title và body
        lines = part.split("\n", 1)
        heading_line = lines[0].strip()
        body = lines[1].strip() if len(lines) > 1 else ""
        heading_text = ""
        heading_level = 0
        
        # Nếu có heading, cập nhật title/page
        if heading_line.startswith('#'):
            heading_level = len(heading_line) - len(heading_line.lstrip('#'))
            heading_text = re.sub(r'^#{1,3}\s*', '', heading_line).strip()
            current_title = heading_text or "Document"
            if heading_level == 1:
                match_page = re.match(r'Page\s+(\d+)', heading_text, flags=re.IGNORECASE)
                if match_page:
                    try:
                        current_page = int(match_page.group(1))
                    except ValueError:
                        current_page = current_page
        
        # Giữ heading cấp 2/3 trong nội dung để chunk giữ được bối cảnh tiêu đề
        if heading_text and heading_level >= 2:
            if body:
                body = f"{heading_text}\n\n{body}"
            else:
                body = heading_text
        
        # Bỏ các phần đầu không có heading (metadata, author list, etc.)
        if not heading_line.startswith('#') and len(body.split()) < 20:
            continue
        
        # OPTIMIZED: Lấy images liên quan đến section này
        # Match images dựa trên path trong body text (text đã giữ lại path)
        section_images: List[Dict[str, Any]] = []
        matched_paths_in_section = set()
        
        if pending_markdown_images and body:
            # Tìm tất cả image paths trong body text
            img_path_pattern = re.compile(r'(images/[^\s\)]+\.(?:png|jpg|jpeg|gif|webp))', re.IGNORECASE)
            for path_match in img_path_pattern.finditer(body):
                img_path = path_match.group(1).replace("\\", "/")
                # Try to find image metadata from lookup
                img_meta = image_path_lookup.get(img_path) or image_path_lookup.get(Path(img_path).name)
                if img_meta and img_path not in matched_paths_in_section:
                    section_images.append(dict(img_meta))
                    matched_paths_in_section.add(img_path)
            
            # Also check for figure_id references
            remaining_images: List[Dict[str, Any]] = []
            for img in pending_markdown_images:
                img_path = (img.get("data") or "").replace("\\", "/")
                if img_path in matched_paths_in_section:
                    continue  # Already matched by path
                figure_id = (img.get("figure_id") or "").strip()
                if figure_id and figure_id in body:
                    section_images.append(dict(img))
                else:
                    remaining_images.append(img)
            pending_markdown_images = remaining_images

        # Detect tables in section - giữ lại path trong text, chỉ extract metadata
        section_tables: List[Dict[str, Any]] = []
        # Tìm tất cả table paths trong body text (giữ nguyên path trong text)
        table_path_pattern = re.compile(r'(tables/[^\s\)]+\.csv)', re.IGNORECASE)
        matched_table_paths = set()
        
        for path_match in table_path_pattern.finditer(body):
            table_path = path_match.group(1).replace("\\", "/").lstrip("./")
            if table_path not in matched_table_paths:
                lookup = table_assets.get(table_path) or table_assets.get(f"tables/{Path(table_path).name}")
                entry: Dict[str, Any] = {
                    "data": table_path,
                    "relative_path": table_path,
                    "label": Path(table_path).name,
                }
                if lookup:
                    entry.update(
                        {
                            "preview": lookup.get("preview"),
                            "bucket": lookup.get("bucket"),
                            "local_path": lookup.get("local_path"),
                            "object_name": lookup.get("object_name"),
                        }
                    )
                section_tables.append(entry)
                matched_table_paths.add(table_path)
        
        if not body.strip() and not section_images and not section_tables:
            continue
        
        # --- Semantic splitting ---
        if not body.strip():
            if section_images or section_tables:
                payload: Dict[str, Any] = {
                    "doc_id": doc_id,
                    "title": current_title,
                    "page": current_page,
                    "text": "",
                }
                if section_images:
                    payload["images"] = section_images
                if section_tables:
                    payload["tables"] = [dict(tbl) for tbl in section_tables]
                chunks.append(payload)
            continue

        pending_images: List[Dict[str, Any]] = list(section_images)
        section_chunk_start = len(chunks)

        try:
            _check_cancel("Before semantic splitting")
        except Exception:
            pass

        # Use lock to ensure thread-safe access to semantic splitter
        # This prevents NLTK thread-safety issues when processing multiple PDFs
        with _semantic_splitter_lock:
            try:
                nodes = use_splitter.get_nodes_from_documents([Document(text=body)])
            except Exception as exc:
                raise RuntimeError(f"Semantic splitter failed while processing markdown section '{current_title}': {exc}") from exc

        for n in nodes:
            try:
                _check_cancel("Before processing semantic node")
            except Exception:
                pass

            content = (n.text or "").strip()
            if not content:
                continue

            # Match images dựa trên path trong chunk text
            # Sau đó loại bỏ path khỏi text để chỉ giữ text thuần
            matched_images: List[Dict[str, Any]] = []
            matched_paths = set()  # Track paths đã match để tránh duplicate
            
            # Tìm tất cả image paths trong chunk text và extract metadata
            img_path_pattern = re.compile(r'(images/[^\s\)]+\.(?:png|jpg|jpeg|gif|webp))', re.IGNORECASE)
            for path_match in img_path_pattern.finditer(content):
                img_path = path_match.group(1).replace("\\", "/")
                # Try to find image metadata from lookup
                img_meta = image_path_lookup.get(img_path) or image_path_lookup.get(Path(img_path).name)
                if img_meta and img_path not in matched_paths:
                    matched_images.append(dict(img_meta))
                    matched_paths.add(img_path)
            
            # Also check for figure_id references in content
            for img in pending_images:
                if img in matched_images:  # Already matched by path
                    continue
                figure_id = (img.get("figure_id") or "").strip()
                if figure_id and figure_id in content:
                    matched_images.append(dict(img))
            
            # Loại bỏ image paths khỏi content để chỉ giữ text thuần
            content_clean = content
            for img_path in matched_paths:
                # Remove path from content (có thể có space trước/sau)
                content_clean = re.sub(r'\s*' + re.escape(img_path) + r'\s*', ' ', content_clean, flags=re.IGNORECASE)
            
            chunk_images = matched_images
            # Remove matched images from pending (based on path matching)
            pending_images = [
                img for img in pending_images 
                if img.get("data") not in matched_paths and img not in matched_images
            ]

            # Match tables dựa trên path trong chunk text
            # Sau đó loại bỏ path khỏi text để chỉ giữ text thuần
            chunk_tables: List[Dict[str, Any]] = []
            table_path_pattern = re.compile(r'(tables/[^\s\)]+\.csv)', re.IGNORECASE)
            matched_table_paths_in_chunk = set()
            
            for path_match in table_path_pattern.finditer(content_clean):
                table_path = path_match.group(1).replace("\\", "/").lstrip("./")
                if table_path not in matched_table_paths_in_chunk:
                    # Find table metadata from section_tables
                    for tbl in section_tables:
                        tbl_path = (tbl.get("relative_path") or tbl.get("data") or "").replace("\\", "/")
                        if tbl_path == table_path or Path(tbl_path).name == Path(table_path).name:
                            chunk_tables.append(dict(tbl))
                            matched_table_paths_in_chunk.add(table_path)
                            break
            
            # Loại bỏ table paths khỏi content để chỉ giữ text thuần
            for table_path in matched_table_paths_in_chunk:
                # Remove path from content (có thể có space trước/sau)
                content_clean = re.sub(r'\s*' + re.escape(table_path) + r'\s*', ' ', content_clean, flags=re.IGNORECASE)

            # Clean up multiple spaces sau khi loại bỏ paths
            content_clean = re.sub(r'\s+', ' ', content_clean).strip()
            
            payload: Dict[str, Any] = {
                "doc_id": doc_id,
                "title": current_title,
                "page": current_page,
                "text": content_clean,  # Text đã được clean, không còn path images/tables
            }
            if chunk_images:
                payload["images"] = chunk_images
            if chunk_tables:
                payload["tables"] = chunk_tables

            chunks.append(payload)

        # Any remaining images not yet assigned should attach to the last chunk of this section
        if pending_images and len(chunks) > section_chunk_start:
            last_chunk = chunks[-1]
            existing = list(last_chunk.get("images") or [])
            existing.extend(dict(img) for img in pending_images if img)
            last_chunk["images"] = existing

        # Page number stays until the next explicit page heading
    
    total_time = time.time() - start_time
    if total_time > 2.0:
        print(f"[CHUNKING] ⚠️ Total chunking took {total_time:.2f}s (extract: {extract_time:.2f}s, split: {split_time:.2f}s, processing: {total_time - extract_time - split_time:.2f}s)")
    else:
        print(f"[CHUNKING] ✅ Created {len(chunks)} chunks in {total_time:.2f}s")
    return chunks


def chunk_markdown_to_json(
    md_path: str,
    *,
    output_path: Optional[str] = None,
    doc_id: Optional[str] = None,
    assets_path: Optional[str] = None,
    ensure_ascii: bool = False,
    indent: int = 2,
) -> str:
    """
    Chunk a markdown file and dump the resulting chunks to a JSON file.

    Args:
        md_path: Path to the markdown file to chunk.
        output_path: Optional output JSON path. Defaults to "<md_path>.chunks.json".
        doc_id: Optional document identifier passed to the chunking function.
        assets_path: Optional JSON file path describing assets metadata.
        ensure_ascii: If True, ensure ASCII when writing JSON.
        indent: Indentation level for JSON output.

    Returns:
        The absolute path to the JSON file that was written.
    """
    path = Path(md_path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"Markdown file not found: {path}")
    if path.suffix.lower() != ".md":
        logger.warning("Expected a .md file, received '%s'", path.suffix)

    doc_key = doc_id or path.stem
    markdown_content = path.read_text(encoding="utf-8")

    assets: Optional[Dict[str, Dict[str, Any]]] = None
    if assets_path:
        assets_file = Path(assets_path).expanduser().resolve()
        if not assets_file.exists():
            raise FileNotFoundError(f"Assets metadata file not found: {assets_file}")
        with assets_file.open("r", encoding="utf-8") as f:
            assets = json.load(f)

    semantic_splitter = _SPLITTER if _HAS_SEMANTIC else None
    try:
        chunks = split_markdown_into_chunks(
            markdown_content,
            doc_id=doc_key,
            source_path=str(path),
            semantic_splitter=semantic_splitter,
            assets=assets,
        )
    except RuntimeError as exc:
        if "Semantic splitter is not available" in str(exc):
            logger.warning("Semantic splitter unavailable; storing markdown as a single chunk")
            cleaned_text = markdown_content.strip()
            if not cleaned_text:
                logger.warning("Markdown file '%s' is empty after trimming; no output written", path)
                raise ValueError(f"Markdown file '{path}' is empty after trimming") from exc
            chunks = [
                {
                    "doc_id": doc_key,
                    "title": path.stem or "Document",
                    "page": 1,
                    "text": cleaned_text,
                }
            ]
        else:
            raise

    output_file = Path(output_path).expanduser().resolve() if output_path else path.with_suffix(".chunks.json")
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(
        json.dumps(chunks, ensure_ascii=ensure_ascii, indent=indent),
        encoding="utf-8",
    )
    logger.info("Wrote %s chunks to %s", len(chunks), output_file)
    return str(output_file)


'''if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Chunk a markdown file and write the chunks to a JSON file."
    )
    parser.add_argument(
        "markdown_path",
        help="Path to the .md file that should be chunked.",
    )
    parser.add_argument(
        "-o",
        "--output",
        dest="output_path",
        help="Optional output JSON path. Defaults to '<markdown>.chunks.json'.",
    )
    parser.add_argument(
        "--doc-id",
        dest="doc_id",
        help="Optional document identifier passed through to the chunk metadata.",
    )
    parser.add_argument(
        "--assets",
        dest="assets_path",
        help="Optional path to a JSON file containing assets metadata (images/tables).",
    )
    parser.add_argument(
        "--ensure-ascii",
        action="store_true",
        help="Force non-ASCII characters to be escaped in the JSON output.",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="Indentation level for the JSON output (default: 2).",
    )

    args = parser.parse_args()

    try:
        output_file = chunk_markdown_to_json(
            args.markdown_path,
            output_path=args.output_path,
            doc_id=args.doc_id,
            assets_path=args.assets_path,
            ensure_ascii=args.ensure_ascii,
            indent=args.indent,
        )
        print(f"[Chunking] ✅ Chunks saved to {output_file}")
    except Exception as exc:
        print(f"[Chunking] ❌ Failed to create chunks: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
'''