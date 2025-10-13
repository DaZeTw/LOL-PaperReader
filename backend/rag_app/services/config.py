from dataclasses import dataclass
from typing import Literal
import os


@dataclass
class PipelineConfig:
    embedder_name: Literal["openai", "bge-small", "bge-large"] = "bge-small"
    retriever_name: Literal["keyword", "dense", "hybrid"] = "hybrid"
    generator_name: Literal["openai", "ollama", "extractive"] = "openai"
    top_k: int = 5
    max_tokens: int = 512
    data_dir: str = os.getenv("RAG_DATA_DIR", "/tmp_data/parsed_pdfs")
    runs_dir: str = os.getenv("RAG_RUNS_DIR", "/tmp_data/runs")
