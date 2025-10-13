from abc import ABC, abstractmethod
from typing import List
import os


class Generator(ABC):
    @abstractmethod
    def generate(self, question: str, contexts: List[str], max_tokens: int = 512) -> str:
        ...


class OpenAIGenerator(Generator):
    def __init__(self, model: str = "gpt-4o-mini") -> None:
        from openai import OpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        # Lazily handle missing key during generate; allow initialization
        self.client = OpenAI(api_key=api_key) if api_key else None
        self.model = model

    def generate(self, question: str, contexts: List[str], max_tokens: int = 512) -> str:
        if self.client is None:
            raise RuntimeError("OPENAI_API_KEY not set")
        system = (
            "You are a helpful assistant. Answer strictly using the provided contexts. "
            "Cite spans where applicable. If unknown, say you don't know."
        )
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


class OllamaGenerator(Generator):
    def __init__(self, model: str = "llama3.1:8b-instruct") -> None:
        import ollama
        self.ollama = ollama
        self.model = model

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


def get_generator(name: str) -> Generator:
    if name == "openai":
        return OpenAIGenerator()
    if name == "ollama":
        return OllamaGenerator()
    if name == "extractive":
        return ExtractiveGenerator()
    raise ValueError(f"Unknown generator: {name}")
