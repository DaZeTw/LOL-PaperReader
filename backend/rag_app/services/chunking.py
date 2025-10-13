from typing import Dict, Any, List, Tuple, Optional
import re

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

# --- Utility: clean text ---
def clean_text(text: str) -> str:
    """
    Loại bỏ hình ảnh Markdown và base64, giữ lại text mô tả.
    """
    # Loại bỏ Markdown ![Alt](data:image/...)
    text = re.sub(r'!\[.*?\]\(data:image/.*?\)', '', text, flags=re.DOTALL)
    # Loại bỏ <img src="data:..."> nếu có
    text = re.sub(r'<img.*?src=["\']data:image/.*?["\'].*?>', '', text, flags=re.DOTALL)
    # Loại bỏ nhiều khoảng trắng / newline thừa
    text = re.sub(r'\n\s*\n+', '\n\n', text)
    return text.strip()

# --- Main chunking function ---
def split_sections_into_chunks(
    docs: List[Dict[str, Any]],
    max_chars: int = 1200,
    overlap: int = 200,
    semantic_splitter: Optional[Any] = None
) -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []
    heading_pattern = re.compile(
        r"^\s{0,3}(#+|\d+\.|[A-Z]\.\s)\s+|^\s*(Abstract|Introduction|Conclusion|References)\b",
        re.I
    )

    for doc in docs:
        doc_id = doc.get("doc_id", "doc")
        use_splitter = semantic_splitter if semantic_splitter is not None else (_SPLITTER if _HAS_SEMANTIC else None)

        for sec in doc.get("sections", []):
            text: str = sec.get("text", "") or ""
            text = clean_text(text)  # loại bỏ hình ảnh base64
            title: str = sec.get("title", "") or ""
            page = sec.get("page")
            if not text.strip():
                continue

            # --- Semantic splitting ---
            if use_splitter is not None:
                try:
                    from llama_index.core import Document
                    nodes = use_splitter.get_nodes_from_documents([Document(text=text)])
                    for n in nodes:
                        content = (n.text or "").strip()
                        if not content:
                            continue
                        start = 0
                        while start < len(content):
                            end = min(len(content), start + max_chars)
                            chunk_text = content[start:end]
                            chunks.append({
                                "doc_id": doc_id,
                                "title": title,
                                "page": page,
                                "text": chunk_text
                            })
                            if end >= len(content):
                                break
                            start = max(0, end - overlap)
                    continue
                except Exception:
                    use_splitter = None

            # --- Heuristic fallback ---
            paragraphs = re.split(r"\n\s*\n+", text)
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
                    chunks.append({
                        "doc_id": doc_id,
                        "title": title,
                        "page": page,
                        "text": chunk_text
                    })
                    if end >= len(concatenated):
                        break
                    start = max(0, end - overlap)
                current.clear()

            for para in paragraphs:
                if heading_pattern.search(para.strip()[:80]):
                    flush_current()
                    current.append(para)
                    flush_current()
                else:
                    if sum(len(p) + 1 for p in current) + len(para) > max_chars:
                        flush_current()
                    current.append(para)
            flush_current()

    return chunks
