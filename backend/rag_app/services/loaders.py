import json
from pathlib import Path
from typing import List, Dict, Any

from .config import PipelineConfig


def load_parsed_jsons(config: PipelineConfig) -> List[Dict[str, Any]]:
    base = Path(config.data_dir)
    docs: List[Dict[str, Any]] = []

    if not base.exists():
        # fallback to a sample MD file (Windows path)
        sample_path = Path(r".\backend\services\parser\output_parser\1706.03762v7-embedded.md")
        sample_text = sample_path.read_text(encoding="utf-8") if sample_path.exists() else ""
        return [{
            "doc_id": "fallback-1706.03762v7",
            "sections": [
                {"title": "Document", "text": sample_text, "page": 1}
            ]
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

    # load MD files too (so you don't rely only on JSON)
    for path in base.glob("*.md"):
        print("[DEBUG] Loading MD file:", path)
        try:
            text = path.read_text(encoding="utf-8")
            docs.append({
                "doc_id": path.stem,
                "sections": [{"title": "Document", "text": text, "page": 1}]
            })
        except Exception as e:
            print(f"[WARNING] Failed to read {path}: {e}")

    return docs
