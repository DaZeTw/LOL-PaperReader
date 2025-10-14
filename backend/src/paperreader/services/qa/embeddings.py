from abc import ABC, abstractmethod
from typing import List
import os


class Embedder(ABC):
    @abstractmethod
    def embed(self, texts: List[str]) -> List[List[float]]:
        ...


class OpenAIEmbedder(Embedder):
    def __init__(self, model: str = "text-embedding-3-small") -> None:
        from openai import OpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        # Initialize lazily; raise on use
        self.model = model
        self.client = OpenAI(api_key=api_key) if api_key else None

    def embed(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        if self.client is None:
            raise RuntimeError("OPENAI_API_KEY not set")
        response = self.client.embeddings.create(model=self.model, input=texts)
        return [d.embedding for d in response.data]


class SentenceTransformersEmbedder(Embedder):
    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5") -> None:
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer(model_name)

    def embed(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        return self.model.encode(texts, show_progress_bar=False, normalize_embeddings=True).tolist()


def get_embedder(name: str) -> Embedder:
    if name == "openai":
        return OpenAIEmbedder()
    if name == "bge-small":
        return SentenceTransformersEmbedder("BAAI/bge-small-en-v1.5")
    if name == "bge-large":
        return SentenceTransformersEmbedder("BAAI/bge-large-en-v1.5")
    raise ValueError(f"Unknown embedder: {name}")
