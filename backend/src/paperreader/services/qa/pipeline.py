import os
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, List

from .config import PipelineConfig
from .loaders import load_parsed_jsons
from .chunking import split_sections_into_chunks
# optional import of semantic splitter factory — pipeline will pass it down
try:
    import torch
    from llama_index.core.node_parser import SemanticSplitterNodeParser
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding
    SEMANTIC_AVAILABLE = True
except Exception:
    SemanticSplitterNodeParser = None
    HuggingFaceEmbedding = None
    SEMANTIC_AVAILABLE = False
from .embeddings import get_embedder
from .retrievers import build_corpus, build_store, get_retriever
from .generators import get_generator
from .rerankers import get_reranker


@dataclass
class PipelineArtifacts:
    chunks: List[Dict[str, Any]]
    corpus_texts: List[str]
    store_metadatas: List[Dict[str, Any]]


class QAPipeline:
    def __init__(self, config: PipelineConfig) -> None:
        self.config = config
        self._ensure_runs_dir()
        self._build()

    def _ensure_runs_dir(self) -> None:
        try:
            Path(self.config.runs_dir).mkdir(parents=True, exist_ok=True)
        except Exception:
            fallback = Path(__file__).resolve().parent.parent / "runs"
            fallback.mkdir(parents=True, exist_ok=True)
            self.config.runs_dir = str(fallback)

    def _build(self) -> None:
        print("[LOG] Loading parsed documents...")
        docs = load_parsed_jsons(self.config)
        print(f"[LOG] Number of documents loaded: {len(docs)}")
        #print("[DEBUG] Loaded document:", docs[1] if len(docs) > 1 else docs[0] if docs else "No documents")

        # Build a semantic splitter if the optional dependencies are present.
        semantic_splitter = None
        if SEMANTIC_AVAILABLE:
            try:
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5", device=device)
                semantic_splitter = SemanticSplitterNodeParser(buffer_size=1, breakpoint_percentile_threshold=95, embed_model=embed_model)
                print("[LOG] Semantic splitter initialized and will be used for chunking.")
            except Exception as e:
                print(f"[WARNING] Failed to initialize semantic splitter: {e}. Falling back to heuristic chunking.")

        chunks = split_sections_into_chunks(docs, semantic_splitter=semantic_splitter)
        print(f"[LOG] Chunks created: {chunks}")
        print(f"[LOG] Number of chunks created: {len(chunks)}")
        if len(chunks) > 0:
            print(f"[LOG] Chunks created: {chunks}")
        embedder = None
        if self.config.retriever_name in ("dense", "hybrid"):
            try:
                embedder = get_embedder(self.config.embedder_name)
                print(f"[LOG] Embedder '{self.config.embedder_name}' loaded successfully.")
            except Exception as e:
                print(f"[WARNING] Failed to load embedder '{self.config.embedder_name}': {e}")
                from .embeddings import SentenceTransformersEmbedder
                embedder = SentenceTransformersEmbedder("BAAI/bge-small-en-v1.5")
                print("[LOG] Fallback embedder 'BAAI/bge-small-en-v1.5' loaded.")

        corpus = build_corpus(chunks)
        print(f"[LOG] Corpus built with {len(corpus.texts)} texts.")

        store = build_store(corpus, embedder)
        print(f"[LOG] Store built with {len(store.metadatas)} metadatas.")

        retriever = get_retriever(self.config.retriever_name, store, embedder)
        generator = get_generator(self.config.generator_name, image_policy=self.config.image_policy)
        reranker = get_reranker(self.config.reranker_name)
        print(f"[LOG] Reranker '{self.config.reranker_name}' initialized.")

        self.embedder = embedder
        self.retriever = retriever
        self.generator = generator
        self.reranker = reranker
        self.artifacts = PipelineArtifacts(
            chunks=chunks,
            corpus_texts=corpus.texts,
            store_metadatas=store.metadatas
        )
        self.store = store

    async def answer(self, question: str, user_images: List[str] = None) -> Dict[str, Any]:
        print(f"[LOG] Retrieving hits for question: '{question}'")
        hits = self.retriever.retrieve(question, top_k=self.config.top_k)
        print(f"[LOG] Number of hits retrieved: {len(hits)}")
        if len(hits) > 0:
            print(f"[LOG] Top hit text: {hits[0].get('text', '')[:200]}")

        # Apply reranking if configured
        if self.config.reranker_name != "none":
            print(f"[LOG] Applying reranking with '{self.config.reranker_name}' reranker")
            hits = self.reranker.rerank(question, hits, top_k=self.config.reranker_top_k)
            print(f"[LOG] Number of hits after reranking: {len(hits)}")
            if len(hits) > 0:
                print(f"[LOG] Top reranked hit text: {hits[0].get('text', '')[:200]}")
                print(f"[LOG] Top reranked hit score: {hits[0].get('score', 0.0)}")

        # Build contexts for generation according to image_policy
        # none: pass text-only
        # auto/all: pass text+images (generator may select or include all)
        contexts = []
        supports_images = getattr(self.generator, "supports_images", False)
        policy = getattr(self.config, "image_policy", "auto")
        if supports_images and policy in ("auto", "all"):
            for h in hits:
                meta = h.get("metadata", {})
                images = meta.get("images", []) or []
                ctx = {"text": h.get("text", ""), "images": images}
                contexts.append(ctx)
        else:
            contexts = [h.get("text", "") for h in hits]

        try:
            answer = self.generator.generate(question, contexts, max_tokens=self.config.max_tokens, user_images=user_images)
        except Exception as e:
            print(f"[WARNING] Generator failed: {e}. Using ExtractiveGenerator fallback.")
            from .generators import ExtractiveGenerator
            # fallback uses text-only
            text_contexts = [h.get("text", "") for h in hits]
            answer = ExtractiveGenerator().generate(question, text_contexts, max_tokens=self.config.max_tokens)

        # If we had images in retrieval and generator supports images, append a brief Figures section to answer
        if supports_images:
            from pathlib import Path
            import base64
            import mimetypes

            def ensure_static_url(p: str) -> str:
                # If already a filesystem path under services/parser, map to /static URL
                if p and not p.startswith("data:"):
                    rel = p.replace("\\", "/").lstrip("/")
                    return f"/static/{rel}"
                # If data URL, persist to file under output_parser/generated and return URL
                if p.startswith("data:"):
                    try:
                        header, b64 = p.split(",", 1)
                        mime = header.split(":", 1)[1].split(";")[0]
                        ext = mimetypes.guess_extension(mime) or ".png"
                        out_dir = Path(__file__).resolve().parent / "parser" / "output_parser" / "generated"
                        out_dir.mkdir(parents=True, exist_ok=True)
                        # Use short hash for filename
                        import hashlib
                        digest = hashlib.sha1(b64.encode("ascii")).hexdigest()[:16]
                        out_path = out_dir / f"figure_{digest}{ext}"
                        if not out_path.exists():
                            out_path.write_bytes(base64.b64decode(b64))
                        rel = out_path.relative_to(Path(__file__).resolve().parent / "parser").as_posix()
                        return f"/static/{rel}"
                    except Exception:
                        return ""
                return ""

            figure_lines = []
            seen = set()  # dedupe by (caption,page,url base)
            def _base_url(u: str) -> str:
                return u.split("?")[0]
            for h in hits:
                meta = h.get("metadata", {})
                for img in meta.get("images", []) or []:
                    raw_path = img.get("data") or ""
                    url = ensure_static_url(raw_path)
                    if not url:
                        continue
                    cap = (img.get("caption") or "Figure").strip()
                    fig_id = (img.get("figure_id") or "").strip()
                    tag = fig_id if fig_id else "Figure"
                    base = _base_url(url)
                    page = meta.get("page")
                    key = (cap, page, base)
                    # Prefer artifact URLs over generated ones
                    if (cap, page, base) in seen:
                        continue
                    seen.add(key)
                    figure_lines.append(f"- {tag}: {cap} [url: {url}]")
            if figure_lines:
                answer = answer.rstrip() + "\n\nFigures (from retrieved contexts):\n" + "\n".join(figure_lines)

        try:
            run_path = Path(self.config.runs_dir) / "last_run_retrieval.json"
            with open(run_path, "w", encoding="utf-8") as f:
                json.dump({"question": question, "hits": hits}, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[WARNING] Failed to save retrieval log: {e}")

        # Build cited sections, de-duplicated by (title, page, normalized excerpt)
        cited = []
        seen_citations = set()
        import re as _re
        def _norm_excerpt(s: str) -> str:
            s = (s or "").strip()
            s = _re.sub(r"\s+", " ", s)
            return s
        for h in hits:
            meta = h.get("metadata", {})
            title = meta.get("title")
            page = meta.get("page")
            excerpt = _norm_excerpt(h.get("text", ""))
            key = (title, page, excerpt)
            if key in seen_citations:
                continue
            seen_citations.add(key)
            cited.append({
                "doc_id": meta.get("doc_id"),
                "title": title,
                "page": page,
                "excerpt": excerpt
            })

        return {
            "question": question,
            "answer": answer,
            "cited_sections": cited,
            "retriever_scores": [{"index": h["index"], "score": h["score"]} for h in hits]
        }


    async def benchmark(self, questions: List[str]) -> Dict[str, Any]:
        results: List[Dict[str, Any]] = []
        for q in questions:
            res = await self.answer(q)
            # simple self-eval metric: length of answer and coverage of retrieved contexts
            coverage_chars = sum(len(c.get("excerpt", "")) for c in res.get("cited_sections", []))
            quality = len(res.get("answer", "")) / (coverage_chars + 1)
            res_eval = {
                "question": q,
                "answer_len": len(res.get("answer", "")),
                # retrieval recall proxy: avg normalized score of top-k
                "avg_retrieval_score": round(sum(s.get("score", 0.0) for s in res.get("retriever_scores", [])) / (len(res.get("retriever_scores", [])) or 1), 4),
                "num_citations": len(res.get("cited_sections", [])),
                "quality_proxy": round(quality, 4),
            }
            results.append({"result": res, "metrics": res_eval})

        # save structured benchmark
        out = {
            "config": self.config.__dict__,
            "results": results,
        }
        try:
            path = Path(self.config.runs_dir) / "benchmark.json"
            with open(path, "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
        return out
