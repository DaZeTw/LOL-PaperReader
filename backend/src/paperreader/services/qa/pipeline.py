import os
import json
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, List

from .config import PipelineConfig
from .loaders import load_parsed_jsons
from .chunking import split_sections_into_chunks
from .embeddings import get_embedder
from .retrievers import build_corpus, build_store, build_persistent_store, get_retriever
from .generators import get_generator
from typing import Dict, Any, List, Optional


# Simple module-level cache
_PIPELINE_CACHE: Optional["QAPipeline"] = None
_PIPELINE_DATA_HASH: Optional[str] = None


@dataclass
class PipelineArtifacts:
    chunks: List[Dict[str, Any]]
    corpus_texts: List[str]
    store_metadatas: List[Dict[str, Any]]
    persistent_store: Optional[Any] = None


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

        # No external embedding for splitting; use heuristic chunking only
        semantic_splitter = None

        chunks = split_sections_into_chunks(docs, semantic_splitter=semantic_splitter)
        print(f"[LOG] Chunks created: {chunks[10:20] if len(chunks) > 20 else chunks}")
        print(f"[LOG] Number of chunks created: {len(chunks)}")

        try:
            embedder = get_embedder(self.config.embedder_name)
            print("[LOG] Visualized_BGE embedder loaded successfully.")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize Visualized_BGE embedder: {e}")

        corpus = build_corpus(chunks)
        print(f"[LOG] Corpus built with {len(corpus.texts)} texts.")

        # Build both memory store and persistent store
        store = build_store(corpus, embedder)
        print(f"[LOG] Memory store built with {len(store.metadatas)} metadatas.")

        # Note: Persistent store will be built asynchronously when needed
        # For now, we'll use memory store for immediate operations
        retriever = get_retriever(self.config.retriever_name, store, embedder)
        generator = get_generator(self.config.generator_name, image_policy=self.config.image_policy)

        self.embedder = embedder
        self.retriever = retriever
        self.generator = generator
        self.artifacts = PipelineArtifacts(
            chunks=chunks,
            corpus_texts=corpus.texts,
            store_metadatas=store.metadatas,
            persistent_store=None  # Will be initialized when needed
        )
        self.store = store
        self.persistent_store = None  # Will be initialized when needed

    async def _ensure_persistent_store(self):
        """Initialize persistent store if not already done - DISABLED for chunk embeddings"""
        # Note: Chunk embeddings are kept in memory only for performance
        # Chat embeddings are handled separately by chat_embedding_service
        if self.persistent_store is None:
            print("[LOG] Using memory-only vector store for chunk embeddings")
            # Keep using memory store for chunk embeddings
            self.persistent_store = None

    async def answer(self, question: str, image: str | None = None, user_images: List[str] | None = None, chat_history: List[Dict[str, str]] | None = None) -> Dict[str, Any]:
        print(f"[LOG] Retrieving hits for question: '{question}'")
        
        # Ensure persistent store is initialized
        await self._ensure_persistent_store()
        
        # Determine which image to use for query and resolve path
        query_image = image
        if user_images and len(user_images) > 0:
            print(f"[LOG] User provided {len(user_images)} images: {user_images}")
            query_image = user_images[0]  # Use first user image if available
        
        # Resolve query image path if provided (only for file paths, not base64 data URLs)
        if query_image and not query_image.startswith("data:image/"):
            print(f"[LOG] Resolving image path: {query_image}")
            query_path = Path(query_image)
            
            # Handle relative paths that start with "./paperreader/"
            if query_image.startswith("./paperreader/"):
                # Extract just the filename from the path
                filename = Path(query_image).name
                print(f"[LOG] Extracted filename: {filename}")
                # Try in img_query directory
                img_query_dir = Path(__file__).resolve().parent / "img_query"
                img_query_path = img_query_dir / filename
                if img_query_path.exists():
                    query_image = str(img_query_path.resolve())
                    print(f"[LOG] Found image at img_query dir: {query_image}")
                else:
                    print(f"[WARNING] Image not found in img_query: {img_query_path}")
                    query_image = None
            elif not query_path.is_absolute():
                # Try relative to current working directory
                if query_path.exists():
                    query_image = str(query_path.resolve())
                    print(f"[LOG] Found image at current dir: {query_image}")
                else:
                    # Try relative to parser output directory
                    parser_base = Path(__file__).resolve().parent / "parser"
                    alt_path = parser_base / query_image
                    if alt_path.exists():
                        query_image = str(alt_path.resolve())
                        print(f"[LOG] Found image at parser dir: {query_image}")
                    else:
                        # Try relative to img_query directory
                        img_query_dir = Path(__file__).resolve().parent / "img_query"
                        img_query_path = img_query_dir / query_image
                        if img_query_path.exists():
                            query_image = str(img_query_path.resolve())
                            print(f"[LOG] Found image at img_query dir: {query_image}")
                        else:
                            print(f"[WARNING] Image not found: {query_image}")
                            query_image = None
            else:
                if query_path.exists():
                    print(f"[LOG] Using absolute path: {query_image}")
                else:
                    print(f"[WARNING] Absolute path does not exist: {query_image}")
                    query_image = None
        elif query_image and query_image.startswith("data:image/"):
            print(f"[LOG] Using base64 data URL as query image")
        
        hits = self.retriever.retrieve(question, top_k=self.config.top_k, image=query_image)
        print(f"[LOG] Number of hits retrieved: {len(hits)}")
        print(f"[LOG] Requested top_k: {self.config.top_k}")
        if len(hits) > 0:
            print(f"[LOG] Top hit text: {hits[0].get('text', '')[:200]}")
        else:
            print(f"[WARNING] No hits retrieved!")

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
            print(f"[DEBUG] ===== CALLING GENERATOR =====")
            print(f"[DEBUG] Generator type: {type(self.generator)}")
            print(f"[DEBUG] Question: {question}")
            print(f"[DEBUG] User images: {user_images}")
            print(f"[DEBUG] Contexts: {len(contexts)}")
            gen_out = self.generator.generate(question, contexts, max_tokens=self.config.max_tokens, query_image=query_image, query_images=user_images, chat_history=chat_history)
            print(f"[DEBUG] Generator completed successfully")
        except Exception as e:
            print(f"[ERROR] ===== GENERATOR FAILED =====")
            print(f"[ERROR] Generator failed: {e}. Using ExtractiveGenerator fallback.")
            from .generators import ExtractiveGenerator
            # fallback uses text-only
            text_contexts = [h.get("text", "") for h in hits]
            answer = ExtractiveGenerator().generate(question, text_contexts, max_tokens=self.config.max_tokens, query_image=query_image, query_images=user_images, chat_history=chat_history)
            gen_out = {"answer": answer, "citations": []}
            print(f"[ERROR] Using fallback generator - this explains why you get document text!")

        # Let the LLM decide whether to include figures in its response
        # We don't manually append figures - the LLM will include them if needed
        print(f"[LOG] LLM generated answer: {gen_out.get('answer', '')[:100]}...")

        try:
            run_path = Path(self.config.runs_dir) / "last_run_retrieval.json"
            with open(run_path, "w", encoding="utf-8") as f:
                json.dump({"question": question, "hits": hits}, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[WARNING] Failed to save retrieval log: {e}")

        # Build citations ordered by [cN] markers in the answer when present
        import re as _re
        answer_text = gen_out.get("answer", "")
        marker_pattern = _re.compile(r"\[c(\d+)\]")
        marker_indices = gen_out.get("citations") or [int(m.group(1)) - 1 for m in marker_pattern.finditer(answer_text)]
        
        print(f"[DEBUG] Answer text: {answer_text[:200]}...")
        print(f"[DEBUG] Found citations in answer: {marker_indices}")
        print(f"[DEBUG] Generator citations: {gen_out.get('citations', [])}")
        
        # ONLY include citations that are actually used in the answer
        # Don't include citations that aren't referenced with [cN] markers
        ordered_hit_indices = []
        for idx in marker_indices:
            if 0 <= idx < len(hits):
                ordered_hit_indices.append(idx)
        # Remove duplicates while preserving order
        seen_indices = set()
        unique_ordered_indices = []
        for idx in ordered_hit_indices:
            if idx not in seen_indices:
                seen_indices.add(idx)
                unique_ordered_indices.append(idx)

        def _norm_excerpt(s: str) -> str:
            s = (s or "").strip()
            return _re.sub(r"\s+", " ", s)

        # Only build citations for indices that were actually used
        cited = []
        citation_map = {}  # Map citation number to citation info
        for citation_num, hit_idx in enumerate(unique_ordered_indices, start=1):
            h = hits[hit_idx]
            meta = h.get("metadata", {})
            title = meta.get("title")
            page = meta.get("page")
            excerpt = _norm_excerpt(h.get("text", ""))
            
            citation_info = {
                "citation_number": citation_num,
                "doc_id": meta.get("doc_id"),
                "title": title,
                "page": page,
                "excerpt": excerpt
            }
            cited.append(citation_info)
            citation_map[hit_idx] = citation_info

        # Get confidence from generator output if available
        confidence = gen_out.get("confidence")

        return {
            "question": question,
            "answer": gen_out.get("answer", ""),
            "citations": unique_ordered_indices,  # Only valid hit indices that have citations
            "cited_sections": cited,  # Only citations that are actually used
            "retriever_scores": [{"index": h["index"], "score": h["score"]} for h in hits],
            "confidence": confidence
        }


def _calculate_data_hash(config: PipelineConfig) -> str:
    """Calculate hash of all parsed files to detect changes (fast - uses metadata only)"""
    base = Path(config.data_dir)
    if not base.exists():
        return "fallback"
    
    # Collect all JSON and MD files
    all_files = list(base.glob("*.json")) + list(base.glob("*.md"))
    
    if not all_files:
        return "empty"
    
    # Sort for consistent hashing
    all_files.sort(key=lambda p: str(p))
    
    # Calculate combined hash using file metadata (fast, no file reading)
    hasher = hashlib.md5()
    for file_path in all_files:
        try:
            # Include file name, modification time, and size in hash
            stat = file_path.stat()
            hasher.update(f"{file_path.name}:{stat.st_mtime}:{stat.st_size}".encode())
        except Exception as e:
            print(f"[WARNING] Failed to hash {file_path}: {e}")
    
    return hasher.hexdigest()


async def get_pipeline(config: Optional[PipelineConfig] = None) -> QAPipeline:
    """Return cached pipeline if available and data hasn't changed, else build and cache it."""
    global _PIPELINE_CACHE, _PIPELINE_DATA_HASH
    cfg = config or PipelineConfig()
    
    # Calculate current data hash
    current_hash = _calculate_data_hash(cfg)
    
    # Rebuild if cache is None or data has changed
    if _PIPELINE_CACHE is None or _PIPELINE_DATA_HASH != current_hash:
        if _PIPELINE_CACHE is None:
            print("[LOG] Building pipeline (first time)")
        else:
            print(f"[LOG] Pipeline data changed (hash: {_PIPELINE_DATA_HASH} -> {current_hash}), rebuilding...")
        
        _PIPELINE_CACHE = QAPipeline(cfg)
        _PIPELINE_DATA_HASH = current_hash
    else:
        print(f"[LOG] Using cached pipeline (data hash: {current_hash})")
    
    return _PIPELINE_CACHE


def reset_pipeline_cache() -> None:
    """Clear the cached pipeline so it will rebuild on next access."""
    global _PIPELINE_CACHE, _PIPELINE_DATA_HASH
    _PIPELINE_CACHE = None
    _PIPELINE_DATA_HASH = None
    print("[LOG] Pipeline cache reset")


async def rebuild_pipeline(config: Optional[PipelineConfig] = None) -> QAPipeline:
    """Force rebuild of the pipeline and update the cache."""
    global _PIPELINE_CACHE, _PIPELINE_DATA_HASH
    cfg = config or PipelineConfig()
    print("[LOG] Force rebuilding pipeline...")
    _PIPELINE_CACHE = QAPipeline(cfg)
    _PIPELINE_DATA_HASH = _calculate_data_hash(cfg)
    print(f"[LOG] Pipeline rebuilt with hash: {_PIPELINE_DATA_HASH}")
    return _PIPELINE_CACHE
