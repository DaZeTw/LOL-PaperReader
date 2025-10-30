from dataclasses import dataclass
from typing import Literal
import os
from pathlib import Path


@dataclass
class PipelineConfig:
    # Retrieval / generator configs
    embedder_name: Literal["visualized_bge"] = "visualized_bge"
    retriever_name: Literal["dense", "hybrid", "keyword"] = "hybrid"
    generator_name: Literal["openai", "ollama", "extractive"] = "openai"

    # Image handling policy: none / auto / all
    image_policy: Literal["none", "auto", "all"] = "auto"

    # QA / RAG pipeline
    top_k: int = 5
    max_tokens: int = 512

    # Directories (resolve relative to project backend/src root to be OS-agnostic)
    # This makes it work both on Windows and inside Linux-based Docker containers
    _BASE_DIR: Path = Path(__file__).resolve().parents[3]  # points to backend/src
    data_dir: Path = _BASE_DIR / "paperreader" / "services" / "parser" / "output"
    runs_dir: Path = _BASE_DIR / "paperreader" / "services" / "parser" / "runs"
