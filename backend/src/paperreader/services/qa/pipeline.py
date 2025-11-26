import asyncio
import os
import json
import hashlib
import threading
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from .config import PipelineConfig
from .loaders import load_parsed_jsons
from .chunking import split_sections_into_chunks
from .embeddings import get_embedder
from .retrievers import build_corpus, build_store, build_persistent_store, get_retriever
from .generators import get_generator


# Pipeline cache keyed by data_dir path (to support multiple PDFs)
_PIPELINE_CACHE: Dict[str, Optional["QAPipeline"]] = {}  # Key: data_dir path, Value: pipeline
_PIPELINE_DATA_HASH: Dict[str, Optional[str]] = {}  # Key: data_dir path, Value: hash
# Readiness flags per pipeline
_PIPELINE_BUILDING: Dict[str, bool] = {}  # Key: data_dir path
_PIPELINE_READY: Dict[str, bool] = {}  # Key: data_dir path
_PIPELINE_PROGRESS: Dict[str, Dict[str, Any]] = {}  # Key: data_dir path
# Locks to prevent concurrent rebuilds for the same data_dir
_PIPELINE_BUILD_LOCKS: Dict[str, threading.Lock] = {}  # Key: data_dir path, Value: lock
_PIPELINE_BUILD_LOCK = threading.Lock()  # Lock for _PIPELINE_BUILD_LOCKS dict

# Cancel flag - will be set from pdf_routes module
_CANCEL_FLAG = None  # Will be set to threading.Event from pdf_routes


def _check_cancel(operation: str = "operation") -> None:
    """Check if cancel flag is set and raise exception if so."""
    if _CANCEL_FLAG is not None and _CANCEL_FLAG.is_set():
        print(f"[LOG] ⚠️ {operation} cancelled - cancel flag is set")
        raise RuntimeError(f"{operation} was cancelled - output directory was cleared")


def set_cancel_flag(cancel_flag) -> None:
    """Set the cancel flag from pdf_routes module."""
    global _CANCEL_FLAG
    _CANCEL_FLAG = cancel_flag

def _set_progress(percent: int, stage: str, message: str = "", data_dir: Optional[str] = None) -> None:
    try:
        cache_key = str(data_dir) if data_dir else "default"
        if cache_key not in _PIPELINE_PROGRESS:
            _PIPELINE_PROGRESS[cache_key] = {"percent": 0, "stage": "idle", "message": ""}
        _PIPELINE_PROGRESS[cache_key]["percent"] = max(0, min(100, int(percent)))
        _PIPELINE_PROGRESS[cache_key]["stage"] = stage
        if message:
            _PIPELINE_PROGRESS[cache_key]["message"] = message
    except Exception:
        pass


def _get_cache_dir(config: PipelineConfig) -> Path:
    """Get cache directory for chunks and embeddings."""
    cache_dir = Path(config.data_dir) / ".pipeline_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _get_cache_paths(config: PipelineConfig, data_hash: str) -> Tuple[Path, Path]:
    """Get cache file paths for chunks and embeddings."""
    cache_dir = _get_cache_dir(config)
    # Include PDF name in cache key if available to separate caches per PDF
    pdf_name_filter = getattr(config, '_pdf_name_filter', None)
    if pdf_name_filter:
        cache_key = f"{pdf_name_filter}_{data_hash}"
    else:
        cache_key = data_hash
    chunks_cache = cache_dir / f"chunks_{cache_key}.json"
    embeddings_cache = cache_dir / f"embeddings_{cache_key}.pkl"
    return chunks_cache, embeddings_cache


def _load_chunks_and_embeddings_cache(config: PipelineConfig, data_hash: str) -> Optional[Tuple[List[Dict[str, Any]], List[List[float]]]]:
    """Load chunks and embeddings from cache if available."""
    chunks_cache, embeddings_cache = _get_cache_paths(config, data_hash)
    
    if not chunks_cache.exists() or not embeddings_cache.exists():
        return None
    
    try:
        # Load chunks
        with open(chunks_cache, "r", encoding="utf-8") as f:
            chunks = json.load(f)
        
        # Load embeddings
        with open(embeddings_cache, "rb") as f:
            embeddings = pickle.load(f)
        
        if len(chunks) != len(embeddings):
            print(f"[LOG] ⚠️ Cache mismatch: {len(chunks)} chunks but {len(embeddings)} embeddings, ignoring cache")
            return None
        
        # Filter chunks by PDF name if filter is set (safety check in case cache contains mixed PDFs)
        pdf_name_filter = getattr(config, '_pdf_name_filter', None)
        if pdf_name_filter and chunks:
            pdf_name_no_ext = pdf_name_filter.replace(".pdf", "").replace(".PDF", "")
            filtered_chunks = []
            filtered_embeddings = []
            
            for chunk, embedding in zip(chunks, embeddings):
                doc_id = chunk.get("doc_id", "")
                doc_id_no_ext = doc_id.replace(".pdf", "").replace(".PDF", "").strip()
                
                # Match if doc_id matches the PDF name (same logic as retriever)
                matches = (
                    doc_id == pdf_name_filter or  # Exact match with extension
                    doc_id_no_ext == pdf_name_no_ext or  # Exact match without extension
                    doc_id_no_ext.startswith(pdf_name_no_ext) or  # doc_id starts with pdf_name
                    (pdf_name_no_ext and pdf_name_no_ext in doc_id_no_ext and len(pdf_name_no_ext) >= 3)  # pdf_name is in doc_id
                )
                
                if matches:
                    filtered_chunks.append(chunk)
                    filtered_embeddings.append(embedding)
            
            if filtered_chunks:
                print(f"[LOG] ✅ Loaded {len(filtered_chunks)}/{len(chunks)} chunks from cache (filtered by PDF: {pdf_name_filter})")
                return filtered_chunks, filtered_embeddings
            else:
                print(f"[LOG] ⚠️ No chunks match PDF filter '{pdf_name_filter}' in cache, ignoring cache")
                return None
        
        print(f"[LOG] ✅ Loaded {len(chunks)} chunks and {len(embeddings)} embeddings from cache")
        return chunks, embeddings
    except Exception as e:
        print(f"[LOG] ⚠️ Failed to load cache: {e}")
        return None


def _save_chunks_and_embeddings_cache(config: PipelineConfig, data_hash: str, chunks: List[Dict[str, Any]], embeddings: List[List[float]]) -> None:
    """Save chunks and embeddings to cache."""
    if not chunks or not embeddings:
        return
    
    chunks_cache, embeddings_cache = _get_cache_paths(config, data_hash)
    
    try:
        # Save chunks
        with open(chunks_cache, "w", encoding="utf-8") as f:
            json.dump(chunks, f, ensure_ascii=False, indent=2)
        
        # Save embeddings
        with open(embeddings_cache, "wb") as f:
            pickle.dump(embeddings, f)
        
        print(f"[LOG] ✅ Saved {len(chunks)} chunks and {len(embeddings)} embeddings to cache")
    except Exception as e:
        print(f"[LOG] ⚠️ Failed to save cache: {e}")


@dataclass
class PipelineArtifacts:
    chunks: List[Dict[str, Any]]
    corpus_texts: List[str]
    store_metadatas: List[Dict[str, Any]]
    persistent_store: Optional[Any] = None


class QAPipeline:
    def __init__(self, config: PipelineConfig, lazy_store: bool = True, docs: Optional[List[Dict[str, Any]]] = None, chunks: Optional[List[Dict[str, Any]]] = None) -> None:
        self.config = config
        self.lazy_store = lazy_store  # If True, delay store building until first use
        self._ensure_runs_dir()
        self._build(docs=docs, chunks=chunks)

    def _ensure_runs_dir(self) -> None:
        try:
            Path(self.config.runs_dir).mkdir(parents=True, exist_ok=True)
        except Exception:
            fallback = Path(__file__).resolve().parent.parent / "runs"
            fallback.mkdir(parents=True, exist_ok=True)
            self.config.runs_dir = str(fallback)

    def _build(self, docs: Optional[List[Dict[str, Any]]] = None, chunks: Optional[List[Dict[str, Any]]] = None) -> None:
        import time
        start_time = time.time()
        data_dir_key = str(self.config.data_dir)
        
        # Check cancel flag at the very start of build
        _check_cancel("At start of pipeline build")
        
        # Calculate data hash first (for cache lookup)
        # Always calculate from files if available (more reliable for cache matching)
        # If docs are provided in-memory, we'll recalculate hash after files are saved
        data_hash = _calculate_data_hash(self.config)
        
        # If hash is "empty", it means no files found - use in-memory hash as fallback
        if data_hash == "empty" and docs is not None:
            # For in-memory docs when no files exist yet, use a simple hash
            hash_str = f"{len(docs)}_{docs[0].get('doc_id', 'unknown') if docs else 'empty'}"
            data_hash = hashlib.md5(hash_str.encode()).hexdigest()
            print(f"[LOG] Using in-memory hash (no files found): {data_hash[:16]}...")
        else:
            print(f"[LOG] Using file-based hash: {data_hash[:16]}...")
        
        # If chunks provided directly, use them (skip chunking)
        if chunks is not None:
            print(f"[LOG] ✅ Using provided chunks directly (skipping chunking)")
            chunk_time = 0.0
            _set_progress(30, "chunking_done", f"Using provided chunks ({len(chunks)} chunks)", data_dir_key)
            cached_embeddings = None
        else:
            # Try to load from cache first
            cached_data = _load_chunks_and_embeddings_cache(self.config, data_hash)
            chunks = None
            cached_embeddings = None
            
            if cached_data is not None:
                chunks, cached_embeddings = cached_data
                print(f"[LOG] ✅ Using cached chunks and embeddings (skipping chunking and embedding)")
                chunk_time = 0.0
                _set_progress(30, "chunking_done", f"Using cached chunks ({len(chunks)} chunks)", data_dir_key)
            else:
                # If docs provided directly, use them; otherwise load from files
                if docs is not None:
                    print(f"[LOG] Using provided documents directly (no file loading needed)...")
                    _set_progress(5, "load_docs", "Using provided documents", data_dir_key)
                else:
                    print(f"[LOG] Loading parsed documents from {data_dir_key}...")
                    _set_progress(5, "load_docs", "Loading parsed documents", data_dir_key)
                    _check_cancel("Loading documents")
                    docs = load_parsed_jsons(self.config)
                print(f"[LOG] Number of documents loaded: {len(docs)}")
                _check_cancel("After loading documents")

                # Use semantic splitter if available (from chunking module)
                # It will automatically fallback to heuristic chunking if not available
                from paperreader.services.qa.chunking import _SPLITTER, _HAS_SEMANTIC
                semantic_splitter = _SPLITTER if _HAS_SEMANTIC else None
                if semantic_splitter:
                    print("[LOG] ✅ Using semantic splitter for chunking")
                else:
                    print("[LOG] ⚠️ Semantic splitter not available, using heuristic chunking")

                print("[LOG] Starting chunking process...")
                _set_progress(10, "chunking", "Starting chunking", data_dir_key)
                _check_cancel("Before chunking")
                chunk_start = time.time()
                chunks = split_sections_into_chunks(docs, semantic_splitter=semantic_splitter)
                chunk_time = time.time() - chunk_start
                _check_cancel("After chunking")
                print(f"[LOG] ✅ Chunking completed in {chunk_time:.2f}s")
                print(f"[LOG] Number of chunks created: {len(chunks)}")
                _set_progress(30, "chunking_done", f"Chunking completed ({len(chunks)} chunks)", data_dir_key)

        # Load embedder (lazy, cached singleton)
        _check_cancel("Before loading embedder")
        embedder_start = time.time()
        try:
            embedder = get_embedder(self.config.embedder_name)  # Singleton, lazy loads model on first use
            _set_progress(40, "embedder_init", "Embedder instance obtained", data_dir_key)
            _check_cancel("After getting embedder instance")
            # If NOT using lazy store, preload model now to avoid delay during store building
            if not self.lazy_store:
                _set_progress(50, "embedder_loading", "Checking embedder model", data_dir_key)
                _check_cancel("Before loading embedder model")
                # Check if model is already loaded (singleton, may be loaded from startup or previous request)
                # Also check if tokenizer is ready (model.tokenizer exists)
                model_already_loaded = embedder.model is not None
                tokenizer_ready = model_already_loaded and hasattr(embedder.model, 'tokenizer') and embedder.model.tokenizer is not None
                
                if model_already_loaded and tokenizer_ready:
                    print(f"[LOG] ✅ Model and tokenizer already loaded (from previous request/startup), skipping reload")
                elif model_already_loaded and not tokenizer_ready:
                    print(f"[LOG] ⚠️ Model loaded but tokenizer not ready, this should not happen")
                    # Model is loaded but tokenizer missing - this is unusual, but we can continue
                    # Tokenizer will be loaded when needed during embedding
                else:
                    print(f"[LOG] Loading model (this will also load/download tokenizer if not cached)...")
                    embedder._ensure_model()  # Load model which loads tokenizer
                    _check_cancel("After loading embedder model")
                    print(f"[LOG] Model loaded, testing embedding...")
                    # Test embedding to ensure everything works (this also ensures tokenizer is ready)
                    embedder.embed(["warmup"])
                    _check_cancel("After embedder warmup")
                embedder_time = time.time() - embedder_start
                print(f"[LOG] ✅ Embedder fully ready in {embedder_time:.2f}s")
                _set_progress(60, "embedder_ready", "Model & tokenizer ready", data_dir_key)
            else:
                embedder_time = time.time() - embedder_start
                print(f"[LOG] ✅ Embedder instance obtained in {embedder_time:.2f}s (model will load on first use)")
        except RuntimeError as e:
            if "cancelled" in str(e).lower():
                raise  # Re-raise cancel exception
            raise RuntimeError(f"Failed to initialize Visualized_BGE embedder: {e}")

        # Build corpus (fast, just text extraction)
        _check_cancel("Before building corpus")
        corpus_start = time.time()
        corpus = build_corpus(chunks)
        corpus_time = time.time() - corpus_start
        _check_cancel("After building corpus")
        print(f"[LOG] ✅ Corpus built with {len(corpus.texts)} texts in {corpus_time:.2f}s")
        _set_progress(50 if self.lazy_store else 65, "corpus_ready", "Corpus built", data_dir_key)

        # OPTIMIZATION: Lazy store building - only build when needed (first answer() call)
        store = None
        store_time = 0.0
        if not self.lazy_store:
            _set_progress(70, "store_building", "Building memory store (embeddings)", data_dir_key)
            _check_cancel("Before building store")
            store_start = time.time()
            # Use cached embeddings if available (skip embedding step)
            store = build_store(corpus, embedder, cached_embeddings=cached_embeddings)
            _check_cancel("After building store")
            store_time = time.time() - store_start
            print(f"[LOG] ✅ Memory store built with {len(store.metadatas)} metadatas in {store_time:.2f}s")
            _set_progress(95, "store_ready", "Store built", data_dir_key)
            # Mark this pipeline as ready
            _PIPELINE_READY[data_dir_key] = True
            
            # Save cache if we just computed embeddings (not from cache)
            if cached_embeddings is None and chunks and store.dense_vectors is not None and len(store.dense_vectors) > 0:
                embeddings_list = store.dense_vectors.tolist()
                _save_chunks_and_embeddings_cache(self.config, data_hash, chunks, embeddings_list)
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
            # Store corpus and cached embeddings for later building
            self._corpus = corpus
            self._chunks = chunks
            self._cached_embeddings = cached_embeddings  # Store cached embeddings for lazy building
            # Mark as not ready yet (will be ready after store is built)
            _PIPELINE_READY[data_dir_key] = False
            
            # Save cache if we just computed chunks (not from cache) but embeddings will be computed later
            # Note: We can't save embeddings yet because they'll be computed on-demand
            # But we can save chunks now if they're fresh
            if cached_data is None and chunks:
                # We'll save embeddings later when store is built
                pass
        
        total_time = time.time() - start_time
        print(f"[LOG] ✅ Pipeline build completed in {total_time:.2f}s total")
        print(f"[LOG]   - Chunking: {chunk_time:.2f}s ({chunk_time/total_time*100:.1f}%)")
        print(f"[LOG]   - Embedder: {embedder_time:.2f}s ({embedder_time/total_time*100:.1f}%)")
        print(f"[LOG]   - Corpus: {corpus_time:.2f}s ({corpus_time/total_time*100:.1f}%)")
        if not self.lazy_store:
            print(f"[LOG]   - Store: {store_time:.2f}s ({store_time/total_time*100:.1f}%)")

        # Get PDF name filter from config if available
        pdf_name_filter = getattr(self.config, '_pdf_name_filter', None)
        retriever = get_retriever(self.config.retriever_name, store, embedder, pdf_name_filter=pdf_name_filter)
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
        # Update readiness flags (already set above in the if/else blocks)
        if self._store_built:
            print(f"[LOG] ✅ Pipeline marked as READY (store built)")
            _set_progress(100, "ready", "Pipeline ready", data_dir_key)
        else:
            print(f"[LOG] ⏳ Pipeline marked as NOT READY (lazy store, will build on first query)")
            _set_progress(55, "waiting", "Waiting for first query to build store", data_dir_key)

    def _ensure_store_built(self):
        """Build store on-demand if using lazy loading"""
        if not self._store_built:
            import time
            import os
            chunks_count = len(self._corpus.texts) if hasattr(self, '_corpus') else 0
            data_dir_key = str(self.config.data_dir)
            print(f"[LOG] 🔨 Building store on-demand (first query) for {chunks_count} chunks...")
            
            # Check if we have cached embeddings
            cached_embeddings = getattr(self, '_cached_embeddings', None)
            if cached_embeddings is not None:
                print(f"[LOG] Using cached embeddings (skipping embedding step)")
            else:
                print(f"[LOG] This may take 1-2 minutes for large documents. Please wait...")
            
            _set_progress(70, "store_building", "Building memory store (on-demand)", data_dir_key)
            store_start = time.time()
            
            try:
                from .retrievers import build_store
                # Use cached embeddings if available
                self.store = build_store(self._corpus, self.embedder, cached_embeddings=cached_embeddings)
                
                # Update retriever with new store
                from .retrievers import get_retriever
                pdf_name_filter = getattr(self.config, '_pdf_name_filter', None)
                self.retriever = get_retriever(self.config.retriever_name, self.store, self.embedder, pdf_name_filter=pdf_name_filter)
                
                store_time = time.time() - store_start
                print(f"[LOG] ✅ Store built in {store_time:.2f}s - ready for queries")
                self._store_built = True
                
                # Save cache if we just computed embeddings (not from cache)
                if cached_embeddings is None and hasattr(self, '_chunks') and self.store.dense_vectors is not None and len(self.store.dense_vectors) > 0:
                    # Calculate data hash for cache
                    data_hash = _calculate_data_hash(self.config)
                    embeddings_list = self.store.dense_vectors.tolist()
                    _save_chunks_and_embeddings_cache(self.config, data_hash, self._chunks, embeddings_list)
                
                # Mark ready now (use data_dir_key from config)
                global _PIPELINE_READY
                _PIPELINE_READY[data_dir_key] = True
                _set_progress(100, "ready", "Pipeline ready", data_dir_key)
                # Clean up temp references
                if hasattr(self, '_corpus'):
                    delattr(self, '_corpus')
                if hasattr(self, '_chunks'):
                    delattr(self, '_chunks')
                if hasattr(self, '_cached_embeddings'):
                    delattr(self, '_cached_embeddings')
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
                tables = meta.get("tables", []) or []
                text = h.get("text", "").strip()
                # Only add context if it has text content
                if text:
                    ctx = {"text": text, "images": images, "tables": tables}
                    contexts.append(ctx)
        else:
            contexts = [h.get("text", "").strip() for h in hits if h.get("text", "").strip()]
        
        # Validate contexts before calling generator
        if not contexts or len(contexts) == 0:
            print(f"[WARNING] ⚠️ No valid contexts found! Hits: {len(hits)}, Contexts: {len(contexts)}")
            print(f"[WARNING] This might cause the generator to fail. Hits details:")
            for i, h in enumerate(hits[:3]):
                print(f"[WARNING]   Hit {i}: text_length={len(h.get('text', ''))}, has_metadata={bool(h.get('metadata'))}")
            # Create a fallback context to prevent generator failure
            contexts = ["No relevant context found in the document."]
            print(f"[WARNING] Using fallback context to prevent generator failure")
        
        try:
            print(f"[DEBUG] ===== CALLING GENERATOR =====")
            print(f"[DEBUG] Generator type: {type(self.generator)}")
            print(f"[DEBUG] Question: {question}")
            print(f"[DEBUG] Question length: {len(question)} chars")
            print(f"[DEBUG] User images: {user_images}")
            print(f"[DEBUG] Contexts: {len(contexts)}")
            print(f"[DEBUG] Context details: {[len(c.get('text', c) if isinstance(c, dict) else c) for c in contexts[:3]]}")
            print(f"[DEBUG] Chat history: {len(chat_history) if chat_history else 0} messages")
            
            # Ensure question is not empty
            if not question or not question.strip():
                raise ValueError("Question cannot be empty")
            
            gen_out = self.generator.generate(question, contexts, max_tokens=self.config.max_tokens, query_image=query_image, query_images=user_images, chat_history=chat_history)
            print(f"[DEBUG] ✅ Generator completed successfully")
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


async def get_pipeline(config: Optional[PipelineConfig] = None, lazy_store: bool = True, pdf_name: Optional[str] = None) -> QAPipeline:
    """Return cached pipeline if available and data hasn't changed, else build and cache it.
    
    This function checks if parsed files have changed by comparing file hashes.
    If no changes detected, it reuses the cached pipeline (chunks and embeddings).
    Only rebuilds when files are added/removed/modified.
    
    Args:
        config: Pipeline configuration (optional)
        lazy_store: If True (default), delay store building until first query. 
                   This makes pipeline building much faster but first query will be slower.
                   If False, build store immediately (slower build, faster first query).
        pdf_name: Optional PDF name to use PDF-specific data directory
    """
    global _PIPELINE_CACHE, _PIPELINE_DATA_HASH
    
    cfg = config or PipelineConfig()
    
    # If pdf_name is provided, filter files by PDF name pattern
    # Note: Files are stored as {pdf_name}-embedded.md in the base data_dir, not in a subdirectory
    if pdf_name:
        from pathlib import Path
        base_data_dir = Path(cfg.data_dir)
        # Remove "uploads" if present
        if base_data_dir.name == "uploads":
            base_data_dir = base_data_dir.parent
        # Store base data_dir and pdf_name for filtering in load_parsed_jsons
        # We'll use the base data_dir but filter files by pdf_name pattern
        cfg.data_dir = base_data_dir
        # Store pdf_name in config for filtering (we'll add a custom attribute)
        if not hasattr(cfg, '_pdf_name_filter'):
            cfg._pdf_name_filter = pdf_name
        print(f"[LOG] Using PDF-specific filter: {pdf_name} (data directory: {base_data_dir})")
        # Use PDF-specific cache key to avoid conflicts between different PDFs
        data_dir_key = f"{base_data_dir}::{pdf_name}"
    else:
        data_dir_key = str(cfg.data_dir)
    
    try:
        # Initialize cache entries for this data_dir if needed
        if data_dir_key not in _PIPELINE_CACHE:
            _PIPELINE_CACHE[data_dir_key] = None
        if data_dir_key not in _PIPELINE_DATA_HASH:
            _PIPELINE_DATA_HASH[data_dir_key] = None
        if data_dir_key not in _PIPELINE_BUILDING:
            _PIPELINE_BUILDING[data_dir_key] = False
        if data_dir_key not in _PIPELINE_READY:
            _PIPELINE_READY[data_dir_key] = False
        
        # Calculate current data hash
        print(f"[LOG] Calculating data hash for {data_dir_key}...")
        current_hash = _calculate_data_hash(cfg)
        print(f"[LOG] Data hash calculated: {current_hash[:16]}...")
        
        # If pipeline cache exists and hash matches, pipeline is ready - clear any stale cancel flag
        if _PIPELINE_CACHE.get(data_dir_key) is not None and _PIPELINE_DATA_HASH.get(data_dir_key) == current_hash:
            # Pipeline is ready, clear any stale cancel flag from previous operations
            if _CANCEL_FLAG is not None and _CANCEL_FLAG.is_set():
                print(f"[LOG] ✅ Pipeline is ready, clearing stale cancel flag (from previous operation)")
                _CANCEL_FLAG.clear()
        
        # Rebuild if cache is None or data has changed
        if _PIPELINE_CACHE[data_dir_key] is None or _PIPELINE_DATA_HASH[data_dir_key] != current_hash:
            # Get or create lock for this data_dir to prevent concurrent builds
            with _PIPELINE_BUILD_LOCK:
                if data_dir_key not in _PIPELINE_BUILD_LOCKS:
                    _PIPELINE_BUILD_LOCKS[data_dir_key] = threading.Lock()
                build_lock = _PIPELINE_BUILD_LOCKS[data_dir_key]
            
            # Acquire lock to prevent concurrent builds
            acquired = build_lock.acquire(blocking=False)
            if not acquired:
                # Another thread is already building, wait for it to finish
                print(f"[LOG] ⏳ Another build is in progress for {data_dir_key}, waiting...")
                build_lock.acquire(blocking=True)
                # After acquiring lock, check if pipeline was built by the other thread
                if data_dir_key in _PIPELINE_CACHE and _PIPELINE_CACHE[data_dir_key] is not None:
                    # Re-check hash to see if it matches
                    if _PIPELINE_DATA_HASH.get(data_dir_key) == current_hash:
                        print(f"[LOG] ✅ Pipeline was built by another thread, reusing it")
                        build_lock.release()
                        return _PIPELINE_CACHE[data_dir_key]
                # If still None or hash doesn't match, we continue to build it ourselves (lock is already acquired)
            
            try:
                is_first_time = _PIPELINE_CACHE[data_dir_key] is None
                if is_first_time:
                    print(f"[LOG] Building pipeline (first time) for {data_dir_key} - creating chunks and embeddings...")
                    # Clear cancel flag when starting a new build (first time)
                    # Cancel flag from previous operations should not block new builds
                    if _CANCEL_FLAG is not None and _CANCEL_FLAG.is_set():
                        print(f"[LOG] ✅ Clearing stale cancel flag before starting new pipeline build")
                        _CANCEL_FLAG.clear()
                else:
                    print(f"[LOG] Pipeline data changed (hash: {_PIPELINE_DATA_HASH[data_dir_key]} -> {current_hash}), rebuilding chunks and embeddings...")
                
                # OPTIMIZATION: Use lazy_store by default to speed up rebuild
                print("[LOG] Starting pipeline build...")
                
                # Check cancel flag before starting build (only when rebuilding, not first time)
                # For first time builds, we already cleared the flag above
                if not is_first_time:
                    _check_cancel("Before starting pipeline build")
                
                _PIPELINE_BUILDING[data_dir_key] = True
                _PIPELINE_READY[data_dir_key] = False
                
                # Check if cache was reset before build (indicating cancel request)
                # Only check this if NOT first time build (first time builds should proceed)
                # NOTE: If cache is None but data_dir_key is not in _PIPELINE_CACHE, it's a first-time build, not a cancellation
                if not is_first_time and _PIPELINE_CACHE.get(data_dir_key) is None and data_dir_key in _PIPELINE_CACHE:
                    # Cache was explicitly set to None (cancelled), but check if files still exist
                    # If files exist, it might be a race condition - try to rebuild anyway
                    from pathlib import Path
                    cfg = config or PipelineConfig()
                    data_dir = Path(cfg.data_dir)
                    md_files = list(data_dir.glob("*.md"))
                    json_files = list(data_dir.glob("*.json"))
                    
                    if md_files or json_files:
                        # Files still exist, this might be a race condition - clear the cache entry and rebuild
                        print(f"[LOG] ⚠️ Cache was reset but files still exist ({len(md_files)} MD, {len(json_files)} JSON) - rebuilding...")
                        # Remove from cache dict to allow rebuild
                        if data_dir_key in _PIPELINE_CACHE:
                            del _PIPELINE_CACHE[data_dir_key]
                        # Continue with build
                    else:
                        # No files exist, this is a real cancellation
                        print(f"[LOG] ⚠️ Pipeline build cancelled - cache was reset and no files found")
                        _PIPELINE_BUILDING[data_dir_key] = False
                        raise RuntimeError("Pipeline build was cancelled - output directory was cleared")
                
                # Final cancel check before creating pipeline instance
                # Only check if NOT first time build (first time builds should proceed)
                if not is_first_time:
                    _check_cancel("Before creating QAPipeline instance")
                
                try:
                    loop = asyncio.get_running_loop()
                    pipeline_obj = await loop.run_in_executor(
                        None,
                        lambda: QAPipeline(cfg, lazy_store=lazy_store),
                    )
                    _PIPELINE_CACHE[data_dir_key] = pipeline_obj
                    # After build, check if cache was reset (cancelled during build)
                    if _PIPELINE_CACHE.get(data_dir_key) is None:
                        print(f"[LOG] ⚠️ Pipeline build was cancelled (cache reset during build)")
                        _PIPELINE_BUILDING[data_dir_key] = False
                        raise RuntimeError("Pipeline build was cancelled - output directory was cleared during build")
                    _PIPELINE_DATA_HASH[data_dir_key] = current_hash
                    print(f"[LOG] ✅ Pipeline built with {len(_PIPELINE_CACHE[data_dir_key].artifacts.chunks)} chunks (hash: {current_hash[:16]}...)")
                    
                    # Clear cancel flag after successful build (ready for QA)
                    # This ensures that if cancel flag was set from a previous operation, it's cleared now
                    if _CANCEL_FLAG is not None and _CANCEL_FLAG.is_set():
                        print(f"[LOG] ✅ Clearing cancel flag after successful pipeline build (ready for QA)")
                        _CANCEL_FLAG.clear()
                except Exception as e:
                    # If cache was reset during build, log and re-raise
                    if _PIPELINE_CACHE.get(data_dir_key) is None:
                        print(f"[LOG] ⚠️ Pipeline build was cancelled (cache reset): {e}")
                        raise RuntimeError("Pipeline build was cancelled - output directory was cleared") from e
                    else:
                        raise
                finally:
                    _PIPELINE_BUILDING[data_dir_key] = False
                # _PIPELINE_READY will be set inside QAPipeline depending on store status
            finally:
                build_lock.release()
        else:
            print(f"[LOG] ✅ Using cached pipeline (data unchanged, hash: {current_hash[:16]}...) - no re-chunking needed")
            print(f"[LOG]   Cached pipeline has {len(_PIPELINE_CACHE[data_dir_key].artifacts.chunks)} chunks ready to use")
        
        return _PIPELINE_CACHE[data_dir_key]
    except Exception as e:
        print(f"[ERROR] Failed to get pipeline: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        raise


def reset_pipeline_cache(data_dir: Optional[str] = None) -> None:
    """Clear the cached pipeline so it will rebuild on next access.
    
    NOTE: This only clears pipeline cache (chunks, embeddings, corpus).
    Model (Visualized_BGE) is a singleton in memory and is NOT affected.
    Model instance remains loaded and ready for use.
    
    Args:
        data_dir: Optional data directory path to reset. If None, resets all caches.
    """
    global _PIPELINE_CACHE, _PIPELINE_DATA_HASH, _PIPELINE_BUILDING, _PIPELINE_READY, _PIPELINE_PROGRESS
    if data_dir:
        data_dir_key = str(data_dir)
        _PIPELINE_CACHE[data_dir_key] = None
        _PIPELINE_DATA_HASH[data_dir_key] = None
        _PIPELINE_BUILDING[data_dir_key] = False
        _PIPELINE_READY[data_dir_key] = False
        if data_dir_key in _PIPELINE_PROGRESS:
            del _PIPELINE_PROGRESS[data_dir_key]
        print(f"[LOG] Pipeline cache reset for {data_dir_key} (model instance preserved)")
    else:
        _PIPELINE_CACHE.clear()
        _PIPELINE_DATA_HASH.clear()
        _PIPELINE_BUILDING.clear()
        _PIPELINE_READY.clear()
        _PIPELINE_PROGRESS.clear()
        print("[LOG] All pipeline caches reset (model instance preserved)")


async def rebuild_pipeline(config: Optional[PipelineConfig] = None, lazy_store: bool = True, docs: Optional[List[Dict[str, Any]]] = None, chunks: Optional[List[Dict[str, Any]]] = None) -> QAPipeline:
    """Force rebuild of the pipeline and update the cache.
    
    Args:
        config: Pipeline configuration (optional)
        lazy_store: If True (default), delay store building until first query.
                   This makes rebuild much faster (only chunking, no embedding).
        docs: Optional list of documents to use directly (bypasses file loading).
    """
    global _PIPELINE_CACHE, _PIPELINE_DATA_HASH, _PIPELINE_BUILD_LOCKS, _PIPELINE_BUILD_LOCK
    cfg = config or PipelineConfig()
    data_dir_key = str(cfg.data_dir)
    
    # Check cancel flag at the very start
    _check_cancel("At start of rebuild_pipeline")
    
    # Get or create lock for this data_dir to prevent concurrent rebuilds
    with _PIPELINE_BUILD_LOCK:
        if data_dir_key not in _PIPELINE_BUILD_LOCKS:
            _PIPELINE_BUILD_LOCKS[data_dir_key] = threading.Lock()
        build_lock = _PIPELINE_BUILD_LOCKS[data_dir_key]
    
    # Acquire lock to prevent concurrent rebuilds
    acquired = build_lock.acquire(blocking=False)
    if not acquired:
        # Another thread is already building, wait for it to finish
        print(f"[LOG] ⏳ Another rebuild is in progress for {data_dir_key}, waiting...")
        build_lock.acquire(blocking=True)
        # After acquiring lock, check if pipeline was built by the other thread
        if data_dir_key in _PIPELINE_CACHE and _PIPELINE_CACHE[data_dir_key] is not None:
            print(f"[LOG] ✅ Pipeline was built by another thread, reusing it")
            build_lock.release()
            return _PIPELINE_CACHE[data_dir_key]
        # If still None, we continue to build it ourselves (lock is already acquired)
    
    try:
        # Initialize cache entries if needed
        if data_dir_key not in _PIPELINE_CACHE:
            _PIPELINE_CACHE[data_dir_key] = None
        if data_dir_key not in _PIPELINE_DATA_HASH:
            _PIPELINE_DATA_HASH[data_dir_key] = None
        if data_dir_key not in _PIPELINE_BUILDING:
            _PIPELINE_BUILDING[data_dir_key] = False
        if data_dir_key not in _PIPELINE_READY:
            _PIPELINE_READY[data_dir_key] = False
        
        if chunks is not None:
            print(f"[LOG] Force rebuilding pipeline for {data_dir_key} with provided chunks (lazy_store={lazy_store})...")
        elif docs is not None:
            print(f"[LOG] Force rebuilding pipeline for {data_dir_key} with provided docs (lazy_store={lazy_store})...")
        else:
            print(f"[LOG] Force rebuilding pipeline for {data_dir_key} (lazy_store={lazy_store})...")
        # OPTIMIZATION: Use lazy_store by default - rebuild is much faster (no embedding)
        _PIPELINE_BUILDING[data_dir_key] = True
        _PIPELINE_READY[data_dir_key] = False
        
        # Check cancel flag before creating QAPipeline (this is expensive)
        _check_cancel("Before creating QAPipeline instance")
        
        print(f"[LOG] Creating new QAPipeline instance (lazy_store={lazy_store})...")
        loop = asyncio.get_running_loop()
        pipeline_obj = await loop.run_in_executor(
            None,
            lambda: QAPipeline(cfg, lazy_store=lazy_store, docs=docs, chunks=chunks),
        )
        _PIPELINE_CACHE[data_dir_key] = pipeline_obj
        # Only calculate hash if loading from files (for cache invalidation)
        if docs is None:
            _PIPELINE_DATA_HASH[data_dir_key] = _calculate_data_hash(cfg)
            print(f"[LOG] Pipeline rebuilt with hash: {_PIPELINE_DATA_HASH[data_dir_key][:16]}...")
        else:
            # For in-memory docs, use a simple hash based on doc count and first doc_id
            import hashlib
            hash_str = f"{len(docs)}_{docs[0].get('doc_id', 'unknown') if docs else 'empty'}"
            _PIPELINE_DATA_HASH[data_dir_key] = hashlib.md5(hash_str.encode()).hexdigest()
            print(f"[LOG] Pipeline rebuilt with in-memory docs (hash: {_PIPELINE_DATA_HASH[data_dir_key][:16]}...)")
        print(f"[LOG] Store built: {_PIPELINE_CACHE[data_dir_key]._store_built}, Ready: {_PIPELINE_READY[data_dir_key]}")
        _PIPELINE_BUILDING[data_dir_key] = False
        
        # Clear cancel flag after successful rebuild (ready for QA)
        # This ensures that if cancel flag was set from a previous operation, it's cleared now
        if _CANCEL_FLAG is not None and _CANCEL_FLAG.is_set():
            print(f"[LOG] ✅ Clearing cancel flag after successful pipeline rebuild (ready for QA)")
            _CANCEL_FLAG.clear()
        
        # _PIPELINE_READY will be set inside QAPipeline depending on store status
        return _PIPELINE_CACHE[data_dir_key]
    finally:
        build_lock.release()


# -------- Readiness helpers --------
def pipeline_status(pdf_name: Optional[str] = None) -> Dict[str, Any]:
    """Get pipeline status. If pdf_name is provided, return status for that PDF's pipeline."""
    from pathlib import Path
    cfg = PipelineConfig()
    
    # Determine which data_dir to check
    if pdf_name:
        base_data_dir = Path(cfg.data_dir)
        if base_data_dir.name == "uploads":
            base_data_dir = base_data_dir.parent
        data_dir_key = str(base_data_dir / pdf_name)
    else:
        data_dir_key = str(cfg.data_dir)
    
    chunks_count = 0
    pipeline = _PIPELINE_CACHE.get(data_dir_key) if data_dir_key in _PIPELINE_CACHE else None
    if pipeline:
        try:
            chunks_count = len(pipeline.artifacts.chunks)
        except:
            chunks_count = 0
    
    building = _PIPELINE_BUILDING.get(data_dir_key, False) if data_dir_key in _PIPELINE_BUILDING else False
    ready = _PIPELINE_READY.get(data_dir_key, False) if data_dir_key in _PIPELINE_READY else False
    progress = _PIPELINE_PROGRESS.get(data_dir_key, {"percent": 0, "stage": "idle", "message": ""})
    
    return {
        "building": building,
        "ready": ready,
        "has_cache": pipeline is not None,
        "chunks": chunks_count,
        "percent": progress.get("percent", 0),
        "stage": progress.get("stage", "idle"),
        "message": progress.get("message", ""),
    }

