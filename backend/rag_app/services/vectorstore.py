from typing import List, Dict, Any, Tuple
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class InMemoryVectorStore:
    def __init__(self, dense_vectors: np.ndarray, metadatas: List[Dict[str, Any]], tfidf_matrix=None, tfidf_vectorizer: TfidfVectorizer | None = None) -> None:
        self.dense_vectors = dense_vectors
        self.metadatas = metadatas
        self.tfidf_matrix = tfidf_matrix
        self.tfidf_vectorizer = tfidf_vectorizer

    def dense_search(self, query_vec: np.ndarray, top_k: int = 5) -> List[Tuple[int, float]]:
        if self.dense_vectors.size == 0:
            return []
        sims = cosine_similarity(query_vec.reshape(1, -1), self.dense_vectors)[0]
        idxs = np.argsort(-sims)[:top_k]
        return [(int(i), float(sims[i])) for i in idxs]

    def keyword_search(self, query: str, top_k: int = 5) -> List[Tuple[int, float]]:
        if self.tfidf_matrix is None or self.tfidf_vectorizer is None:
            return []
        q_vec = self.tfidf_vectorizer.transform([query])
        sims = cosine_similarity(q_vec, self.tfidf_matrix)[0]
        idxs = np.argsort(-sims)[:top_k]
        return [(int(i), float(sims[i])) for i in idxs]

    def hybrid_search(self, query: str, query_vec: np.ndarray, top_k: int = 5, alpha: float = 0.5) -> List[Tuple[int, float]]:
        kd = self.keyword_search(query, top_k=top_k*2)
        dd = self.dense_search(query_vec, top_k=top_k*2)
        scores: Dict[int, float] = {}
        for i, s in kd:
            scores[i] = scores.get(i, 0.0) + (1 - alpha) * s
        for i, s in dd:
            scores[i] = scores.get(i, 0.0) + alpha * s
        merged = sorted(scores.items(), key=lambda kv: -kv[1])[:top_k]
        return merged
