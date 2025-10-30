import os
from typing import Any, Dict, List, Tuple

import numpy as np
from dotenv import load_dotenv
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Load env once; make OpenAI optional (no hard requirement at import time)
load_dotenv()
try:
    from openai import OpenAI  # type: ignore
except Exception:
    OpenAI = None  # type: ignore

_OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
_openai_client = None
if OpenAI is not None and _OPENAI_API_KEY:
    try:
        _openai_client = OpenAI(api_key=_OPENAI_API_KEY)
    except Exception:
        _openai_client = None


def gpt_generate_keywords(query: str, max_keywords: int = 5) -> List[str]:
    """
    Sử dụng GPT để sinh ra các từ khóa từ query.
    Trả về danh sách các từ khóa (không quá max_keywords).
    """
    prompt = (
        f"Extract the most important keywords from the following question. "
        f"Return them as a comma-separated list, no explanation.\n\nQuestion: {query}"
    )

    # If OpenAI client unavailable, use a simple heuristic fallback
    if _openai_client is None:
        # naive split and dedupe, keep up to max_keywords
        import re
        toks = re.findall(r"[A-Za-z0-9]+", query.lower())
        # simple stopword list
        stop = {"the", "a", "of", "and", "or", "to", "in", "for", "on", "by", "with", "as", "is", "are", "what", "which", "that"}
        kws: List[str] = []
        for t in toks:
            if t in stop:
                continue
            if t not in kws:
                kws.append(t)
            if len(kws) >= max_keywords:
                break
        return kws or [query]

    try:
        resp = _openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that extracts keywords.",
                },
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
    def __init__(
        self,
        dense_vectors: np.ndarray,
        metadatas: List[Dict[str, Any]],
        tfidf_matrix=None,
        tfidf_vectorizer: TfidfVectorizer | None = None,
    ) -> None:
        self.dense_vectors = dense_vectors
        self.metadatas = metadatas
        self.tfidf_matrix = tfidf_matrix
        self.tfidf_vectorizer = tfidf_vectorizer

    def dense_search(
        self, query_vec: np.ndarray, top_k: int = 5
    ) -> List[Tuple[int, float]]:
        print(f"[DEBUG] Dense search: query_vec shape={query_vec.shape}, dense_vectors shape={self.dense_vectors.shape}")
        if self.dense_vectors.size == 0:
            print(f"[WARNING] Dense vectors is empty!")
            return []
        sims = cosine_similarity(query_vec.reshape(1, -1), self.dense_vectors)[0]
        idxs = np.argsort(-sims)[:top_k]
        print(f"[DEBUG] Dense search sims: {[(i, float(sims[i])) for i in idxs]}")
        return [(int(i), float(sims[i])) for i in idxs]

    def keyword_search(
        self, query: str, top_k: int = 5, generated_keywords: list[str] | None = None
    ) -> List[Tuple[int, float]]:
        print(f"[DEBUG] Keyword search: query='{query}', top_k={top_k}")
        if self.tfidf_matrix is None or self.tfidf_vectorizer is None:
            print(f"[WARNING] TF-IDF matrix or vectorizer is None!")
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

    def hybrid_search(
        self, query: str, query_vec: np.ndarray, top_k: int = 5, alpha: float = 0.5
    ) -> List[Tuple[int, float]]:
        print(f"[DEBUG] Starting hybrid search for query: '{query}'")
        keywords = gpt_generate_keywords(query)
        kd = self.keyword_search(query, top_k=top_k * 2, generated_keywords=keywords)
        dd = self.dense_search(query_vec, top_k=top_k * 2)

        scores: Dict[int, float] = {}
        for i, s in kd:
            scores[i] = scores.get(i, 0.0) + (1 - alpha) * s
        for i, s in dd:
            scores[i] = scores.get(i, 0.0) + alpha * s

        merged = sorted(scores.items(), key=lambda kv: -kv[1])[:top_k]
        print(f"[DEBUG] Hybrid merged top-{top_k}: {merged}")
        return merged
