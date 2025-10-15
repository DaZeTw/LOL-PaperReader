from dataclasses import dataclass
from typing import Literal
import os
from pathlib import Path


@dataclass
class PipelineConfig:
    embedder_name: Literal["openai", "bge-small", "bge-large"] = "bge-small"
    retriever_name: Literal["keyword", "dense", "hybrid"] = "hybrid"
    generator_name: Literal["openai", "ollama", "extractive"] = "openai"
    # Image policy controls how images are handled post-retrieval
    # none: do not pass images to generator
    # auto: pass images; generator will score/select
    # all: pass images and force-include all on generator side
    image_policy: Literal["none", "auto", "all"] = "auto"
    # Reranker configuration
    # none: no reranking (default)
    # cross-encoder: use cross-encoder model for reranking
    # cohere: use Cohere's rerank API
    reranker_name: Literal["none", "cross-encoder", "cohere"] = "none"
    reranker_top_k: int = 5  # Number of results to return after reranking
    top_k: int = 10  # Initial retrieval size (retrieve more, then rerank to reranker_top_k)
    max_tokens: int = 512

    data_dir: str = os.getenv(
        "RAG_DATA_DIR",
        str(Path(__file__).resolve().parent / "parser" / "output_parser")
    )

    runs_dir: str = os.getenv(
        "RAG_RUNS_DIR",
        str(Path(__file__).resolve().parent.parent / "runs")
    )
