from typing import Dict, Any, List, Optional
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

# --- Utility: extract images from Markdown ---
def extract_images(text: str) -> (str, List[Dict[str, str]]):
    """
    Tách các Markdown ![alt](path) ra riêng và cố gắng lấy chú thích từ dòng "Figure ...:" ngay trước ảnh.
    Trả về text sạch và list images [{'caption': ..., 'data': ...}].
    """
    images: List[Dict[str, str]] = []
    img_pattern = re.compile(r'!\[(.*?)\]\((.*?)\)', flags=re.DOTALL)

    # Duyệt theo match để lấy ngữ cảnh trước ảnh
    cleaned_parts: List[str] = []
    last_idx = 0
    for m in img_pattern.finditer(text):
        start, end = m.span()
        alt_text, data = m.groups()

        # Thêm phần text trước ảnh vào kết quả sạch
        cleaned_parts.append(text[last_idx:start])

        # Tìm chú thích "Figure X: ..." gần nhất phía trước
        context = text[:start]
        # Lấy khoảng 500 ký tự trước đó để tìm dòng Figure
        window = context[max(0, len(context) - 1000):]
        candidate_caption = alt_text.strip()
        figure_line = None
        figure_id = None
        # duyệt ngược từng dòng để tìm dòng bắt đầu bằng "Figure" và chứa dấu ':'
        for line in reversed(window.splitlines()):
            stripped = line.strip()
            if not stripped:
                continue
            # Nếu là heading mới, dừng tìm để tránh vượt qua section
            if stripped.startswith('#'):
                break
            if re.match(r'^Figure\s+[^:]+:', stripped, flags=re.IGNORECASE):
                figure_line = stripped
                # Lấy Figure id (vd: "Figure 3")
                m_id = re.match(r'^(Figure\s+\d+)', stripped, flags=re.IGNORECASE)
                if m_id:
                    figure_id = m_id.group(1)
                break
        if figure_line:
            # Bỏ phần tiền tố "Figure X:" khỏi chú thích
            candidate_caption = re.sub(r'^Figure\s+\d+\s*:\s*', '', figure_line, flags=re.IGNORECASE).strip()
            # Loại câu ghi chú chung nếu có
            candidate_caption = re.sub(r'\bBest viewed in color\.?$', '', candidate_caption, flags=re.IGNORECASE).strip()
        images.append({'caption': candidate_caption or 'Image', 'data': data, 'figure_id': figure_id or ''})

        # Bỏ ảnh khỏi text sạch
        last_idx = end

    # phần còn lại sau ảnh cuối
    cleaned_parts.append(text[last_idx:])
    text_clean = ''.join(cleaned_parts)
    # Rút gọn khoảng trắng thừa do xóa ảnh
    text_clean = re.sub(r'\n\s*\n+', '\n\n', text_clean).strip()
    return text_clean, images

# --- Main chunking function ---
def split_sections_into_chunks(
    docs: List[Dict[str, Any]],
    max_chars: int = 1200,
    overlap: int = 200,
    semantic_splitter: Optional[Any] = None
) -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []
    # Fuzzy match threshold for caption-text overlap (0..1). Env override: RAG_CHUNK_IMAGE_CAPTION_JACCARD
    try:
        _CAPTION_JACCARD_TH = float(os.getenv("RAG_CHUNK_IMAGE_CAPTION_JACCARD", "0.2"))
    except Exception:
        _CAPTION_JACCARD_TH = 0.2

    def _tokenize(s: str) -> List[str]:
        s = (s or "").lower()
        s = re.sub(r"[^a-z0-9\s]", " ", s)
        tokens = [t for t in s.split() if t]
        return tokens

    def _jaccard(a: List[str], b: List[str]) -> float:
        if not a or not b:
            return 0.0
        sa, sb = set(a), set(b)
        inter = len(sa & sb)
        union = len(sa | sb) or 1
        return inter / union
    heading_pattern = re.compile(
        r"^\s{0,3}(#+|\d+\.|[A-Z]\.\s)\s+|^\s*(Abstract|Introduction|Conclusion|References)\b",
        re.I
    )

    for doc in docs:
        doc_id = doc.get("doc_id", "doc")
        use_splitter = semantic_splitter if semantic_splitter is not None else (_SPLITTER if _HAS_SEMANTIC else None)

        for sec in doc.get("sections", []):
            text: str = sec.get("text", "") or ""
            title: str = sec.get("title", "") or ""
            page = sec.get("page")
            # --- tách ảnh từ text ---
            text_clean, extracted_images = extract_images(text)
            # Gán thông tin trang cho ảnh trích xuất từ markdown để không bị lọc mất
            for img in extracted_images:
                img.setdefault("page", page)
            images: List[Dict] = sec.get("images", []) + extracted_images

            if not text_clean.strip() and not images:
                continue

            # --- Semantic splitting ---
            if use_splitter is not None and text_clean.strip():
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
                            # Gắn ảnh theo ưu tiên: 1) figure_id xuất hiện; 2) fuzzy match caption ~ text chunk (Jaccard)
                            chunk_images = []
                            for img in images:
                                if img.get("page") != page:
                                    continue
                                fig_id = (img.get("figure_id") or "").strip()
                                cap = (img.get("caption") or "").strip()
                                if fig_id and fig_id in chunk_text:
                                    chunk_images.append(img)
                                else:
                                    # Fuzzy: Jaccard giữa caption và chunk_text
                                    cap_tok = _tokenize(cap)
                                    txt_tok = _tokenize(chunk_text)
                                    if _jaccard(cap_tok, txt_tok) >= _CAPTION_JACCARD_TH:
                                        chunk_images.append(img)
                            chunks.append({
                                "doc_id": doc_id,
                                "title": title,
                                "page": page,
                                "text": chunk_text,
                                "images": chunk_images
                            })
                            if end >= len(content):
                                break
                            start = max(0, end - overlap)
                    continue
                except Exception:
                    use_splitter = None

            # --- Heuristic fallback ---
            paragraphs = re.split(r"\n\s*\n+", text_clean)
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
                    # Gắn ảnh theo ưu tiên: 1) figure_id; 2) fuzzy caption-text Jaccard
                    chunk_images = []
                    for img in images:
                        if img.get("page") != page:
                            continue
                        fig_id = (img.get("figure_id") or "").strip()
                        cap = (img.get("caption") or "").strip()
                        if fig_id and fig_id in chunk_text:
                            chunk_images.append(img)
                        else:
                            cap_tok = _tokenize(cap)
                            txt_tok = _tokenize(chunk_text)
                            if _jaccard(cap_tok, txt_tok) >= _CAPTION_JACCARD_TH:
                                chunk_images.append(img)
                    chunks.append({
                        "doc_id": doc_id,
                        "title": title,
                        "page": page,
                        "text": chunk_text,
                        "images": chunk_images
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
