from dataclasses import dataclass
from typing import Literal
import os
from pathlib import Path


@dataclass
class PipelineConfig:
    # Retrieval / generator configs
    embedder_name: Literal["visualized_bge"] = "visualized_bge"
    retriever_name: Literal["dense"] = "dense"
    generator_name: Literal["openai", "ollama", "extractive"] = "openai"

    # Image handling policy: none / auto / all
    image_policy: Literal["none", "auto", "all"] = "auto"

    # QA / RAG pipeline
    top_k: int = 5
    max_tokens: int = 512

    # Directories
    data_dir: Path = Path(r".\paperreader\services\parser\output")
    runs_dir: Path = Path(r".\paperreader\services\parser\runs")
