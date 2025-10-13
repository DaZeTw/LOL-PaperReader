import json
from pathlib import Path
from typing import List, Dict, Any

from .config import PipelineConfig


def load_parsed_jsons(config: PipelineConfig) -> List[Dict[str, Any]]:
    base = Path(config.data_dir)
    if not base.exists():
        # fallback to a sample from existing md to demonstrate
        sample_text = (Path("/workspace/backend/services/parser/output_parser/1706.03762v7-referenced.md").read_text(encoding="utf-8")
                       if Path("/workspace/backend/services/parser/output_parser/1706.03762v7-referenced.md").exists()
                       else "")
        return [{
            "doc_id": "fallback-1706.03762v7",
            "sections": [
                {"title": "Document", "text": sample_text, "page": 1}
            ]
        }]

    docs: List[Dict[str, Any]] = []
    for path in base.glob("*.json"):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                # expected schema: { doc_id, sections: [{title, text, page}] }
                docs.append(data)
        except Exception:
            continue
    return docs
