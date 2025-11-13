import json
import re
from pathlib import Path
from typing import List, Dict, Any

from .config import PipelineConfig
from .chunking import split_markdown_into_chunks

# Import cancel check function
try:
    from .pipeline import _check_cancel
except ImportError:
    # Fallback if import fails
    def _check_cancel(operation: str = "operation") -> None:
        pass


def parse_markdown_to_doc(markdown_content: str, doc_id: str, source_path: str = None) -> Dict[str, Any]:
    """
    Convert markdown content directly to doc format without needing a file.
    
    Args:
        markdown_content: The markdown text content
        doc_id: Document identifier
        source_path: Optional source path (for reference)
    
    Returns:
        Dict in format: {"doc_id": str, "title": str, "sections": List[Dict], "source_path": str}
    """
    # tách theo các heading Markdown (## hoặc ###)
    parts = re.split(r'(?=^#{1,3}\s)', markdown_content, flags=re.MULTILINE)
    sections = []
    for i, chunk in enumerate(parts, 1):
        chunk = chunk.strip()
        if not chunk:
            continue

        # tách tiêu đề và nội dung
        lines = chunk.split("\n", 1)
        title = re.sub(r'^#{1,3}\s*', '', lines[0]).strip()
        body = lines[1].strip() if len(lines) > 1 else ""

        # bỏ các phần đầu không có heading (metadata, author list, etc.)
        if not title and len(body.split()) < 20:
            continue

        sections.append({
            "title": title or f"Section {i}",
            "text": body,
            "page": i
        })

    if sections:
        return {
            "doc_id": doc_id,
            "title": sections[0]["title"] if sections else doc_id,
            "sections": sections,
            "source_path": source_path or doc_id,
        }
    else:
        return None


def load_parsed_jsons(config: PipelineConfig) -> List[Dict[str, Any]]:
    base = Path(config.data_dir)
    docs: List[Dict[str, Any]] = []
    
    # Check if PDF name filter is set (for PDF-specific loading)
    pdf_name_filter = getattr(config, '_pdf_name_filter', None)

    if not base.exists():
        # fallback to a sample MD file (Windows path)
        sample_path = Path(r".\parser\output_parser\1706.03762v7-embedded.md")
        sample_text = sample_path.read_text(encoding="utf-8") if sample_path.exists() else ""
        return [{
            "doc_id": "fallback-1706.03762v7",
            "sections": [{"title": "Document", "text": sample_text, "page": 1}]
        }]

    # load JSON files
    for path in base.glob("*.json"):
        # Filter by PDF name if specified
        if pdf_name_filter and pdf_name_filter not in path.stem:
            continue
            
        # Check cancel before loading each JSON file
        try:
            _check_cancel(f"Before loading JSON file {path.name}")
        except Exception:
            pass
        
        print("[DEBUG] Loading JSON file:", path)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                docs.append(data)
        except Exception as e:
            print(f"[WARNING] Failed to load {path}: {e}")

    # load Markdown files (split by headings)
    print(f"[DEBUG] Looking for markdown files in: {base}")
    print(f"[DEBUG] PDF name filter: {pdf_name_filter}")
    md_files_found = list(base.glob("*.md"))
    print(f"[DEBUG] Found {len(md_files_found)} markdown file(s): {[f.name for f in md_files_found]}")
    
    for path in md_files_found:
        # Filter by PDF name if specified (files are named {pdf_name}-embedded.md)
        if pdf_name_filter:
            # Normalize for comparison (remove extension, lowercase)
            pdf_filter_normalized = pdf_name_filter.replace(".pdf", "").replace(".PDF", "").strip().lower()
            path_stem_normalized = path.stem.lower()
            
            # Check if file name starts with pdf_name (e.g., "2510.21223v1-embedded.md" matches "2510.21223v1")
            # Also handle exact match or prefix match
            matches = (
                path_stem_normalized.startswith(pdf_filter_normalized + "-") or  # "example-embedded" matches "example"
                path_stem_normalized.startswith(pdf_filter_normalized) or  # "example" matches "example"
                pdf_filter_normalized == path_stem_normalized  # Exact match
            )
            
            if not matches:
                print(f"[DEBUG] Skipping {path.name} (stem: '{path.stem}', doesn't match filter: '{pdf_name_filter}')")
                continue
            else:
                print(f"[DEBUG] ✅ Matched {path.name} with filter '{pdf_name_filter}'")
        # Check cancel before loading each MD file
        try:
            _check_cancel(f"Before loading MD file {path.name}")
        except Exception:
            pass
        
        print("[DEBUG] Loading MD file:", path)
        try:
            text = path.read_text(encoding="utf-8")
            # OPTIMIZED: Chunking trực tiếp từ markdown (bỏ qua doc format)
            # This is faster and avoids the intermediate doc format step
            chunks = split_markdown_into_chunks(text, path.stem, str(path))
            if chunks:
                # Convert chunks back to doc format for backward compatibility
                # Group chunks by doc_id and create sections
                doc_id = path.stem
                sections = []
                current_section = None
                for chunk in chunks:
                    title = chunk.get("title", "Document")
                    if current_section is None or current_section["title"] != title:
                        if current_section:
                            sections.append(current_section)
                        current_section = {
                            "title": title,
                            "text": chunk.get("text", ""),
                            "page": chunk.get("page", 1),
                            "images": chunk.get("images")
                        }
                    else:
                        # Append to current section
                        current_section["text"] += "\n\n" + chunk.get("text", "")
                
                if current_section:
                    sections.append(current_section)
                
                if sections:
                    doc = {
                        "doc_id": doc_id,
                        "title": sections[0]["title"] if sections else doc_id,
                        "sections": sections,
                        "source_path": str(path),
                    }
                    docs.append(doc)
                else:
                    print(f"[WARNING] No sections found in {path}")
            else:
                print(f"[WARNING] No chunks created from {path}")

        except Exception as e:
            print(f"[WARNING] Failed to read {path}: {e}")

    return docs
