from typing import Dict, Any, List, Optional
from pathlib import Path
import re
import os

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
    """Extract images from markdown text, skipping base64-encoded inline images."""
    images: List[Dict[str, str]] = []
    img_pattern = re.compile(r'!\[(.*?)\]\((.*?)\)', flags=re.DOTALL)
    cleaned_parts: List[str] = []
    last_idx = 0

    for m in img_pattern.finditer(text):
        start, end = m.span()
        alt_text, data = m.groups()

        cleaned_parts.append(text[last_idx:start])

        # Skip base64-encoded images
        if data.startswith('data:'):
            last_idx = end
            continue

        # Tìm figure_id
        context = text[:start]
        window = context[max(0, len(context)-1000):]
        candidate_caption = alt_text.strip()
        figure_id = ""

        for line in reversed(window.splitlines()):
            stripped = line.strip()
            if not stripped: continue
            if stripped.startswith('#'): break
            m_fig = re.match(r'^(Figure\s+\d+)\s*:\s*(.*)', stripped, flags=re.IGNORECASE)
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
    text_clean = re.sub(r'\n\s*\n+', '\n\n', ''.join(cleaned_parts)).strip()
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

    for doc in docs:
        doc_id = doc.get("doc_id", "doc")

        for sec in doc.get("sections", []):
            text = sec.get("text", "") or ""
            title = sec.get("title", "") or ""
            page = sec.get("page")

            # Tách ảnh
            text_clean, extracted_images = extract_images(text)
            for img in extracted_images:
                img.setdefault("page", page)
            images = sec.get("images", []) + extracted_images

            if not text_clean.strip() and not images:
                continue

            # --- Semantic splitting ---
            if use_splitter and text_clean.strip():
                try:
                    nodes = use_splitter.get_nodes_from_documents([Document(text=text_clean)])
                    for n in nodes:
                        content = (n.text or "").strip()
                        if not content:
                            continue
                        start = 0
                        while start < len(content):
                            end = min(len(content), start + max_chars)
                            chunk_text = content[start:end]

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

                            if end >= len(content):
                                break
                            start = max(0, end - overlap)
                    continue
                except Exception:
                    use_splitter = None

            # --- Fallback heuristic: chia theo paragraphs ---
            paragraphs = re.split(r'\n\s*\n+', text_clean)
            current: List[str] = []

            def flush_current():
                if not current:
                    return
                concatenated = "\n".join(current).strip()
                if not concatenated:
                    current.clear()
                    return

                start = 0
                while start < len(concatenated):
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
                if sum(len(p) + 1 for p in current) + len(para) > max_chars:
                    flush_current()
                current.append(para)
            flush_current()

    return chunks
