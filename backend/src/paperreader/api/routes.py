from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from paperreader.services.qa.config import PipelineConfig
from paperreader.services.qa.pipeline import QAPipeline
from pydantic import BaseModel

router = APIRouter()


class AskRequest(BaseModel):
    question: str
    # registries
    embedder: Literal["openai", "bge-small", "bge-large"] = "bge-small"
    retriever: Literal["keyword", "dense", "hybrid"] = "hybrid"
    generator: Literal["openai", "ollama", "extractive"] = "openai"
    image_policy: Literal["none", "auto", "all"] = "auto"
    top_k: int = 5
    max_tokens: int = 512


class AskResponse(BaseModel):
    question: str
    answer: str
    cited_sections: List[dict]
    retriever_scores: List[dict]


class BenchmarkRequest(BaseModel):
    questions: List[str]
    embedder: Literal["openai", "bge-small", "bge-large"] = "bge-small"
    retriever: Literal["keyword", "dense", "hybrid"] = "hybrid"
    generator: Literal["openai", "ollama", "extractive"] = "openai"
    top_k: int = 5


@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest):
    try:
        config = PipelineConfig(
            embedder_name=req.embedder,
            retriever_name=req.retriever,
            generator_name=req.generator,
            image_policy=req.image_policy,
            top_k=req.top_k,
            max_tokens=req.max_tokens,
        )
        pipeline = QAPipeline(config)
        result = await pipeline.answer(req.question)
        return AskResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/benchmark")
async def benchmark(req: BenchmarkRequest):
    try:
        config = PipelineConfig(
            embedder_name=req.embedder,
            retriever_name=req.retriever,
            generator_name=req.generator,
            top_k=req.top_k,
        )
        pipeline = QAPipeline(config)
        report = await pipeline.benchmark(req.questions)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
