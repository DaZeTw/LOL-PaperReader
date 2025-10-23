from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import os


class Reranker(ABC):
    """Abstract base class for reranking retrieved documents."""

    @abstractmethod
    def rerank(self, question: str, hits: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        """
        Rerank the retrieved hits based on relevance to the question.

        Args:
            question: The user's question
            hits: List of retrieved documents with 'text' and 'metadata'
            top_k: Number of top results to return after reranking

        Returns:
            Reranked list of hits with updated scores
        """
        pass


class NoReranker(Reranker):
    """Pass-through reranker that returns hits unchanged."""

    def rerank(self, question: str, hits: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        return hits[:top_k]


class CrossEncoderReranker(Reranker):
    """Reranker using a cross-encoder model for better relevance scoring."""

    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2", device: Optional[str] = None):
        """
        Initialize the cross-encoder reranker.

        Args:
            model_name: HuggingFace model name for cross-encoder
            device: Device to run the model on ('cuda', 'cpu', or None for auto)
        """
        try:
            from sentence_transformers import CrossEncoder
            import torch

            if device is None:
                device = "cuda" if torch.cuda.is_available() else "cpu"

            self.model = CrossEncoder(model_name, device=device)
            self.model_name = model_name
            print(f"[LOG] CrossEncoderReranker initialized with model '{model_name}' on device '{device}'")
        except ImportError as e:
            raise ImportError(
                "sentence-transformers is required for CrossEncoderReranker. "
                "Install it with: pip install sentence-transformers"
            ) from e
        except Exception as e:
            print(f"[ERROR] Failed to initialize CrossEncoderReranker: {e}")
            raise

    def rerank(self, question: str, hits: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        """
        Rerank hits using cross-encoder model.

        The cross-encoder scores query-document pairs directly, which is more
        accurate than bi-encoder similarity but slower.
        """
        if not hits:
            return []

        # Prepare query-document pairs
        pairs = []
        for hit in hits:
            text = hit.get("text", "")
            pairs.append([question, text])

        # Get cross-encoder scores
        try:
            scores = self.model.predict(pairs)

            # Update hits with new scores
            reranked_hits = []
            for hit, score in zip(hits, scores):
                reranked_hit = hit.copy()
                reranked_hit["original_score"] = hit.get("score", 0.0)
                reranked_hit["rerank_score"] = float(score)
                reranked_hit["score"] = float(score)  # Update primary score
                reranked_hits.append(reranked_hit)

            # Sort by rerank score in descending order
            reranked_hits.sort(key=lambda x: x["rerank_score"], reverse=True)

            return reranked_hits[:top_k]

        except Exception as e:
            print(f"[WARNING] Reranking failed: {e}. Returning original hits.")
            return hits[:top_k]


class CohereReranker(Reranker):
    """Reranker using Cohere's rerank API."""

    def __init__(self, model: str = "rerank-english-v3.0", api_key: Optional[str] = None):
        """
        Initialize the Cohere reranker.

        Args:
            model: Cohere rerank model name
            api_key: Cohere API key (defaults to COHERE_API_KEY env var)
        """
        try:
            import cohere

            api_key = api_key or os.getenv("COHERE_API_KEY")
            if not api_key:
                raise ValueError("COHERE_API_KEY environment variable is not set")

            self.client = cohere.Client(api_key)
            self.model = model
            print(f"[LOG] CohereReranker initialized with model '{model}'")
        except ImportError as e:
            raise ImportError(
                "cohere is required for CohereReranker. "
                "Install it with: pip install cohere"
            ) from e
        except Exception as e:
            print(f"[ERROR] Failed to initialize CohereReranker: {e}")
            raise

    def rerank(self, question: str, hits: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        """
        Rerank hits using Cohere's rerank API.
        """
        if not hits:
            return []

        try:
            # Extract documents
            documents = [hit.get("text", "") for hit in hits]

            # Call Cohere rerank API
            results = self.client.rerank(
                query=question,
                documents=documents,
                model=self.model,
                top_n=top_k
            )

            # Map results back to hits
            reranked_hits = []
            for result in results.results:
                idx = result.index
                original_hit = hits[idx].copy()
                original_hit["original_score"] = hits[idx].get("score", 0.0)
                original_hit["rerank_score"] = float(result.relevance_score)
                original_hit["score"] = float(result.relevance_score)
                reranked_hits.append(original_hit)

            return reranked_hits

        except Exception as e:
            print(f"[WARNING] Cohere reranking failed: {e}. Returning original hits.")
            return hits[:top_k]


def get_reranker(name: str, **kwargs) -> Reranker:
    """
    Factory function to get a reranker instance.

    Args:
        name: Reranker type ('none', 'cross-encoder', 'cohere')
        **kwargs: Additional arguments for the reranker

    Returns:
        Reranker instance
    """
    if name == "none":
        return NoReranker()
    elif name == "cross-encoder":
        model_name = kwargs.get("model_name", "cross-encoder/ms-marco-MiniLM-L-6-v2")
        device = kwargs.get("device")
        return CrossEncoderReranker(model_name=model_name, device=device)
    elif name == "cohere":
        model = kwargs.get("model", "rerank-english-v3.0")
        api_key = kwargs.get("api_key")
        return CohereReranker(model=model, api_key=api_key)
    else:
        raise ValueError(f"Unknown reranker: {name}. Choose from 'none', 'cross-encoder', 'cohere'")
