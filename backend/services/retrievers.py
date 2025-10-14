from dataclasses import dataclass
from typing import List, Dict, Any, Optional
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

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

    def retrieve(self, question: str, top_k: int = 5):
        if self.name == "keyword":
            hits = self.store.keyword_search(question, top_k)
            return [self._format_hit(i, s) for i, s in hits]
        if self.name == "dense":
            if self.embedder is None:
                raise ValueError("Dense retriever requires an embedder.")
            qv = np.array(self.embedder.embed([question])[0])
            hits = self.store.dense_search(qv, top_k)
            return [self._format_hit(i, s) for i, s in hits]
        if self.name == "hybrid":
            if self.embedder is None:
                raise ValueError("Hybrid retriever requires an embedder.")
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
    metadatas = [dict(c) for c in chunks]
    return Corpus(texts=texts, metadatas=metadatas)


def build_store(corpus: Corpus, embedder: Optional[Embedder]) -> InMemoryVectorStore:
    if corpus.texts and embedder is not None:
        dense_vectors = np.array(embedder.embed(corpus.texts))
    else:
        dense_vectors = np.empty((0, 0))

    tfidf = TfidfVectorizer(max_features=50000, ngram_range=(1, 2))
    tfidf_matrix = tfidf.fit_transform(corpus.texts) if corpus.texts else None

    return InMemoryVectorStore(dense_vectors=dense_vectors, metadatas=corpus.metadatas, tfidf_matrix=tfidf_matrix, tfidf_vectorizer=tfidf)


def get_retriever(name: str, store: InMemoryVectorStore, embedder: Embedder) -> Retriever:
    return Retriever(name=name, store=store, embedder=embedder)
