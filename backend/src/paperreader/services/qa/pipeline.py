import asyncio
import os
import json
import hashlib
import threading
import pickle
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from .config import PipelineConfig
from .loaders import load_parsed_jsons
from .chunking import split_sections_into_chunks
from .embeddings import get_embedder
from .retrievers import build_corpus, build_store, build_persistent_store, get_retriever
import re
from .generators import get_generator
from paperreader.database.mongodb import mongodb
from paperreader.services.documents.repository import update_document, to_object_id
from paperreader.services.documents.chunk_repository import get_document_chunks
from paperreader.services.qa.elasticsearch_client import index_chunks


# Pipeline state tracking
_PIPELINE_BUILDING: Dict[str, bool] = {}  # Key: data_dir path
_PIPELINE_READY: Dict[str, bool] = {}  # Key: data_dir path
_PIPELINE_PROGRESS: Dict[str, Dict[str, Any]] = {}  # Key: data_dir path
# Track background embedding resume jobs keyed by document_id
_RESUME_TASKS: Dict[str, asyncio.Task] = {}
_RESUME_LOCK: Optional[asyncio.Lock] = None
# Track documents that are currently being processed (chunking or embedding)
_PROCESSING_DOCUMENTS: Dict[str, str] = {}  # Key: document_id, Value: process_type ("chunking" or "embedding")
_PROCESSING_LOCK = threading.Lock()  # Lock for _PROCESSING_DOCUMENTS
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


def clear_processing_flag(document_id: str, process_type: str = None) -> None:
    """Clear processing flag for a document. Called when chunking/embedding completes."""
    with _PROCESSING_LOCK:
        if process_type:
            # Clear only if matches the process type
            if _PROCESSING_DOCUMENTS.get(document_id) == process_type:
                _PROCESSING_DOCUMENTS.pop(document_id, None)
                print(f"[Pipeline] ✅ Cleared {process_type} processing flag for document {document_id}")
        else:
            # Clear regardless of process type
            if document_id in _PROCESSING_DOCUMENTS:
                _PROCESSING_DOCUMENTS.pop(document_id, None)
                print(f"[Pipeline] ✅ Cleared processing flag for document {document_id}")


def _get_resume_lock() -> asyncio.Lock:
    """Return a lazily initialised asyncio.Lock for resume job coordination."""
    global _RESUME_LOCK
    if _RESUME_LOCK is None:
        _RESUME_LOCK = asyncio.Lock()
    return _RESUME_LOCK


def _set_progress(percent: int, stage: str, message: str = "", data_dir: Optional[str] = None) -> None:
    try:
        progress_key = str(data_dir) if data_dir else "default"
        if progress_key not in _PIPELINE_PROGRESS:
            _PIPELINE_PROGRESS[progress_key] = {"percent": 0, "stage": "idle", "message": ""}
        _PIPELINE_PROGRESS[progress_key]["percent"] = max(0, min(100, int(percent)))
        _PIPELINE_PROGRESS[progress_key]["stage"] = stage
        if message:
            _PIPELINE_PROGRESS[progress_key]["message"] = message
    except Exception as e:
        print(f"[WARNING] Failed to set progress: {e}")


def get_pipeline_progress(data_dir: Optional[str] = None) -> Dict[str, Any]:
    """Get current pipeline build progress."""
    progress_key = str(data_dir) if data_dir else "default"
    return _PIPELINE_PROGRESS.get(progress_key, {"percent": 0, "stage": "idle", "message": ""})


@dataclass
class PipelineArtifacts:
    chunks: List[Dict[str, Any]]
    corpus_texts: List[str]
    store_metadatas: List[Dict[str, Any]]
    persistent_store: Optional[Any] = None


class QAPipeline:
    def __init__(self, config: PipelineConfig, lazy_store: bool = True, docs: Optional[List[Dict[str, Any]]] = None, chunks: Optional[List[Dict[str, Any]]] = None, document_key: Optional[str] = None) -> None:
        self.config = config
        self.lazy_store = lazy_store
        self.document_key = document_key  # Document key for Elasticsearch retrieval
        self._build(docs=docs, chunks=chunks)

    def _build(self, docs: Optional[List[Dict[str, Any]]] = None, chunks: Optional[List[Dict[str, Any]]] = None) -> None:
        import time
        start_time = time.time()
        data_dir_key = str(self.config.data_dir)
        
        # If using Elasticsearch (document_key provided), skip file loading and chunking
        if self.document_key:
            print(f"[LOG] Using Elasticsearch - skipping file loading and chunking")
            chunks = chunks or []
            chunk_time = 0.0
            embedder_time = 0.0
            corpus_time = 0.0
            store_time = 0.0
            
            _set_progress(100, "elasticsearch_ready", f"Using Elasticsearch for document_key: {self.document_key}", data_dir_key)
            
            # Load embedder (needed for query encoding)
            embedder_start = time.time()
            try:
                embedder = get_embedder(self.config.embedder_name)
                embedder_time = time.time() - embedder_start
                print(f"[LOG] ✅ Embedder instance obtained in {embedder_time:.2f}s")
            except RuntimeError as e:
                raise RuntimeError(f"Failed to initialize embedder: {e}")
            
            # Create empty corpus and store (not used with Elasticsearch)
            from .retrievers import InMemoryVectorStore
            corpus = build_corpus(chunks)
            store = InMemoryVectorStore(
                dense_vectors=None,
                metadatas=[],
                tfidf_matrix=None,
                tfidf_vectorizer=None,
            )
            self._store_built = True  # Mark as built (using Elasticsearch)
            # Skip the rest of the build process when using Elasticsearch
            # Set ready flag
            _PIPELINE_READY[data_dir_key] = True
        else:
            # Check cancel flag at the very start of build
            _check_cancel("At start of pipeline build")
            
            # If chunks provided directly, use them (skip chunking)
            if chunks is not None:
                print(f"[LOG] ✅ Using provided chunks directly (skipping chunking)")
                chunk_time = 0.0
                _set_progress(30, "chunking_done", f"Using provided chunks ({len(chunks)} chunks)", data_dir_key)
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

            # Load embedder (lazy singleton)
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
                        print(f"[LOG] Loading model (this will also load/download tokenizer if needed)...")
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
                store = build_store(corpus, embedder, cached_embeddings=None)
                _check_cancel("After building store")
                store_time = time.time() - store_start
                print(f"[LOG] ✅ Memory store built with {len(store.metadatas)} metadatas in {store_time:.2f}s")
                _set_progress(95, "store_ready", "Store built", data_dir_key)
                # Mark this pipeline as ready
                _PIPELINE_READY[data_dir_key] = True
                
                # Embeddings are saved to Elasticsearch
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
                # Mark as not ready yet (will be ready after store is built)
                _PIPELINE_READY[data_dir_key] = False
        
        total_time = time.time() - start_time
        print(f"[LOG] ✅ Pipeline build completed in {total_time:.2f}s total")
        print(f"[LOG]   - Chunking: {chunk_time:.2f}s ({chunk_time/total_time*100:.1f}%)")
        print(f"[LOG]   - Embedder: {embedder_time:.2f}s ({embedder_time/total_time*100:.1f}%)")
        print(f"[LOG]   - Corpus: {corpus_time:.2f}s ({corpus_time/total_time*100:.1f}%)")
        if not self.lazy_store:
            print(f"[LOG]   - Store: {store_time:.2f}s ({store_time/total_time*100:.1f}%)")

        # Get PDF name filter from config if available
        pdf_name_filter = getattr(self.config, '_pdf_name_filter', None)
        # Use Elasticsearch if document_key is available, otherwise use in-memory store
        use_elasticsearch = self.document_key is not None
        retriever = get_retriever(
            self.config.retriever_name, 
            store, 
            embedder, 
            pdf_name_filter=pdf_name_filter,
            document_key=self.document_key,
            use_elasticsearch=use_elasticsearch
        )
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
        import time
        if self._store_built:
            return
        
        data_dir_key = str(self.config.data_dir)
        print(f"[LOG] 🔨 Building store on-demand (first query) for {len(self._chunks)} chunks...")
        print(f"[LOG] This may take 1-2 minutes for large documents. Please wait...")
        
        _set_progress(70, "store_building", "Building memory store (on-demand)", data_dir_key)
        store_start = time.time()
        
        try:
            from .retrievers import build_store
            self.store = build_store(self._corpus, self.embedder, cached_embeddings=None)
            
            # Update retriever with new store
            from .retrievers import get_retriever
            pdf_name_filter = getattr(self.config, '_pdf_name_filter', None)
            self.retriever = get_retriever(self.config.retriever_name, self.store, self.embedder, pdf_name_filter=pdf_name_filter)
            
            store_time = time.time() - store_start
            print(f"[LOG] ✅ Store built in {store_time:.2f}s - ready for queries")
            self._store_built = True
            
            # Embeddings are saved to Elasticsearch
            
            # Mark ready now (use data_dir_key from config)
            global _PIPELINE_READY
            _PIPELINE_READY[data_dir_key] = True
            _set_progress(100, "ready", "Pipeline ready", data_dir_key)
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
        
        # Check if we should use Elasticsearch
        use_elasticsearch = self.document_key and self.retriever.use_elasticsearch
        print(f"[DEBUG] Pipeline answer() - document_key: {self.document_key}, use_elasticsearch: {use_elasticsearch}")
        
        # Only build store if not using Elasticsearch
        if not use_elasticsearch:
            # OPTIMIZATION: Build store on-demand if lazy loading was used
            self._ensure_store_built()
            # Check if store was built successfully
            if not self.retriever.filtered_store:
                # Provide more detailed error message
                error_msg = "No chunks available for retrieval."
                if not self.document_key:
                    error_msg += " document_key is missing. Please ensure the PDF has been uploaded and processed, and the session has the correct document_key in metadata."
                else:
                    error_msg += " The document may not have been processed yet, or there are no chunks in the document. Please ensure the PDF has been uploaded and processed."
                raise ValueError(error_msg)
        
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
        
        hits = await self.retriever.retrieve(question, top_k=self.config.top_k, image=query_image)
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
            if gen_out is None:
                raise ValueError(f"Generator {type(self.generator).__name__} returned None")
            print(f"[DEBUG] ✅ Generator completed successfully")
        except Exception as e:
            print(f"[ERROR] ===== GENERATOR FAILED =====")
            print(f"[ERROR] Generator failed: {e}. Using ExtractiveGenerator fallback.")
            try:
                from .generators import ExtractiveGenerator
                # fallback uses text-only
                text_contexts = [h.get("text", "") for h in hits]
                answer = ExtractiveGenerator().generate(question, text_contexts, max_tokens=self.config.max_tokens, query_image=query_image, query_images=user_images, chat_history=chat_history)
                gen_out = {"answer": answer, "citations": []}
                print(f"[ERROR] Using fallback generator - this explains why you get document text!")
            except Exception as fallback_error:
                print(f"[ERROR] Fallback generator also failed: {fallback_error}")
                # Last resort: return a basic error message
                gen_out = {
                    "answer": f"I encountered an error while generating an answer. Original error: {str(e)}. Fallback also failed: {str(fallback_error)}",
                    "citations": []
                }

        # Validate gen_out is not None
        if gen_out is None:
            print(f"[ERROR] Generator output is None - this should not happen!")
            raise ValueError("Generator returned None. Please check generator implementation and logs.")

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
        document_ids_used = set()  # Track document IDs used in citations
        for citation_num, hit_idx in enumerate(unique_ordered_indices, start=1):
            h = hits[hit_idx]
            meta = h.get("metadata", {})
            title = meta.get("title")
            page = meta.get("page")
            doc_id = meta.get("doc_id") or meta.get("document_id")
            document_key = meta.get("document_key") or meta.get("doc_key")
            # Get full text from hit - ensure we get the complete text
            text_content = h.get("text", "")
            if not text_content and meta.get("text"):
                # Fallback: try to get text from metadata
                text_content = meta.get("text", "")
            excerpt = _norm_excerpt(text_content)
            
            citation_info = {
                "citation_number": citation_num,
                "doc_id": doc_id,
                "document_id": doc_id,  # Alias for consistency
                "document_key": document_key,
                "title": title,
                "page": page,
                "excerpt": excerpt
            }
            cited.append(citation_info)
            citation_map[hit_idx] = citation_info
            if doc_id:
                document_ids_used.add(str(doc_id))
            if document_key:
                document_ids_used.add(document_key)

        # Get confidence from generator output if available
        confidence = gen_out.get("confidence")

        return {
            "question": question,
            "answer": gen_out.get("answer", ""),
            "citations": unique_ordered_indices,  # Only valid hit indices that have citations
            "cited_sections": cited,  # Only citations that are actually used
            "retriever_scores": [{"index": h["index"], "score": h["score"]} for h in hits],
            "confidence": confidence,
            "document_ids_used": list(document_ids_used),  # List of document IDs used in answer
            "used_chat_history": "[CHAT_HISTORY]" in gen_out.get("answer", "")  # Check if chat history was used
        }


def _calculate_data_hash(config: PipelineConfig) -> str:
    """Calculate hash of all parsed files to detect changes."""
    data_dir = Path(config.data_dir)
    if not data_dir.exists():
        return "empty"
    
    hasher = hashlib.md5()
    md_files = sorted(data_dir.glob("*.md"))
    json_files = sorted(data_dir.glob("*.json"))
    
    if not md_files and not json_files:
        return "empty"
    
    for file_path in md_files + json_files:
        try:
            # Include file name and content hash for better detection
            with open(file_path, "rb") as f:
                content = f.read()
                hasher.update(f"{file_path.name}:".encode())
                hasher.update(content)
        except Exception:
            # Fallback to name + size if content hash fails
            try:
                stat = file_path.stat()
                hasher.update(f"{file_path.name}:{stat.st_size}".encode())
            except:
                pass
    
    return hasher.hexdigest()


async def get_pipeline(config: Optional[PipelineConfig] = None, lazy_store: bool = True, pdf_name: Optional[str] = None, document_key: Optional[str] = None) -> QAPipeline:
    """Return pipeline. If document_key is provided, creates a lightweight pipeline using Elasticsearch.
    
    Args:
        config: Pipeline configuration (optional)
        lazy_store: If True (default), delay store building until first query. 
                   This makes pipeline building much faster but first query will be slower.
                   If False, build store immediately (slower build, faster first query).
        pdf_name: Optional PDF name to use PDF-specific data directory
        document_key: Optional document key for Elasticsearch retrieval (if provided, uses Elasticsearch)
    """
    cfg = config or PipelineConfig()
    
    # If document_key is provided, use Elasticsearch - skip file loading and chunking
    if document_key:
        print(f"[LOG] Using Elasticsearch pipeline for document_key: {document_key}")
        # Create a lightweight pipeline that only uses Elasticsearch
        # Pass empty chunks to skip file loading and chunking
        loop = asyncio.get_running_loop()
        pipeline_obj = await loop.run_in_executor(
            None,
            lambda: QAPipeline(cfg, lazy_store=True, chunks=[], document_key=document_key),
        )
        print(f"[LOG] ✅ Created Elasticsearch-based pipeline for document_key: {document_key}")
        return pipeline_obj
    
    # Fallback to file-based pipeline (for backward compatibility)
    # If pdf_name is provided, filter files by PDF name pattern
    if pdf_name:
        from pathlib import Path
        base_data_dir = Path(cfg.data_dir)
        # Remove "uploads" if present
        if base_data_dir.name == "uploads":
            base_data_dir = base_data_dir.parent
        cfg.data_dir = base_data_dir
        if not hasattr(cfg, '_pdf_name_filter'):
            cfg._pdf_name_filter = pdf_name
        print(f"[LOG] Using PDF-specific filter: {pdf_name} (data directory: {base_data_dir})")
        data_dir_key = f"{base_data_dir}::{pdf_name}"
    else:
        data_dir_key = str(cfg.data_dir)
    
    try:
        # Initialize state for this data_dir if needed
        if data_dir_key not in _PIPELINE_BUILDING:
            _PIPELINE_BUILDING[data_dir_key] = False
        if data_dir_key not in _PIPELINE_READY:
            _PIPELINE_READY[data_dir_key] = False
        
        # Always build pipeline (no cache)
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
            # Wait for other thread to finish building
            build_lock.release()
            # Wait a bit and try again (other thread should finish soon)
            await asyncio.sleep(0.1)
            return await get_pipeline(config, lazy_store=lazy_store, pdf_name=pdf_name, document_key=document_key)
        
        try:
            print(f"[LOG] Building pipeline for {data_dir_key} - creating chunks and embeddings...")
            # Clear cancel flag when starting a new build
            if _CANCEL_FLAG is not None and _CANCEL_FLAG.is_set():
                print(f"[LOG] ✅ Clearing stale cancel flag before starting new pipeline build")
                _CANCEL_FLAG.clear()
            
            print("[LOG] Starting pipeline build...")
            
            _PIPELINE_BUILDING[data_dir_key] = True
            _PIPELINE_READY[data_dir_key] = False
            
            _check_cancel("Before creating QAPipeline instance")
            
            try:
                loop = asyncio.get_running_loop()
                pipeline_obj = await loop.run_in_executor(
                    None,
                    lambda: QAPipeline(cfg, lazy_store=lazy_store, document_key=document_key),
                )
                print(f"[LOG] ✅ Pipeline built with {len(pipeline_obj.artifacts.chunks)} chunks")
                
                # Clear cancel flag after successful build (ready for QA)
                # This ensures that if cancel flag was set from a previous operation, it's cleared now
                if _CANCEL_FLAG is not None and _CANCEL_FLAG.is_set():
                    print(f"[LOG] ✅ Clearing cancel flag after successful pipeline build (ready for QA)")
                    _CANCEL_FLAG.clear()
            except Exception as e:
                raise
            finally:
                _PIPELINE_BUILDING[data_dir_key] = False
            # _PIPELINE_READY will be set inside QAPipeline depending on store status
        finally:
            build_lock.release()
        
        return pipeline_obj
    except Exception as e:
        print(f"[ERROR] Failed to get pipeline: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        raise


def reset_pipeline_state(data_dir: Optional[str] = None) -> None:
    """Reset pipeline building state.
    
    Args:
        data_dir: Optional data directory path to reset. If None, resets all states.
    """
    global _PIPELINE_BUILDING, _PIPELINE_READY, _PIPELINE_PROGRESS
    if data_dir:
        data_dir_key = str(data_dir)
        _PIPELINE_BUILDING[data_dir_key] = False
        _PIPELINE_READY[data_dir_key] = False
        if data_dir_key in _PIPELINE_PROGRESS:
            del _PIPELINE_PROGRESS[data_dir_key]
        print(f"[LOG] Pipeline state reset for {data_dir_key}")
    else:
        _PIPELINE_BUILDING.clear()
        _PIPELINE_READY.clear()
        _PIPELINE_PROGRESS.clear()
        print("[LOG] All pipeline states reset")


async def rebuild_pipeline(config: Optional[PipelineConfig] = None, lazy_store: bool = True, docs: Optional[List[Dict[str, Any]]] = None, chunks: Optional[List[Dict[str, Any]]] = None, document_key: Optional[str] = None) -> QAPipeline:
    """Force rebuild of the pipeline.
    
    Args:
        config: Pipeline configuration (optional)
        lazy_store: If True (default), delay store building until first query.
                   This makes rebuild much faster (only chunking, no embedding).
        docs: Optional list of documents to use directly (bypasses file loading).
        chunks: Optional list of chunks to use directly (bypasses chunking).
        document_key: Optional document key for Elasticsearch.
    """
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
        build_lock.release()
        # Wait a bit and try again
        await asyncio.sleep(0.1)
        return await rebuild_pipeline(config, lazy_store=lazy_store, docs=docs, chunks=chunks, document_key=document_key)
    
    try:
        # Initialize state if needed
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
        _PIPELINE_BUILDING[data_dir_key] = True
        _PIPELINE_READY[data_dir_key] = False
        
        # Check cancel flag before creating QAPipeline (this is expensive)
        _check_cancel("Before creating QAPipeline instance")
        
        print(f"[LOG] Creating new QAPipeline instance (lazy_store={lazy_store})...")
        # Extract document_key from config if available
        doc_key = getattr(cfg, '_document_key', None) or document_key
        loop = asyncio.get_running_loop()
        pipeline_obj = await loop.run_in_executor(
            None,
            lambda: QAPipeline(cfg, lazy_store=lazy_store, docs=docs, chunks=chunks, document_key=doc_key),
        )
        print(f"[LOG] Store built: {pipeline_obj._store_built}, Ready: {_PIPELINE_READY[data_dir_key]}")
        _PIPELINE_BUILDING[data_dir_key] = False
        
        # Clear cancel flag after successful rebuild (ready for QA)
        # This ensures that if cancel flag was set from a previous operation, it's cleared now
        if _CANCEL_FLAG is not None and _CANCEL_FLAG.is_set():
            print(f"[LOG] ✅ Clearing cancel flag after successful pipeline rebuild (ready for QA)")
            _CANCEL_FLAG.clear()
        
        # _PIPELINE_READY will be set inside QAPipeline depending on store status
        return pipeline_obj
    finally:
        build_lock.release()


# -------- Readiness helpers --------
async def _find_document_by_key(doc_key: str) -> Optional[Dict[str, Any]]:
    """Locate a document record using document_id, title, or original filename."""
    collection = mongodb.get_collection("documents")
    # Try by ObjectId first
    try:
        from bson import ObjectId  # Local import to avoid global dependency if unused

        obj_id = ObjectId(doc_key)
        document = await collection.find_one({"_id": obj_id})
        if document:
            return document
    except Exception:
        pass

    # Exact title match
    document = await collection.find_one({"title": doc_key})
    if document:
        return document

    # Match original filename (with or without .pdf extension)
    pattern = re.compile(rf"^{re.escape(doc_key)}(\.pdf)?$", re.IGNORECASE)
    document = await collection.find_one({"original_filename": {"$regex": pattern}})
    if document:
        return document

    # Fallback: partial title match
    document = await collection.find_one({"title": {"$regex": pattern}})
    return document


def _normalise_document_key(input_key: str, document: Optional[Dict[str, Any]]) -> str:
    """Return a canonical document key (prefer stored title)."""
    if document:
        if document.get("title"):
            return str(document["title"])
        original = document.get("original_filename")
        if original:
            return Path(original).stem
    if input_key.lower().endswith(".pdf"):
        return input_key[:-4]
    return input_key


async def _resolve_chunk_count(document_id: Optional[str], document_key: str, existing_count: Optional[int]) -> int:
    """Determine the number of chunks stored for the document."""
    if existing_count and existing_count > 0:
        return int(existing_count)

    collection = mongodb.get_collection("chunks")
    query: Dict[str, Any] = {}

    obj_id = to_object_id(document_id) if document_id else None
    if obj_id:
        query["document_id"] = obj_id
    elif document_key:
        query["document_key"] = document_key
    else:
        return 0

    try:
        return await collection.count_documents(query)
    except Exception as exc:
        print(f"[Pipeline] ⚠️ Failed to count chunks for document {document_id} ({document_key}): {exc}")
        return 0


async def _maybe_schedule_embedding_resume(document_id: str, document_key: str) -> None:
    """Start a background job to regenerate embeddings if not already running."""
    lock = _get_resume_lock()
    async with lock:
        current_task = _RESUME_TASKS.get(document_id)
        if current_task and not current_task.done():
            return

        obj_id = to_object_id(document_id)
        if obj_id:
            try:
                await update_document(obj_id, {"embedding_status": "processing"})
            except Exception as exc:
                print(f"[Pipeline] ⚠️ Unable to mark document {document_id} as processing: {exc}")

        loop = asyncio.get_running_loop()
        task = loop.create_task(_resume_embeddings_job(document_id, document_key))
        _RESUME_TASKS[document_id] = task


async def _resume_embeddings_job(document_id: str, document_key: str) -> None:
    """Background task that regenerates embeddings and re-indexes chunks for a document."""
    try:
        chunks = await get_document_chunks(document_id=document_id)
        if not chunks:
            print(f"[Pipeline] ⚠️ No chunks found when attempting to resume embeddings for {document_id}")
            obj_id = to_object_id(document_id)
            if obj_id:
                try:
                    await update_document(obj_id, {"embedding_status": "error"})
                except Exception as exc:
                    print(f"[Pipeline] ⚠️ Failed to update document {document_id} after missing chunks: {exc}")
            return

        embedder = get_embedder(None)
        embeddings = await asyncio.to_thread(embedder.embed_chunks, chunks, document_key)

        await index_chunks(
            document_id=document_id,
            document_key=document_key,
            chunks=chunks,
            embeddings=embeddings,
        )

        obj_id = to_object_id(document_id)
        if obj_id:
            try:
                await update_document(
                    obj_id,
                    {
                        "embedding_status": "ready",
                        "embedding_updated_at": datetime.utcnow(),
                        "chunk_count": len(chunks),
                        "status": "ready",
                    },
                )
            except Exception as exc:
                print(f"[Pipeline] ⚠️ Failed to mark document {document_id} as ready: {exc}")
        
        # Clear processing flag when embedding completes
        clear_processing_flag(document_id, "embedding")
    except Exception as exc:
        print(f"[Pipeline] ❌ Embedding resume job failed for document {document_id}: {exc}")
        import traceback

        print(f"[Pipeline] Traceback:\n{traceback.format_exc()}")
        obj_id = to_object_id(document_id)
        if obj_id:
            try:
                await update_document(obj_id, {"embedding_status": "error"})
            except Exception as update_exc:
                print(f"[Pipeline] ⚠️ Failed to mark document {document_id} as error: {update_exc}")
    finally:
        lock = _get_resume_lock()
        async with lock:
            task = _RESUME_TASKS.pop(document_id, None)
            if task and not task.done():
                task.cancel()
        
        # Clear processing flag in finally block
        clear_processing_flag(document_id, "embedding")


async def _maybe_trigger_chunking(document_id: str, document: Dict[str, Any]) -> bool:
    """Trigger chunking for a document that exists but has no chunks.
    
    Returns True if chunking was triggered, False otherwise.
    """
    # Check if already processing
    with _PROCESSING_LOCK:
        if document_id in _PROCESSING_DOCUMENTS:
            process_type = _PROCESSING_DOCUMENTS.get(document_id)
            print(f"[Pipeline] Document {document_id} is already being processed ({process_type}), skipping chunking trigger")
            return False
        # Mark as processing chunking
        _PROCESSING_DOCUMENTS[document_id] = "chunking"
    
    stored_path = document.get("stored_path")
    if not stored_path:
        with _PROCESSING_LOCK:
            _PROCESSING_DOCUMENTS.pop(document_id, None)
        return False
    
    document_status = str(document.get("status") or "unknown").lower()
    # Only trigger if document is not actively being processed
    if document_status in {"uploading", "parsing", "processing"}:
        with _PROCESSING_LOCK:
            _PROCESSING_DOCUMENTS.pop(document_id, None)
        return False
    
    # Check if chunks already exist
    chunk_count = await _resolve_chunk_count(document_id, None, document.get("chunk_count"))
    if chunk_count > 0:
        with _PROCESSING_LOCK:
            _PROCESSING_DOCUMENTS.pop(document_id, None)
        return False
    
    # Trigger parsing by calling the internal API
    try:
        import httpx
        from paperreader.services.documents.minio_client import get_minio_client
        
        MINIO_BUCKET = os.getenv("MINIO_BUCKET", "pdf-documents")
        BACKEND_INTERNAL_URL = os.getenv("BACKEND_INTERNAL_URL", "http://127.0.0.1:8000")
        
        # Download file from MinIO
        client = get_minio_client()
        file_data = await asyncio.to_thread(
            lambda: client.get_object(MINIO_BUCKET, stored_path).read()
        )
        
        filename = document.get("original_filename") or f"document-{document_id}.pdf"
        
        # Call save-and-parse endpoint
        url = f"{BACKEND_INTERNAL_URL}/api/pdf/save-and-parse/"
        async with httpx.AsyncClient(timeout=240.0) as http_client:
            files = {"files": (filename, file_data, "application/pdf")}
            headers = {"X-Document-Id": document_id}
            resp = await http_client.post(url, files=files, headers=headers)
            
            if resp.status_code == 200:
                print(f"[Pipeline] ✅ Triggered chunking for document {document_id}")
                # Update document status to parsing
                obj_id = to_object_id(document_id)
                if obj_id:
                    await update_document(obj_id, {"status": "parsing"})
                # Keep processing flag - will be cleared when chunking completes
                return True
            else:
                print(f"[Pipeline] ⚠️ Failed to trigger chunking for document {document_id}: HTTP {resp.status_code}")
                with _PROCESSING_LOCK:
                    _PROCESSING_DOCUMENTS.pop(document_id, None)
                return False
    except Exception as exc:
        print(f"[Pipeline] ⚠️ Error triggering chunking for document {document_id}: {exc}")
        import traceback
        print(f"[Pipeline] Traceback: {traceback.format_exc()}")
        with _PROCESSING_LOCK:
            _PROCESSING_DOCUMENTS.pop(document_id, None)
        return False


async def pipeline_status(pdf_name: Optional[str] = None, document_key: Optional[str] = None) -> Dict[str, Any]:
    """Get pipeline status by checking database (Elasticsearch/MongoDB).
    
    Args:
        pdf_name: Optional PDF name to check
        document_key: Optional document key to check in database
    """
    # Use document_key if provided, otherwise use pdf_name
    input_key = (document_key or pdf_name or "").strip()

    if not input_key:
        return {
            "building": False,
            "ready": False,
            "percent": 0,
            "stage": "idle",
            "message": "No document key provided",
        }

    try:
        document = await _find_document_by_key(input_key)
        if not document:
            return {
                "building": False,
                "ready": False,
                "percent": 0,
                "stage": "not_found",
                "message": "Document not found. Please upload or select a PDF first.",
                "document_key": input_key,
            }

        document_id = str(document.get("_id"))
        canonical_key = _normalise_document_key(input_key, document)
        chunk_count = await _resolve_chunk_count(document_id, canonical_key, document.get("chunk_count"))

        raw_embedding_status = document.get("embedding_status") or "pending"
        embedding_status = str(raw_embedding_status).lower()
        raw_document_status = document.get("status") or "unknown"
        document_status = str(raw_document_status).lower()

        resume_task = _RESUME_TASKS.get(document_id)
        resume_running = bool(resume_task and not resume_task.done())

        ready = embedding_status == "ready" and chunk_count > 0 and document_status in {"ready", "completed"}

        building = False
        percent = 0
        stage = "idle"
        message = "Waiting for processing to begin"
        resume_triggered = False
        chunking_triggered = False

        # Trigger chunking if document exists but has no chunks and is not actively processing
        if chunk_count == 0 and document_status not in {"uploading", "parsing", "processing"}:
            chunking_triggered = await _maybe_trigger_chunking(document_id, document)
            if chunking_triggered:
                document_status = "parsing"
                building = True
                percent = 25
                stage = "chunking"
                message = "Starting chunk generation..."

        # Check if already processing embedding
        with _PROCESSING_LOCK:
            is_processing_embedding = _PROCESSING_DOCUMENTS.get(document_id) == "embedding"
        
        if chunk_count > 0 and embedding_status not in {"ready", "processing"} and not is_processing_embedding:
            # Mark as processing embedding
            with _PROCESSING_LOCK:
                _PROCESSING_DOCUMENTS[document_id] = "embedding"
            await _maybe_schedule_embedding_resume(document_id, canonical_key)
            resume_running = True
            resume_triggered = True
            embedding_status = "processing"
        elif is_processing_embedding:
            # Already processing, just update status
            resume_running = True
            embedding_status = "processing"

        if ready:
            building = False
            percent = 100
            stage = "ready"
            message = f"Embeddings ready ({chunk_count} chunks indexed)"
        elif resume_running or embedding_status == "processing":
            building = True
            percent = 85
            stage = "embedding"
            message = f"Regenerating embeddings ({chunk_count} chunks)…"
        elif chunk_count == 0:
            building = document_status in {"uploading", "parsing", "processing", "pending", "queued"} or chunking_triggered
            percent = 25 if building else 0
            stage = "chunking" if building else "idle"
            message = "Waiting for chunk generation" if not chunking_triggered else "Starting chunk generation..."
        else:
            # Chunks exist but embeddings not ready (and not currently processing)
            building = document_status in {"uploading", "parsing", "processing", "pending", "queued"}
            percent = 60 if building else 50
            stage = "pending"
            message = "Chunks available. Preparing to build embeddings…"

        response = {
            "building": building or resume_running or embedding_status == "processing",
            "ready": ready,
            "percent": percent,
            "stage": stage,
            "message": message,
            "chunk_count": chunk_count,
            "document_id": document_id,
            "document_key": canonical_key,
            "embedding_status": embedding_status,
            "document_status": document_status,
            "resume_running": resume_running,
            "resume_triggered": resume_triggered,
        }

        print(
            "[STATUS] Pipeline status check: "
            f"building={response['building']}, ready={response['ready']}, "
            f"embedding_status={embedding_status}, document_status={document_status}, "
            f"chunk_count={chunk_count}, pdf_name={pdf_name}, document_key={document_key}"
        )

        return response
    except Exception as e:
        print(f"[ERROR] Failed to check pipeline status: {e}")
        import traceback

        print(f"[ERROR] Traceback:\n{traceback.format_exc()}")
        return {
            "building": False,
            "ready": False,
            "percent": 0,
            "stage": "error",
            "message": f"Error checking status: {str(e)}",
            "document_key": input_key,
        }
