from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from paperreader.services.qa.config import PipelineConfig
from paperreader.services.qa.pipeline import QAPipeline, get_pipeline
from pydantic import BaseModel

router = APIRouter()


class AskRequest(BaseModel):
    question: str
    retriever: Literal["keyword", "dense", "hybrid"] = "hybrid"
    generator: Literal["openai", "ollama", "extractive"] = "openai"
    image_policy: Literal["none", "auto", "all"] = "auto"

    top_k: int = 5
    max_tokens: int = 512
    # User-uploaded images (base64 encoded or URLs)
    user_images: Optional[List[str]] = None


class AskResponse(BaseModel):
    question: str
    answer: str
    cited_sections: List[dict]
    retriever_scores: List[dict]


class BenchmarkRequest(BaseModel):
    questions: List[str]
    retriever: Literal["keyword", "dense", "hybrid"] = "hybrid"
    generator: Literal["openai", "ollama", "extractive"] = "openai"
    top_k: int = 5


@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest):
    try:
        config = PipelineConfig(
            retriever_name=req.retriever,
            generator_name=req.generator,
            image_policy=req.image_policy,
            top_k=req.top_k,
            max_tokens=req.max_tokens,
        )
        pipeline = await get_pipeline(config)
        result = await pipeline.answer(req.question, user_images=req.user_images)
        return AskResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ask-with-upload")
async def ask_with_upload(
    question: str = Form(...),
    retriever: str = Form("hybrid"),
    generator: str = Form("openai"),
    image_policy: str = Form("auto"),
    top_k: int = Form(5),
    max_tokens: int = Form(512),
    images: List[UploadFile] = File(None),
):
    """
    Ask a question with optional image uploads.
    This endpoint accepts multipart/form-data for file uploads.
    """
    try:
        import base64
        from pathlib import Path

        # Convert uploaded images to base64 data URLs
        user_images = []
        if images:
            for img in images:
                content = await img.read()
                b64 = base64.b64encode(content).decode("ascii")
                # Infer mime type from filename
                ext = Path(img.filename).suffix.lower()
                mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}
                mime = mime_map.get(ext, "image/png")
                data_url = f"data:{mime};base64,{b64}"
                user_images.append(data_url)

        config = PipelineConfig(
            retriever_name=retriever,
            generator_name=generator,
            image_policy=image_policy,
            top_k=top_k,
            max_tokens=max_tokens,
        )
        pipeline = await get_pipeline(config)
        result = await pipeline.answer(question, user_images=user_images or None)
        return AskResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/benchmark")
async def benchmark(req: BenchmarkRequest):
    try:
        config = PipelineConfig(
            retriever_name=req.retriever,
            generator_name=req.generator,
            top_k=req.top_k,
        )
        pipeline = await get_pipeline(config)
        report = await pipeline.benchmark(req.questions)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
