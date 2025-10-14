from abc import ABC, abstractmethod
from typing import List
import os


class Generator(ABC):
    @abstractmethod
    def generate(self, question: str, contexts: List[str], max_tokens: int = 512) -> str:
        ...


class OpenAIGenerator(Generator):
    def __init__(self, model: str = "gpt-4o-mini", image_include_all_override: bool | None = None) -> None:
        from openai import OpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        # Lazily handle missing key during generate; allow initialization
        self.client = OpenAI(api_key=api_key) if api_key else None
        self.model = model
        # feature flag to let callers know this generator can consume images
        self.supports_images = True
        # Image selection configs (env-overridable)
        # RAG_GEN_IMAGE_MAX: maximum images to attach (<=0 means unlimited)
        # RAG_GEN_IMAGE_MIN_SCORE: min relevance score to keep (only if include_all is False)
        # RAG_GEN_IMAGE_INCLUDE_ALL: if true, attach images without scoring (still dedup by path)
        try:
            self.image_max = int(os.getenv("RAG_GEN_IMAGE_MAX", "4"))
        except Exception:
            self.image_max = 4
        try:
            self.image_min_score = float(os.getenv("RAG_GEN_IMAGE_MIN_SCORE", "1"))
        except Exception:
            self.image_min_score = 1.0
        env_include_all = os.getenv("RAG_GEN_IMAGE_INCLUDE_ALL", "false").lower() in {"1","true","yes","y"}
        self.image_include_all = env_include_all if image_include_all_override is None else bool(image_include_all_override)

    def generate(self, question: str, contexts: List[str], max_tokens: int = 512) -> str:
        if self.client is None:
            raise RuntimeError("OPENAI_API_KEY not set")
        system = (
            "You are a helpful assistant. Answer strictly using the provided contexts (text and figures). "
            "Cite spans or figure identifiers where applicable. If unknown, say you don't know."
        )

        # If contexts are plain strings, fall back to text-only prompt
        plain_text_only = all(isinstance(c, str) for c in contexts)
        if plain_text_only:
            prompt = (
                "Answer the question using the contexts.\n\n" +
                "\n\n".join([f"[Context {i+1}]\n{c}" for i, c in enumerate(contexts)]) +
                f"\n\nQuestion: {question}\nAnswer:"
            )
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=max_tokens,
                temperature=0.2,
            )
            return resp.choices[0].message.content.strip()

        # Otherwise, build a multimodal message with text + images
        from pathlib import Path
        import base64
        import mimetypes
        import re

        # Simple relevance scoring: overlap between question tokens and caption/text tokens
        def tokenize(s: str):
            s = (s or "").lower()
            s = re.sub(r"[^a-z0-9\s]", " ", s)
            tokens = [t for t in s.split() if t]
            stop = {
                "the","a","an","of","and","or","to","in","on","for","with","by","at","is","are","be","as","that","this","these","those","we","our","their","its","it","from","into","over","under","than","then","also","most","more","less","very","based","using","used"
            }
            return [t for t in tokens if t not in stop]

        q_tokens = set(tokenize(question))

        def to_data_url(path_str: str) -> str:
            p = Path(path_str)
            if not p.exists():
                # try resolve relative to parser directory
                alt = Path(__file__).resolve().parent / "parser" / path_str
                p = alt if alt.exists() else Path(path_str)
            mime, _ = mimetypes.guess_type(str(p))
            mime = mime or "image/png"
            data = p.read_bytes()
            b64 = base64.b64encode(data).decode("ascii")
            return f"data:{mime};base64,{b64}"

        # contexts is List[Dict[str, Any]] with keys: text, images (list of {data, caption})
        user_content = []
        user_content.append({"type": "text", "text": "Answer the question using the following contexts."})
        # First add text for each context
        ctx_texts = []
        for i, ctx in enumerate(contexts):
            text = ctx.get("text") if isinstance(ctx, dict) else str(ctx)
            ctx_texts.append(text)
            user_content.append({"type": "text", "text": f"[Context {i+1}]\n{text}"})

        # Collect candidate images and select according to config
        candidates = []
        if self.image_include_all:
            # Include in original order across contexts (no scoring), dedup by path
            seen_paths = set()
            for i, ctx in enumerate(contexts):
                if not isinstance(ctx, dict):
                    continue
                for img in (ctx.get("images") or []):
                    path = img.get("data") or ""
                    if not path or path in seen_paths:
                        continue
                    seen_paths.add(path)
                    candidates.append((0.0, i, img))
        else:
            # Score-based selection: overlap(question, caption/text)
            for i, ctx in enumerate(contexts):
                if not isinstance(ctx, dict):
                    continue
                text = ctx.get("text") or ""
                t_tokens = set(tokenize(text))
                for img in (ctx.get("images") or [])[:5]:
                    cap = img.get("caption") or ""
                    c_tokens = set(tokenize(cap))
                    score = 2 * len(q_tokens & c_tokens) + 1 * len(q_tokens & t_tokens)
                    if score < self.image_min_score:
                        continue
                    candidates.append((float(score), i, img))

        # Sort by score desc (include_all keeps score=0, maintains insertion order when stable) and cap by max
        candidates.sort(key=lambda x: x[0], reverse=True)
        selected = []
        seen_paths = set()
        limit = self.image_max
        for score, i, img in candidates:
            path = img.get("data") or ""
            if not path or path in seen_paths:
                continue
            seen_paths.add(path)
            selected.append((i, img))
            if limit > 0 and len(selected) >= limit:
                break

        # Attach selected images grouped by their context index
        for i, img in selected:
            cap = img.get("caption") or "Figure"
            path = img.get("data") or ""
            try:
                data_url = to_data_url(path)
            except Exception:
                continue
            user_content.append({"type": "text", "text": f"[Figure] {cap}"})
            user_content.append({"type": "image_url", "image_url": {"url": data_url}})
        user_content.append({"type": "text", "text": f"Question: {question}\nAnswer:"})

        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
        )
        return resp.choices[0].message.content.strip()


class OllamaGenerator(Generator):
    def __init__(self, model: str = "llama3.1:8b-instruct") -> None:
        import ollama
        self.ollama = ollama
        self.model = model
        self.supports_images = False

    def generate(self, question: str, contexts: List[str], max_tokens: int = 512) -> str:
        prompt = (
            "You are a helpful assistant. Answer strictly using the contexts.\n\n" +
            "\n\n".join([f"[Context {i+1}]\n{c}" for i, c in enumerate(contexts)]) +
            f"\n\nQuestion: {question}\nAnswer:"
        )
        r = self.ollama.chat(model=self.model, messages=[{"role": "user", "content": prompt}], options={"num_predict": max_tokens})
        return r["message"]["content"].strip()


class ExtractiveGenerator(Generator):
    def generate(self, question: str, contexts: List[str], max_tokens: int = 512) -> str:
        # naive extractive approach: return most relevant sentence from contexts
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np

        sentences: List[str] = []
        for ctx in contexts:
            sentences.extend([s.strip() for s in ctx.split(". ") if s.strip()])
        if not sentences:
            return "I don't know."
        vec = TfidfVectorizer().fit(sentences + [question])
        mat = vec.transform(sentences)
        q = vec.transform([question])
        sims = cosine_similarity(q, mat)[0]
        idx = int(np.argmax(sims))
        return sentences[idx]


def get_generator(name: str, *, image_policy: str = "auto") -> Generator:
    if name == "openai":
        # Map policy to include_all behavior; pipeline controls whether images are provided at all
        include_all = True if image_policy == "all" else False
        return OpenAIGenerator(image_include_all_override=include_all)
    if name == "ollama":
        return OllamaGenerator()
    if name == "extractive":
        return ExtractiveGenerator()
    raise ValueError(f"Unknown generator: {name}")
