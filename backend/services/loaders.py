import json
import re
from pathlib import Path
from typing import List, Dict, Any

from .config import PipelineConfig


def load_parsed_jsons(config: PipelineConfig) -> List[Dict[str, Any]]:
    base = Path(config.data_dir)
    docs: List[Dict[str, Any]] = []

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
        print("[DEBUG] Loading JSON file:", path)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                docs.append(data)
        except Exception as e:
            print(f"[WARNING] Failed to load {path}: {e}")

    # load Markdown files (split by headings)
    for path in base.glob("*.md"):
        print("[DEBUG] Loading MD file:", path)
        try:
            text = path.read_text(encoding="utf-8")

            # tách theo các heading Markdown (## hoặc ###)
            parts = re.split(r'(?=^#{1,3}\s)', text, flags=re.MULTILINE)
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
                docs.append({
                    "doc_id": path.stem,
                    "title": sections[0]["title"] if sections else path.stem,
                    "sections": sections,
                    "source_path": str(path),
                })

            else:
                print(f"[WARNING] No sections found in {path}")

        except Exception as e:
            print(f"[WARNING] Failed to read {path}: {e}")

    return docs
