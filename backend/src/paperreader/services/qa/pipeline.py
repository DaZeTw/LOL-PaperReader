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
# Readiness flags
_PIPELINE_BUILDING: bool = False
_PIPELINE_READY: bool = False  # True when store is built (i.e., ready for fast queries)
_PIPELINE_PROGRESS: Dict[str, Any] = {
    "percent": 0,
    "stage": "idle",
    "message": "",
}

def _set_progress(percent: int, stage: str, message: str = "") -> None:
    try:
        _PIPELINE_PROGRESS["percent"] = max(0, min(100, int(percent)))
        _PIPELINE_PROGRESS["stage"] = stage
        if message:
            _PIPELINE_PROGRESS["message"] = message
    except Exception:
        pass


@dataclass
class PipelineArtifacts:
    chunks: List[Dict[str, Any]]
    corpus_texts: List[str]
    store_metadatas: List[Dict[str, Any]]
    persistent_store: Optional[Any] = None


class QAPipeline:
    def __init__(self, config: PipelineConfig, lazy_store: bool = True) -> None:
        self.config = config
        self.lazy_store = lazy_store  # If True, delay store building until first use
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
        import time
        start_time = time.time()
        
        print("[LOG] Loading parsed documents...")
        _set_progress(5, "load_docs", "Loading parsed documents")
        docs = load_parsed_jsons(self.config)
        print(f"[LOG] Number of documents loaded: {len(docs)}")

        # No external embedding for splitting; use heuristic chunking only
        semantic_splitter = None

        print("[LOG] Starting chunking process...")
        _set_progress(10, "chunking", "Starting chunking")
        chunk_start = time.time()
        chunks = split_sections_into_chunks(docs, semantic_splitter=semantic_splitter)
        chunk_time = time.time() - chunk_start
        print(f"[LOG] ✅ Chunking completed in {chunk_time:.2f}s")
        print(f"[LOG] Number of chunks created: {len(chunks)}")
        _set_progress(30, "chunking_done", f"Chunking completed ({len(chunks)} chunks)")

        # Load embedder (lazy, cached singleton)
        embedder_start = time.time()
        try:
            embedder = get_embedder(self.config.embedder_name)  # Singleton, lazy loads model on first use
            _set_progress(40, "embedder_init", "Embedder instance obtained")
            # If NOT using lazy store, preload model now to avoid delay during store building
            if not self.lazy_store:
                print(f"[LOG] Preloading embedder model and tokenizer (required for store building)...")
                _set_progress(50, "embedder_loading", "Preloading model & tokenizer")
                embedder._ensure_model()  # Load model which loads tokenizer
                # Test embedding to ensure everything works
                embedder.embed(["warmup"])
                embedder_time = time.time() - embedder_start
                print(f"[LOG] ✅ Embedder fully ready (model + tokenizer loaded) in {embedder_time:.2f}s")
                _set_progress(60, "embedder_ready", "Model & tokenizer ready")
            else:
                embedder_time = time.time() - embedder_start
                print(f"[LOG] ✅ Embedder instance obtained in {embedder_time:.2f}s (model will load on first use)")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize Visualized_BGE embedder: {e}")

        # Build corpus (fast, just text extraction)
        corpus_start = time.time()
        corpus = build_corpus(chunks)
        corpus_time = time.time() - corpus_start
        print(f"[LOG] ✅ Corpus built with {len(corpus.texts)} texts in {corpus_time:.2f}s")
        _set_progress(50 if self.lazy_store else 65, "corpus_ready", "Corpus built")

        # OPTIMIZATION: Lazy store building - only build when needed (first answer() call)
        store = None
        store_time = 0.0
        if not self.lazy_store:
            _set_progress(70, "store_building", "Building memory store (embeddings)")
            store_start = time.time()
            store = build_store(corpus, embedder)
            store_time = time.time() - store_start
            print(f"[LOG] ✅ Memory store built with {len(store.metadatas)} metadatas in {store_time:.2f}s")
            _set_progress(95, "store_ready", "Store built")
        else:
            print(f"[LOG] ⏭️  Store building deferred (lazy) - will build on first query")
            # Create placeholder store that will be built on demand
            from .retrievers import InMemoryVectorStore
            store = InMemoryVectorStore(
                dense_vectors=None,  # Will be built on demand
                metadatas=corpus.metadatas,
                tfidf_matrix=None,
                tfidf_vectorizer=None,
            )
            # Store corpus for later building
            self._corpus = corpus
            self._chunks = chunks
        
        total_time = time.time() - start_time
        print(f"[LOG] ✅ Pipeline build completed in {total_time:.2f}s total")
        print(f"[LOG]   - Chunking: {chunk_time:.2f}s ({chunk_time/total_time*100:.1f}%)")
        print(f"[LOG]   - Embedder: {embedder_time:.2f}s ({embedder_time/total_time*100:.1f}%)")
        print(f"[LOG]   - Corpus: {corpus_time:.2f}s ({corpus_time/total_time*100:.1f}%)")
        if not self.lazy_store:
            print(f"[LOG]   - Store: {store_time:.2f}s ({store_time/total_time*100:.1f}%)")

        retriever = get_retriever(self.config.retriever_name, store, embedder)
        generator = get_generator(self.config.generator_name, image_policy=self.config.image_policy)

        self.embedder = embedder
        self.retriever = retriever
        self.generator = generator
        self.artifacts = PipelineArtifacts(
            chunks=chunks,
            corpus_texts=corpus.texts,
            store_metadatas=corpus.metadatas,
            persistent_store=None  # Will be initialized when needed
        )
        self.store = store
        self._store_built = not self.lazy_store  # Track if store is built
        self.persistent_store = None  # Will be initialized when needed
        # Update readiness flags
        global _PIPELINE_READY
        _PIPELINE_READY = self._store_built
        if self._store_built:
            print(f"[LOG] ✅ Pipeline marked as READY (store built)")
            _set_progress(100, "ready", "Pipeline ready")
        else:
            print(f"[LOG] ⏳ Pipeline marked as NOT READY (lazy store, will build on first query)")
            _set_progress(55, "waiting", "Waiting for first query to build store")

    def _ensure_store_built(self):
        """Build store on-demand if using lazy loading"""
        if not self._store_built:
            import time
            import os
            chunks_count = len(self._corpus.texts) if hasattr(self, '_corpus') else 0
            print(f"[LOG] 🔨 Building store on-demand (first query) for {chunks_count} chunks...")
            print(f"[LOG] This may take 1-2 minutes for large documents. Please wait...")
            _set_progress(70, "store_building", "Building memory store (on-demand)")
            store_start = time.time()
            
            try:
                from .retrievers import build_store
                self.store = build_store(self._corpus, self.embedder)
                
                # Update retriever with new store
                from .retrievers import get_retriever
                self.retriever = get_retriever(self.config.retriever_name, self.store, self.embedder)
                
                store_time = time.time() - store_start
                print(f"[LOG] ✅ Store built in {store_time:.2f}s - ready for queries")
                self._store_built = True
                # Mark ready now
                global _PIPELINE_READY
                _PIPELINE_READY = True
                _set_progress(100, "ready", "Pipeline ready")
                # Clean up temp references
                if hasattr(self, '_corpus'):
                    delattr(self, '_corpus')
                if hasattr(self, '_chunks'):
                    delattr(self, '_chunks')
            except Exception as e:
                print(f"[ERROR] Failed to build store: {e}")
                import traceback
                print(f"[ERROR] Traceback: {traceback.format_exc()}")
                raise
    
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
        
        # OPTIMIZATION: Build store on-demand if lazy loading was used
        self._ensure_store_built()
        
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
            """Normalize excerpt text - preserve all characters, only normalize whitespace"""
            if not s:
                return ""
            # Preserve the original text structure, only normalize excessive whitespace
            # CRITICAL: Don't strip leading/trailing whitespace if it's meaningful
            # Only normalize multiple spaces to single space, preserve line structure
            # First normalize excessive whitespace but keep one space
            s = _re.sub(r"[ \t]+", " ", s)  # Multiple spaces/tabs to single space
            s = _re.sub(r"\n\s*\n+", "\n\n", s)  # Multiple newlines to double newline
            # Only strip if it's truly leading/trailing whitespace that doesn't matter
            # But preserve spaces that might be part of the text structure
            s = s.strip()
            return s

        # Only build citations for indices that were actually used
        cited = []
        citation_map = {}  # Map citation number to citation info
        for citation_num, hit_idx in enumerate(unique_ordered_indices, start=1):
            h = hits[hit_idx]
            meta = h.get("metadata", {})
            title = meta.get("title")
            page = meta.get("page")
            # Get full text from hit - ensure we get the complete text
            text_content = h.get("text", "")
            if not text_content and meta.get("text"):
                # Fallback: try to get text from metadata
                text_content = meta.get("text", "")
            excerpt = _norm_excerpt(text_content)
            
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
    """Calculate hash of all parsed files to detect changes (uses file content for better cache hits)"""
    base = Path(config.data_dir)
    if not base.exists():
        return "fallback"
    
    # Collect all JSON and MD files
    all_files = list(base.glob("*.json")) + list(base.glob("*.md"))
    
    if not all_files:
        return "empty"
    
    # Sort for consistent hashing
    all_files.sort(key=lambda p: str(p))
    
    # Calculate combined hash using file content hash (more reliable than mtime)
    # This prevents re-chunking when the same file is uploaded again
    hasher = hashlib.md5()
    for file_path in all_files:
        try:
            # Include file name and content hash for better cache detection
            # For large files, hash a sample to keep it fast
            stat = file_path.stat()
            file_size = stat.st_size
            
            # For small files (< 1MB), hash entire content
            # For large files, hash first 64KB + last 64KB + size + name
            if file_size < 1024 * 1024:  # < 1MB
                content_hash = hashlib.md5(file_path.read_bytes()).hexdigest()
            else:
                # Sample-based hash for large files
                sample_hasher = hashlib.md5()
                with open(file_path, 'rb') as f:
                    # First 64KB
                    sample_hasher.update(f.read(64 * 1024))
                    # Last 64KB if file is larger
                    if file_size > 128 * 1024:
                        f.seek(file_size - 64 * 1024)
                        sample_hasher.update(f.read(64 * 1024))
                    # Include file size and name
                    sample_hasher.update(f"{file_path.name}:{file_size}".encode())
                content_hash = sample_hasher.hexdigest()
            
            hasher.update(f"{file_path.name}:{content_hash}".encode())
        except Exception as e:
            print(f"[WARNING] Failed to hash {file_path}: {e}")
            # Fallback to name + size if content hash fails
            try:
                stat = file_path.stat()
                hasher.update(f"{file_path.name}:{stat.st_size}".encode())
            except:
                pass
    
    return hasher.hexdigest()


async def get_pipeline(config: Optional[PipelineConfig] = None, lazy_store: bool = True) -> QAPipeline:
    """Return cached pipeline if available and data hasn't changed, else build and cache it.
    
    This function checks if parsed files have changed by comparing file hashes.
    If no changes detected, it reuses the cached pipeline (chunks and embeddings).
    Only rebuilds when files are added/removed/modified.
    
    Args:
        config: Pipeline configuration (optional)
        lazy_store: If True (default), delay store building until first query. 
                   This makes pipeline building much faster but first query will be slower.
                   If False, build store immediately (slower build, faster first query).
    """
    global _PIPELINE_CACHE, _PIPELINE_DATA_HASH
    cfg = config or PipelineConfig()
    
    try:
        # Calculate current data hash
        print("[LOG] Calculating data hash...")
        current_hash = _calculate_data_hash(cfg)
        print(f"[LOG] Data hash calculated: {current_hash[:16]}...")
        
        # Rebuild if cache is None or data has changed
        if _PIPELINE_CACHE is None or _PIPELINE_DATA_HASH != current_hash:
            if _PIPELINE_CACHE is None:
                print("[LOG] Building pipeline (first time) - creating chunks and embeddings...")
            else:
                print(f"[LOG] Pipeline data changed (hash: {_PIPELINE_DATA_HASH} -> {current_hash}), rebuilding chunks and embeddings...")
            
            # OPTIMIZATION: Use lazy_store by default to speed up rebuild
            print("[LOG] Starting pipeline build...")
            global _PIPELINE_BUILDING, _PIPELINE_READY
            _PIPELINE_BUILDING = True
            _PIPELINE_READY = False
            _PIPELINE_CACHE = QAPipeline(cfg, lazy_store=lazy_store)
            _PIPELINE_DATA_HASH = current_hash
            print(f"[LOG] ✅ Pipeline built with {len(_PIPELINE_CACHE.artifacts.chunks)} chunks (hash: {current_hash[:16]}...)")
            _PIPELINE_BUILDING = False
            # _PIPELINE_READY will be set inside QAPipeline depending on store status
        else:
            print(f"[LOG] ✅ Using cached pipeline (data unchanged, hash: {current_hash[:16]}...) - no re-chunking needed")
            print(f"[LOG]   Cached pipeline has {len(_PIPELINE_CACHE.artifacts.chunks)} chunks ready to use")
        
        return _PIPELINE_CACHE
    except Exception as e:
        print(f"[ERROR] Failed to get pipeline: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        raise


def reset_pipeline_cache() -> None:
    """Clear the cached pipeline so it will rebuild on next access."""
    global _PIPELINE_CACHE, _PIPELINE_DATA_HASH
    _PIPELINE_CACHE = None
    _PIPELINE_DATA_HASH = None
    print("[LOG] Pipeline cache reset")


async def rebuild_pipeline(config: Optional[PipelineConfig] = None, lazy_store: bool = True) -> QAPipeline:
    """Force rebuild of the pipeline and update the cache.
    
    Args:
        config: Pipeline configuration (optional)
        lazy_store: If True (default), delay store building until first query.
                   This makes rebuild much faster (only chunking, no embedding).
    """
    global _PIPELINE_CACHE, _PIPELINE_DATA_HASH
    cfg = config or PipelineConfig()
    print(f"[LOG] Force rebuilding pipeline (lazy_store={lazy_store})...")
    # OPTIMIZATION: Use lazy_store by default - rebuild is much faster (no embedding)
    global _PIPELINE_BUILDING, _PIPELINE_READY
    _PIPELINE_BUILDING = True
    _PIPELINE_READY = False
    print(f"[LOG] Creating new QAPipeline instance (lazy_store={lazy_store})...")
    _PIPELINE_CACHE = QAPipeline(cfg, lazy_store=lazy_store)
    _PIPELINE_DATA_HASH = _calculate_data_hash(cfg)
    print(f"[LOG] Pipeline rebuilt with hash: {_PIPELINE_DATA_HASH[:16]}...")
    print(f"[LOG] Store built: {_PIPELINE_CACHE._store_built}, Ready: {_PIPELINE_READY}")
    _PIPELINE_BUILDING = False
    # _PIPELINE_READY will be set inside QAPipeline depending on store status
    return _PIPELINE_CACHE


# -------- Readiness helpers --------
def pipeline_status() -> Dict[str, Any]:
    chunks_count = 0
    if _PIPELINE_CACHE:
        try:
            chunks_count = len(_PIPELINE_CACHE.artifacts.chunks)
        except:
            chunks_count = 0
    return {
        "building": _PIPELINE_BUILDING,
        "ready": _PIPELINE_READY,
        "has_cache": _PIPELINE_CACHE is not None,
        "chunks": chunks_count,
        "percent": _PIPELINE_PROGRESS.get("percent", 0),
        "stage": _PIPELINE_PROGRESS.get("stage", "idle"),
        "message": _PIPELINE_PROGRESS.get("message", ""),
    }

