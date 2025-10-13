from typing import Dict, Any, List, Tuple
import re


def split_sections_into_chunks(docs: List[Dict[str, Any]], max_chars: int = 1200, overlap: int = 200) -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []
    heading_pattern = re.compile(r"^\s{0,3}(#+|\d+\.|[A-Z]\.\s)\s+|^\s*(Abstract|Introduction|Conclusion|References)\b", re.I)

    for doc in docs:
        doc_id = doc.get("doc_id", "doc")
        for sec in doc.get("sections", []):
            text: str = sec.get("text", "") or ""
            title: str = sec.get("title", "") or ""
            page = sec.get("page")

            # split by pseudo-paragraphs while preserving headings
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
