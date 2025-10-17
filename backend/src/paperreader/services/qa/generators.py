from abc import ABC, abstractmethod
from typing import List
import os


class Generator(ABC):
    @abstractmethod
    def generate(self, question: str, contexts: List[str], max_tokens: int = 512, query_image: str | None = None, query_images: List[str] | None = None):
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

    def generate(self, question: str, contexts: List[str], max_tokens: int = 512, query_image: str | None = None, query_images: List[str] | None = None):
        if self.client is None:
            raise RuntimeError("OPENAI_API_KEY not set")
        system = (
            "You are a helpful assistant. Answer strictly using the provided contexts (text and figures). "
            "When referencing a context, add a citation marker like [c1], [c2], ... where the number corresponds to the context index shown. "
            "IMPORTANT: Only answer questions about images if the user has provided query images. "
            "If the user asks about 'this image' or 'the image' but no user query images are provided, respond with 'I don't know' or 'No image was provided in your query'. "
            "When multiple user query images are provided, analyze and compare them as requested. "
            "If unknown, say you don't know."
        )

        # If contexts are plain strings, fall back to text-only prompt
        plain_text_only = all(isinstance(c, str) for c in contexts)
        has_query_images = query_image is not None or (query_images and len(query_images) > 0)
        if plain_text_only and not has_query_images:
            prompt = (
                "Answer the question using the contexts. When you use information from a context, append [cN] where N is the context number.\n\n" +
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
            answer = resp.choices[0].message.content.strip()
            # extract citations [cN]
            import re as _re
            marker_pattern = _re.compile(r"\[c(\d+)\]")
            citations = [int(m.group(1)) - 1 for m in marker_pattern.finditer(answer)]
            return {"answer": answer, "citations": citations}

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
        user_content.append({"type": "text", "text": "Answer the question using the following contexts. Append [cN] markers referencing the context number when you use it."})
        # Process query images (either single query_image or multiple query_images)
        query_images_to_process = []
        if query_image:
            query_images_to_process.append(query_image)
        if query_images:
            query_images_to_process.extend(query_images)
        
        if query_images_to_process:
            print(f"[LOG] Processing {len(query_images_to_process)} query images")
            for i, img_path in enumerate(query_images_to_process):
                try:
                    print(f"[LOG] Processing query image {i+1}: {img_path}")
                    qi_url = to_data_url(img_path)
                    user_content.append({"type": "text", "text": f"[User Query Image {i+1} - This is image {i+1} that the user is asking about]"})
                    user_content.append({"type": "image_url", "image_url": {"url": qi_url}})
                    print(f"[LOG] Successfully added query image {i+1} to prompt")
                except Exception as e:
                    print(f"[WARNING] Failed to process query image {i+1} {img_path}: {e}")
                    pass
        else:
            # Explicitly tell the model that no user image was provided
            user_content.append({"type": "text", "text": "[No User Query Image provided - Only use retrieved context images for reference, not for answering image-specific questions]"})
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
            user_content.append({"type": "text", "text": f"[Retrieved Context Figure {i+1}] {cap}"})
            user_content.append({"type": "image_url", "image_url": {"url": data_url}})
        # Add specific instruction about image questions when no query image is provided
        if not has_query_images and any(keyword in question.lower() for keyword in ["this image", "the image", "image shows", "what does the image", "describe the image"]):
            user_content.append({"type": "text", "text": "IMPORTANT: The user is asking about an image but no user query image was provided. You should respond that you don't know or that no image was provided in the query."})
        
        user_content.append({"type": "text", "text": f"Question: {question}\nAnswer:"})

        print(f"[LOG] Sending request to OpenAI with {len(user_content)} content items")
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_content},
                ],
                max_tokens=max_tokens,
                temperature=0.2,
                timeout=60.0,  # 60 second timeout
            )
            print(f"[LOG] Received response from OpenAI")
        except Exception as e:
            print(f"[ERROR] OpenAI API call failed: {e}")
            raise
        answer = resp.choices[0].message.content.strip()
        import re as _re
        marker_pattern = _re.compile(r"\[c(\d+)\]")
        citations = [int(m.group(1)) - 1 for m in marker_pattern.finditer(answer)]
        return {"answer": answer, "citations": citations}


class OllamaGenerator(Generator):
    def __init__(self, model: str = "llama3.1:8b-instruct") -> None:
        import ollama
        self.ollama = ollama
        self.model = model
        self.supports_images = False

    def generate(self, question: str, contexts: List[str], max_tokens: int = 512, query_image: str | None = None, query_images: List[str] | None = None) -> str:
        prompt = (
            "You are a helpful assistant. Answer strictly using the contexts.\n\n" +
            "\n\n".join([f"[Context {i+1}]\n{c}" for i, c in enumerate(contexts)]) +
            f"\n\nQuestion: {question}\nAnswer:"
        )
        r = self.ollama.chat(model=self.model, messages=[{"role": "user", "content": prompt}], options={"num_predict": max_tokens})
        return r["message"]["content"].strip()


class ExtractiveGenerator(Generator):
    def generate(self, question: str, contexts: List[str], max_tokens: int = 512, query_image: str | None = None, query_images: List[str] | None = None) -> str:
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
