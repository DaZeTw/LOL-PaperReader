#retrievers.py
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from pathlib import Path

from .embeddings import get_embedder, Embedder
from .vectorstore import InMemoryVectorStore


@dataclass
class Corpus:
    texts: List[str]
    metadatas: List[Dict[str, Any]]


class Retriever:
    def __init__(self, name: str, store: InMemoryVectorStore, embedder: Optional[Embedder] = None):
        self.name = name
        self.store = store
        self.embedder = embedder

    def retrieve(self, question: str, top_k: int = 5, image: str | None = None):
        print(f"[DEBUG] Retrieving with {self.name} retriever, image: {image}")
        if self.name == "keyword":
            hits = self.store.keyword_search(question, top_k)
            return [self._format_hit(i, s) for i, s in hits]
        if self.name == "dense":
            if self.embedder is None:
                raise ValueError("Dense retriever requires an embedder.")
            # Use composed image+text embedding for the query if image provided
            if hasattr(self.embedder, "encode_query"):
                print(f"[DEBUG] Using encode_query with image={image}, text={question[:100]}...")
                qv = np.array(self.embedder.encode_query(image=image, text=question))
                print(f"[DEBUG] Query vector shape: {qv.shape}")
            else:
                print(f"[DEBUG] Using embed with text={question[:100]}...")
                qv = np.array(self.embedder.embed([question])[0])
            hits = self.store.dense_search(qv, top_k)
            return [self._format_hit(i, s) for i, s in hits]
        if self.name == "hybrid":
            if self.embedder is None:
                raise ValueError("Hybrid retriever requires an embedder.")
            if hasattr(self.embedder, "encode_query"):
                print(f"[DEBUG] Using encode_query with image={image}, text={question[:100]}...")
                qv = np.array(self.embedder.encode_query(image=image, text=question))
                print(f"[DEBUG] Query vector shape: {qv.shape}")
            else:
                print(f"[DEBUG] Using embed with text={question[:100]}...")
                qv = np.array(self.embedder.embed([question])[0])
            hits = self.store.hybrid_search(question, qv, top_k)
            return [self._format_hit(i, s) for i, s in hits]
        raise ValueError(f"Unknown retriever: {self.name}")

    def _format_hit(self, idx: int, score: float):
        meta = self.store.metadatas[idx]
        text = meta.get("text", "")
        return {
            "index": idx,
            "score": score,
            "text": text,
            "metadata": {k: v for k, v in meta.items() if k != "text"}
        }


def build_corpus(chunks: List[Dict[str, Any]]) -> Corpus:
    texts = [c.get("text", "") for c in chunks]

    def _normalize_images(images: Any) -> List[Dict[str, Any]]:
        norm: List[Dict[str, Any]] = []
        if not images:
            return norm
        for img in images:
            if isinstance(img, str):
                # If it's already a string, use it as-is (might be a full path)
                norm.append({"data": img})
            elif isinstance(img, dict):
                data = img.get("data") or ""
                # Use the data field as-is, don't modify the path
                item: Dict[str, Any] = {"data": data}
                if "caption" in img:
                    item["caption"] = img.get("caption")
                if "figure_id" in img:
                    item["figure_id"] = img.get("figure_id")
                norm.append(item)
        return norm

    metadatas: List[Dict[str, Any]] = []
    for c in chunks:
        m = dict(c)
        m["images"] = _normalize_images(m.get("images"))
        metadatas.append(m)
    return Corpus(texts=texts, metadatas=metadatas)


def build_store(corpus: Corpus, embedder: Optional[Embedder]) -> InMemoryVectorStore:
    # Build dense vectors; prefer image-aware chunk embedding if available
    dense_vectors: np.ndarray
    if embedder is not None and hasattr(embedder, "embed_chunks"):
        # reconstruct chunk dicts from metadatas to allow image+text encoding
        try:
            chunks = [dict(m, text=t) for t, m in zip(corpus.texts, corpus.metadatas)]
            dense_vectors = np.array(getattr(embedder, "embed_chunks")(chunks)) if chunks else np.empty((0, 0))
        except Exception:
            dense_vectors = np.array(embedder.embed(corpus.texts)) if corpus.texts else np.empty((0, 0))
    else:
        dense_vectors = np.array(embedder.embed(corpus.texts)) if (corpus.texts and embedder is not None) else np.empty((0, 0))

    # Keep TF-IDF for hybrid if ever needed by callers; but primary retrieval is dense
    tfidf = TfidfVectorizer(max_features=50000, ngram_range=(1, 2))
    tfidf_matrix = tfidf.fit_transform(corpus.texts) if corpus.texts else None

    return InMemoryVectorStore(
        dense_vectors=dense_vectors,
        metadatas=corpus.metadatas,
        tfidf_matrix=tfidf_matrix,
        tfidf_vectorizer=tfidf,
    )


def get_retriever(name: str, store: InMemoryVectorStore, embedder: Embedder) -> Retriever:
    return Retriever(name=name, store=store, embedder=embedder)
