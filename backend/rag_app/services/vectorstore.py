from typing import List, Dict, Any, Tuple
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

import openai  # hoặc client tương tự bạn đang dùng

def gpt_generate_keywords(query: str, max_keywords: int = 5) -> List[str]:
    """
    Sử dụng GPT để sinh ra các từ khóa từ query.
    Trả về danh sách các từ khóa (không quá max_keywords).
    """
    prompt = (
        f"Extract the most important keywords from the following question. "
        f"Return them as a comma-separated list, no explanation.\n\nQuestion: {query}"
    )

    try:
        resp = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that extracts keywords."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
            max_tokens=50,
        )
        text = resp.choices[0].message.content.strip()
        keywords = [kw.strip() for kw in text.split(",") if kw.strip()]
        print(f"[DEBUG] GPT generated keywords for '{query}': {keywords}")
        return keywords[:max_keywords]
    except Exception as e:
        print(f"[WARNING] GPT keyword generation failed: {e}")
        return [query]

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
        print(f"[DEBUG] Dense search sims: {[(i, float(sims[i])) for i in idxs]}")
        return [(int(i), float(sims[i])) for i in idxs]

    def keyword_search(self, query: str, top_k: int = 5, generated_keywords: list[str] | None = None) -> List[Tuple[int, float]]:
        if self.tfidf_matrix is None or self.tfidf_vectorizer is None:
            return []

        if not generated_keywords:
            generated_keywords = [query]

        sims_total = np.zeros(self.tfidf_matrix.shape[0])
        for kw in generated_keywords:
            q_vec = self.tfidf_vectorizer.transform([kw])
            sims = cosine_similarity(q_vec, self.tfidf_matrix)[0]
            sims_total += sims
            print(f"[DEBUG] Keyword '{kw}' sims: {sims}")

        idxs = np.argsort(-sims_total)[:top_k]
        result = [(int(i), float(sims_total[i])) for i in idxs]
        print(f"[DEBUG] Keyword search top-{top_k}: {result}")
        return result

    def hybrid_search(self, query: str, query_vec: np.ndarray, top_k: int = 5, alpha: float = 0.5) -> List[Tuple[int, float]]:
        print(f"[DEBUG] Starting hybrid search for query: '{query}'")
        keywords = gpt_generate_keywords(query)
        kd = self.keyword_search(query, top_k=top_k*2, generated_keywords=keywords)
        dd = self.dense_search(query_vec, top_k=top_k*2)

        scores: Dict[int, float] = {}
        for i, s in kd:
            scores[i] = scores.get(i, 0.0) + (1 - alpha) * s
        for i, s in dd:
            scores[i] = scores.get(i, 0.0) + alpha * s

        merged = sorted(scores.items(), key=lambda kv: -kv[1])[:top_k]
        print(f"[DEBUG] Hybrid merged top-{top_k}: {merged}")
        return merged
