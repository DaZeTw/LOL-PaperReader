from typing import Dict, Any, List, Optional
from pathlib import Path
import re
import os

# Import cancel check function
try:
    from ..qa.pipeline import _check_cancel
except ImportError:
    # Fallback if import fails
    def _check_cancel(operation: str = "operation") -> None:
        pass

# --- Semantic Splitter (llama_index) ---
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
except Exception:
    _SPLITTER = None
    _HAS_SEMANTIC = False

BASE_OUTPUT_DIR = r'.\paperreader\services\parser\output'

def extract_images(text: str) -> (str, List[Dict[str, str]]):
    """Extract images from markdown text, skipping base64-encoded inline images.
    
    OPTIMIZED: Simplified figure_id search to improve performance for large markdown files.
    """
    images: List[Dict[str, str]] = []
    img_pattern = re.compile(r'!\[(.*?)\]\((.*?)\)', flags=re.DOTALL)
    cleaned_parts: List[str] = []
    last_idx = 0
    
    # Pre-compile figure pattern for faster matching
    figure_pattern = re.compile(r'^(Figure\s+\d+)\s*:\s*(.*)', flags=re.IGNORECASE)

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

        # Limit to last 20 lines max for performance
        lines = window.splitlines()
        for line in reversed(lines[-20:]):  # Only check last 20 lines
            stripped = line.strip()
            if not stripped: 
                continue
            if stripped.startswith('#'): 
                break
            m_fig = figure_pattern.match(stripped)
            if m_fig:
                figure_id, caption_text = m_fig.groups()
                candidate_caption = caption_text.strip()
                break

        # Construct file path
        images.append({
            'caption': candidate_caption or 'Image',
            'data': str(Path('paperreader/services/parser/output') / data.replace("\\", "/")),
            'figure_id': figure_id or ''
        })
        last_idx = end

    cleaned_parts.append(text[last_idx:])
    # OPTIMIZED: Use compiled pattern for faster substitution
    newline_pattern = re.compile(r'\n\s*\n+')
    text_clean = newline_pattern.sub('\n\n', ''.join(cleaned_parts)).strip()
    return text_clean, images


# --- Main chunking function ---
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
    chunks: List[Dict[str, Any]] = []
    use_splitter = semantic_splitter if semantic_splitter else (_SPLITTER if _HAS_SEMANTIC else None)

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

            # --- Semantic splitting ---
            if use_splitter and text_clean.strip():
                try:
                    # Check cancel before semantic splitting
                    try:
                        _check_cancel("Before semantic splitting")
                    except Exception:
                        pass
                    
                    nodes = use_splitter.get_nodes_from_documents([Document(text=text_clean)])
                    # Use semantic nodes directly - no additional length-based splitting
                    for n in nodes:
                        # Check cancel before processing each node
                        try:
                            _check_cancel("Before processing semantic node")
                        except Exception:
                            pass
                        
                        content = (n.text or "").strip()
                        if not content:
                            continue
                        
                        # Use semantic node as-is (no max_chars splitting)
                        chunk_text = content

                        # Gán ảnh dựa vào figure_id
                        chunk_images = [
                            img for img in images
                            if img.get("figure_id") and img["figure_id"] in chunk_text
                        ]

                        chunks.append({
                            "doc_id": doc_id,
                            "title": title,
                            "page": page,
                            "text": chunk_text,
                            "images": chunk_images if chunk_images else None
                        })
                    continue
                except Exception:
                    use_splitter = None

            # --- Fallback heuristic: chia theo paragraphs ---
            # Check cancel before fallback chunking
            try:
                _check_cancel("Before fallback chunking")
            except Exception:
                pass
            
            paragraphs = re.split(r'\n\s*\n+', text_clean)
            current: List[str] = []

            def flush_current():
                # Check cancel in flush function
                try:
                    _check_cancel("During flush_current")
                except Exception:
                    pass
                
                if not current:
                    return
                concatenated = "\n".join(current).strip()
                if not concatenated:
                    current.clear()
                    return

                start = 0
                while start < len(concatenated):
                    # Check cancel in inner loop
                    try:
                        _check_cancel("During paragraph chunking loop")
                    except Exception:
                        pass
                    end = min(len(concatenated), start + max_chars)
                    chunk_text = concatenated[start:end]

                    chunk_images = [
                        img for img in images
                        if img.get("figure_id") and img["figure_id"] in chunk_text
                    ]

                    chunks.append({
                        "doc_id": doc_id,
                        "title": title,
                        "page": page,
                        "text": chunk_text,
                        "images": chunk_images if chunk_images else None
                    })

                    if end >= len(concatenated):
                        break
                    start = max(0, end - overlap)

                current.clear()

            for para in paragraphs:
                # Check cancel before processing each paragraph
                try:
                    _check_cancel("Before processing paragraph")
                except Exception:
                    pass
                
                if sum(len(p) + 1 for p in current) + len(para) > max_chars:
                    flush_current()
                current.append(para)
            flush_current()

    return chunks


def split_markdown_into_chunks(
    markdown_content: str,
    doc_id: str,
    source_path: str = None,
    max_chars: int = 1200,
    overlap: int = 200,
    semantic_splitter: Optional[Any] = None
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
    # Use semantic splitter if available (preferred over length-based splitting)
    use_splitter = semantic_splitter if semantic_splitter else (_SPLITTER if _HAS_SEMANTIC else None)
    print(f"[CHUNKING] Semantic splitter available: {use_splitter is not None}, _HAS_SEMANTIC={_HAS_SEMANTIC}")
    
    # Check cancel flag at start
    try:
        _check_cancel("Before chunking markdown")
    except Exception:
        pass
    
    # Tách ảnh từ markdown (có thể chậm với markdown lớn)
    extract_start = time.time()
    text_clean, extracted_images = extract_images(markdown_content)
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
    
    # Common noise patterns to filter out (case-insensitive)
    noise_patterns = {
        'keywords', 'key words', 'copyright', 'published by', 'doi:',
        'arxiv:', 'preprint', 'submitted to', 'accepted by', 'table of contents',
        'list of figures', 'list of tables', 'permission', 'license'
    }

    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Tách title và body
        lines = part.split("\n", 1)
        heading_line = lines[0].strip()
        body = lines[1].strip() if len(lines) > 1 else ""

        # Nếu có heading, cập nhật title
        if heading_line.startswith('#'):
            current_title = re.sub(r'^#{1,3}\s*', '', heading_line).strip()
            if not current_title:
                current_title = "Document"

            # Skip "Page X" sections - these are just page markers
            if re.match(r'^Page\s+\d+$', current_title, re.IGNORECASE):
                continue

            # Filter out noise sections (common metadata sections that aren't useful)
            title_lower = current_title.lower()
            if any(noise in title_lower for noise in noise_patterns):
                continue

        # Bỏ các phần đầu không có heading (metadata, author list, etc.)
        if not heading_line.startswith('#') and len(body.split()) < 20:
            continue

        # Skip sections with very little meaningful content (< 30 words after heading)
        word_count = len(body.split())
        if word_count < 30 and heading_line.startswith('#'):
            # Allow only if it's a known important section (even if short)
            title_lower = current_title.lower()
            important_short_sections = {'abstract', 'summary', 'conclusion', 'conclusions'}
            if not any(section in title_lower for section in important_short_sections):
                continue
        
        # OPTIMIZED: Lấy images liên quan đến section này (chỉ check nếu có figure_id)
        # Chỉ tìm images có figure_id và figure_id xuất hiện trong body
        section_images = []
        if extracted_images and body:
            # Pre-check: chỉ tìm nếu body đủ dài để chứa figure_id
            for img in extracted_images:
                figure_id = img.get("figure_id")
                if figure_id and figure_id in body:
                    section_images.append(img)
        
        if not body.strip() and not section_images:
            continue
        
        # --- Semantic splitting ---
        if use_splitter and body.strip():
            try:
                try:
                    _check_cancel("Before semantic splitting")
                except Exception:
                    pass
                
                nodes = use_splitter.get_nodes_from_documents([Document(text=body)])
                # Use semantic nodes directly - no additional length-based splitting
                for n in nodes:
                    try:
                        _check_cancel("Before processing semantic node")
                    except Exception:
                        pass
                    
                    content = (n.text or "").strip()
                    if not content:
                        continue
                    
                    # Use semantic node as-is (no max_chars splitting)
                    chunk_text = content
                    
                    chunk_images = [
                        img for img in section_images
                        if img.get("figure_id") and img["figure_id"] in chunk_text
                    ]
                    
                    chunks.append({
                        "doc_id": doc_id,
                        "title": current_title,
                        "page": current_page,
                        "text": chunk_text,
                        "images": chunk_images if chunk_images else None
                    })
                continue
            except Exception:
                use_splitter = None
        
        # --- Fallback heuristic: chia theo paragraphs ---
        try:
            _check_cancel("Before fallback chunking")
        except Exception:
            pass
        
        paragraphs = re.split(r'\n\s*\n+', body)
        current: List[str] = []
        
        def flush_current():
            try:
                _check_cancel("During flush_current")
            except Exception:
                pass
            
            if not current:
                return
            concatenated = "\n".join(current).strip()
            if not concatenated:
                current.clear()
                return
            
            start = 0
            while start < len(concatenated):
                try:
                    _check_cancel("During paragraph chunking loop")
                except Exception:
                    pass
                end = min(len(concatenated), start + max_chars)
                chunk_text = concatenated[start:end]
                
                chunk_images = [
                    img for img in section_images
                    if img.get("figure_id") and img["figure_id"] in chunk_text
                ]
                
                chunks.append({
                    "doc_id": doc_id,
                    "title": current_title,
                    "page": current_page,
                    "text": chunk_text,
                    "images": chunk_images if chunk_images else None
                })
                
                if end >= len(concatenated):
                    break
                start = max(0, end - overlap)
            
            current.clear()
        
        for para in paragraphs:
            try:
                _check_cancel("Before processing paragraph")
            except Exception:
                pass
            
            if sum(len(p) + 1 for p in current) + len(para) > max_chars:
                flush_current()
            current.append(para)
            flush_current()
        
        current_page += 1
    
    total_time = time.time() - start_time
    if total_time > 2.0:
        print(f"[CHUNKING] ⚠️ Total chunking took {total_time:.2f}s (extract: {extract_time:.2f}s, split: {split_time:.2f}s, processing: {total_time - extract_time - split_time:.2f}s)")
    else:
        print(f"[CHUNKING] ✅ Created {len(chunks)} chunks in {total_time:.2f}s")
    return chunks