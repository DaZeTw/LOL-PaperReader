from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import torch
import numpy as np
from pathlib import Path
import threading
import os
import hashlib
import pickle
from paperreader.services.documents.minio_client import get_minio_client


# ------------------------------
# Abstract base class
# ------------------------------
class Embedder(ABC):
    @abstractmethod
    def embed(self, texts: List[str]) -> List[List[float]]:
        ...


# ------------------------------
# VisualizedBGE Embedder (Singleton)
# ------------------------------
class VisualizedBGEEmbedder(Embedder):
    """Embedder backed by Visualized_BGE with Lazy Loading (cross-platform safe)."""
    
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, model_name: str = "BAAI/bge-m3", model_weight_path: Optional[str] = None):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(VisualizedBGEEmbedder, cls).__new__(cls)
        return cls._instance

    def __init__(self, model_name: str = "BAAI/bge-m3", model_weight_path: Optional[str] = None) -> None:
        # Only initialize once
        if hasattr(self, '_initialized'):
            return
            
        self.model_name = model_name
        # Resolve weight path: ENV override, provided arg, common fallbacks
        env_path = os.getenv("VISUAL_BGE_WEIGHTS")
        candidate = model_weight_path or env_path or "Visualized_m3.pth"
        if not Path(candidate).exists():
            for alt in [
                "src/Visualized_m3.pth",
                str(Path(__file__).resolve().parents[3] / "src" / "Visualized_m3.pth"),  # /app/src/Visualized_m3.pth
            ]:
                if Path(alt).exists():
                    candidate = alt
                    break
        self.model_weight_path = candidate
        self.model = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._torch = torch
        self._loading_lock = False
        self._initialized = True
        # Cache directory for embeddings
        self._cache_dir = Path(__file__).resolve().parent.parent.parent / "cache" / "embeddings"
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    # --------------------------
    # Lazy model loading
    # --------------------------
    def _ensure_model(self):
        # If model is already loaded, skip
        if self.model is not None:
            print("[LOG] ✅ Model already loaded, skipping reload")
            return
        
        # If already loading in another thread, wait for it
        if self._loading_lock:
            # Wait a bit for the other thread to finish
            import time
            max_wait = 300  # 5 minutes max wait
            waited = 0
            while self._loading_lock and waited < max_wait:
                time.sleep(0.1)
                waited += 0.1
                # Check if model was loaded by other thread
                if self.model is not None:
                    return
            if self._loading_lock:
                raise RuntimeError("Model loading timeout - another thread is still loading")
        
        if self.model is None:
            self._loading_lock = True
            try:
                print(f"🔹 Loading Visualized_BGE model from {self.model_weight_path} ...")
                print(f"[LOG] This will also load tokenizer from HuggingFace (may download if not cached)...")
                from visual_bge.modeling import Visualized_BGE

                model_container = {}
                error_container = {}

                def load_model():
                    try:
                        print(f"[LOG] Starting Visualized_BGE initialization (model + tokenizer)...")
                        model_container["model"] = Visualized_BGE(
                            model_name_bge=self.model_name,
                            model_weight=self.model_weight_path
                        )
                        print(f"[LOG] ✅ Visualized_BGE initialization completed (model + tokenizer loaded)")
                    except Exception as e:
                        error_container["error"] = e
                        import traceback
                        error_container["traceback"] = traceback.format_exc()

                loader_thread = threading.Thread(target=load_model)
                loader_thread.start()
                # Extend timeout to allow heavy weight load on CPU
                timeout_s = int(os.getenv("VISUAL_BGE_LOAD_TIMEOUT", "300"))
                print(f"[LOG] Waiting for model+tokenizer load (timeout: {timeout_s}s)...")
                loader_thread.join(timeout=timeout_s)

                if loader_thread.is_alive():
                    print(f"[LOG] ⚠️ Model loading timeout (>{timeout_s}s) - this may be due to tokenizer download")
                    raise TimeoutError(f"Model loading timeout (>{timeout_s}s)")
                
                if "error" in error_container:
                    print(f"[LOG] ❌ Error during model loading: {error_container['error']}")
                    print(f"[LOG] Traceback: {error_container.get('traceback', '')}")
                    raise error_container["error"]

                self.model = model_container["model"]
                self.model.eval()
                self.model.to(self.device)
                print("✅ Visualized_BGE loaded successfully (model + tokenizer ready).")

            except Exception as e:
                print(f"❌ Failed to load Visualized_BGE model: {e}")
                raise RuntimeError(f"Model loading failed: {e}")
            finally:
                self._loading_lock = False

    # --------------------------
    # Embed text list
    # --------------------------
    def embed(self, texts):
        self._ensure_model()
        
        # Import cancel check function
        from .pipeline import _check_cancel
        
        with torch.no_grad():
            # Process each text individually to avoid confusion with image parameter
            embeddings = []
            for idx, text in enumerate(texts):
                # Check cancel before processing each text
                try:
                    _check_cancel(f"Before embedding text {idx + 1}/{len(texts)}")
                except RuntimeError as e:
                    if "cancelled" in str(e).lower():
                        print(f"[LOG] ⚠️ Embedding cancelled while processing text {idx + 1}")
                        raise
                
                if isinstance(text, str) and text.strip():
                    # Explicitly pass text parameter, not image
                    emb = self.model.encode(image=None, text=text)
                    embeddings.append(emb.detach().cpu().numpy().reshape(-1).tolist())
                else:
                    # Handle empty or invalid text
                    print(f"[WARNING] Skipping invalid text: {type(text)} - {text}")
                    # Create zero embedding as fallback
                    embeddings.append([0.0] * 1024)  # Assuming 1024-dim embedding
        return embeddings

    # --------------------------
    # Encode query with image+text (safe timeout)
    # --------------------------
    def encode_query(self, *, image: str | None = None, text: str | None = None) -> List[float]:
        self._ensure_model()

        result_container = {}
        error_container = {}

        def encode_job():
            try:
                with self._torch.no_grad():
                    if image and text:
                        # Handle base64 data URLs
                        if image.startswith("data:image/"):
                            # Convert base64 data URL to temporary file
                            import tempfile
                            import base64
                            from PIL import Image
                            import io
                            
                            # Extract base64 data
                            header, data = image.split(',', 1)
                            img_data = base64.b64decode(data)
                            
                            # Create temporary file
                            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                                tmp_file.write(img_data)
                                tmp_path = tmp_file.name
                            
                            try:
                                emb = self.model.encode(image=tmp_path, text=text)
                            finally:
                                # Clean up temporary file
                                import os
                                try:
                                    os.unlink(tmp_path)
                                except:
                                    pass
                        else:
                            emb = self.model.encode(image=image, text=text)
                    elif image:
                        # Handle base64 data URLs
                        if image.startswith("data:image/"):
                            # Convert base64 data URL to temporary file
                            import tempfile
                            import base64
                            from PIL import Image
                            import io
                            
                            # Extract base64 data
                            header, data = image.split(',', 1)
                            img_data = base64.b64decode(data)
                            
                            # Create temporary file
                            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                                tmp_file.write(img_data)
                                tmp_path = tmp_file.name
                            
                            try:
                                emb = self.model.encode(image=tmp_path)
                            finally:
                                # Clean up temporary file
                                import os
                                try:
                                    os.unlink(tmp_path)
                                except:
                                    pass
                        else:
                            emb = self.model.encode(image=image)
                    else:
                        emb = self.model.encode(text=text or "")
                    result_container["emb"] = emb.detach().cpu().numpy().reshape(-1).tolist()
            except Exception as e:
                error_container["err"] = e

        t = threading.Thread(target=encode_job)
        t.start()
        t.join(timeout=20)

        if t.is_alive():
            raise RuntimeError("❌ Query encoding timeout (>20s)")
        if "err" in error_container:
            raise RuntimeError(f"❌ Query encoding failed: {error_container['err']}")

        return result_container.get("emb", [])

    # --------------------------
    # Calculate cache key from chunks
    # --------------------------
    def _calculate_chunks_hash(self, chunks: List[Dict[str, Any]]) -> str:
        """Calculate hash of chunks to identify unique PDF content."""
        hasher = hashlib.md5()
        # Include text content and metadata for hash
        for ch in chunks:
            text = ch.get("text", "")
            doc_id = ch.get("doc_id", "")
            page = ch.get("page", "")
            # Hash text + metadata
            hasher.update(f"{doc_id}:{page}:{text[:500]}".encode('utf-8'))
        return hasher.hexdigest()
    
    # --------------------------
    # Load embeddings from cache
    # --------------------------
    def _load_embeddings_cache(self, cache_key: str) -> Optional[List[List[float]]]:
        """Load embeddings from cache if available."""
        cache_file = self._cache_dir / f"{cache_key}.pkl"
        if cache_file.exists():
            try:
                with open(cache_file, 'rb') as f:
                    cached_data = pickle.load(f)
                    if isinstance(cached_data, list) and len(cached_data) > 0:
                        print(f"[LOG] ✅ Loaded {len(cached_data)} embeddings from cache")
                        return cached_data
            except Exception as e:
                print(f"[WARNING] Failed to load cache: {e}")
        return None
    
    # --------------------------
    # Save embeddings to cache
    # --------------------------
    def _save_embeddings_cache(self, cache_key: str, embeddings: List[List[float]]) -> None:
        """Save embeddings to cache."""
        cache_file = self._cache_dir / f"{cache_key}.pkl"
        try:
            with open(cache_file, 'wb') as f:
                pickle.dump(embeddings, f)
            print(f"[LOG] ✅ Saved {len(embeddings)} embeddings to cache")
        except Exception as e:
            print(f"[WARNING] Failed to save cache: {e}")
    
    def _augment_text_with_tables(self, text: str, tables: Optional[List[Dict[str, Any]]]) -> str:
        """Append table contents to base text to enrich embeddings."""
        if not tables:
            return text or ""

        max_chars = int(os.getenv("TABLE_EMBED_MAX_CHARS", "4000"))
        additions: List[str] = []

        for tbl in tables:
            if not isinstance(tbl, dict):
                continue

            cached_text = tbl.get("_cached_text")
            if cached_text:
                table_text = cached_text
            else:
                table_text = ""
                for candidate in [tbl.get("local_path"), tbl.get("localPath")]:
                    if candidate and Path(candidate).exists():
                        try:
                            table_text = Path(candidate).read_text(encoding="utf-8", errors="ignore")
                            break
                        except Exception:
                            continue

                if not table_text and tbl.get("bucket") and tbl.get("data"):
                    temp_path = self._download_minio_object(tbl["bucket"], tbl["data"])
                    if temp_path and Path(temp_path).exists():
                        tbl["local_path"] = temp_path
                        try:
                            table_text = Path(temp_path).read_text(encoding="utf-8", errors="ignore")
                        except Exception:
                            table_text = ""

                if not table_text:
                    table_text = tbl.get("preview") or ""

                table_text = (table_text or "").strip()
                if table_text:
                    if len(table_text) > max_chars:
                        table_text = table_text[:max_chars] + "..."
                    tbl["_cached_text"] = table_text

            if not table_text:
                continue

            label = tbl.get("label")
            if not label:
                rel = tbl.get("relative_path") or tbl.get("data") or "table"
                label = Path(rel).name
            additions.append(f"\n\nTable {label}:\n{table_text}")

        if not additions:
            return text or ""
        return (text or "") + "".join(additions)
    
    # --------------------------
    # Encode chunks (image+text)
    # --------------------------
    def embed_chunks(self, chunks: List[Dict[str, Any]], pdf_identifier: Optional[str] = None) -> List[List[float]]:
        self._ensure_model()
        if not chunks:
            return []

        # Calculate cache key
        chunks_hash = self._calculate_chunks_hash(chunks)
        # Use pdf_identifier if provided, otherwise use hash
        cache_key = pdf_identifier if pdf_identifier else chunks_hash
        
        # Try to load from cache
        cached_embs = self._load_embeddings_cache(cache_key)
        if cached_embs is not None and len(cached_embs) == len(chunks):
            print(f"[LOG] ✅ Using cached embeddings for {len(chunks)} chunks")
            return cached_embs

        # Configurable timeout - allow more time for large batches
        # Default: 60s base + 5s per chunk, minimum 120s, maximum 600s (10 minutes)
        base_timeout = int(os.getenv("CHUNK_EMBEDDING_TIMEOUT_BASE", "60"))
        timeout_per_chunk = float(os.getenv("CHUNK_EMBEDDING_TIMEOUT_PER_CHUNK", "5.0"))
        min_timeout = int(os.getenv("CHUNK_EMBEDDING_TIMEOUT_MIN", "120"))
        max_timeout = int(os.getenv("CHUNK_EMBEDDING_TIMEOUT_MAX", "600"))
        
        # Calculate timeout based on number of chunks
        calculated_timeout = max(min_timeout, min(max_timeout, int(base_timeout + len(chunks) * timeout_per_chunk)))
        print(f"[LOG] Embedding {len(chunks)} chunks with timeout: {calculated_timeout}s")
        
        # Configurable batch size (default 8, can tune via env)
        try:
            batch_size = max(1, int(os.getenv("CHUNK_EMBED_BATCH_SIZE", "8")))
        except ValueError:
            batch_size = 8
        if batch_size != 8:
            print(f"[LOG] Using custom chunk embedding batch size: {batch_size}")
        all_embs: List[List[float]] = []
        
        # Import cancel check function
        from .pipeline import _check_cancel
        
        # Get tokenizer once outside the loop
        tokenizer = self.model.tokenizer
        
        for batch_idx in range(0, len(chunks), batch_size):
            # Check cancel flag before each batch
            _check_cancel(f"Before embedding batch {batch_idx // batch_size + 1}")
            batch = chunks[batch_idx:batch_idx + batch_size]
            batch_num = (batch_idx // batch_size) + 1
            total_batches = (len(chunks) + batch_size - 1) // batch_size
            print(f"[LOG] Processing batch {batch_num}/{total_batches} ({len(batch)} chunks)")

            result_container = {}
            error_container = {}

            def embed_job():
                try:
                    parser_base = Path(__file__).resolve().parent / "parser"

                    def resolve_image_path(p: str) -> str:
                        if not p:
                            return ""
                        path = Path(p)
                        if path.is_absolute() and path.exists():
                            return str(path)
                        for cand in [parser_base / p, parser_base / p.replace("\\", "/")]:
                            if cand.exists():
                                return str(cand)
                        try:
                            abs_path = Path(p).resolve()
                            if abs_path.exists():
                                return str(abs_path)
                        except Exception:
                            pass
                        return p

                    # Check cancel before processing batch
                    try:
                        _check_cancel("Before processing batch")
                    except RuntimeError as e:
                        if "cancelled" in str(e).lower():
                            error_container["err"] = RuntimeError("Embedding was cancelled")
                            return

                    # Initialize embeddings list with None to maintain order
                    embs: List[Optional[List[float]]] = [None] * len(batch)
                    
                    with self._torch.no_grad():
                        # Separate chunks into text-only and image+text chunks
                        text_only_chunks = []
                        text_only_indices = []
                        image_chunks = []
                        image_indices = []
                        
                        for ch_idx, ch in enumerate(batch):
                            images = ch.get("images") or []
                            has_valid_images = False
                            if images:
                                for img in images:
                                    path = resolve_image_path(str(img.get("data") or ""))
                                    if path:
                                        has_valid_images = True
                                        break
                            
                            if has_valid_images:
                                image_chunks.append(ch)
                                image_indices.append(ch_idx)
                            else:
                                text_only_chunks.append(ch)
                                text_only_indices.append(ch_idx)
                        
                        # Batch tokenize and process text-only chunks
                        if text_only_chunks:
                            try:
                                _check_cancel("Before batch tokenizing text-only chunks")
                            except RuntimeError as e:
                                if "cancelled" in str(e).lower():
                                    error_container["err"] = RuntimeError("Embedding was cancelled")
                                    return
                            
                            # Extract texts (augmenting with tables) and batch tokenize
                            texts = [
                                self._augment_text_with_tables(ch.get("text", "") or "", ch.get("tables"))
                                for ch in text_only_chunks
                            ]
                            # Tokenize all texts at once (batch tokenization) - this is the key optimization
                            tokenized = tokenizer(texts, return_tensors="pt", padding=True, truncation=True, max_length=512)
                            tokenized = tokenized.to(self.device)
                            
                            try:
                                _check_cancel("Before forward pass for text-only chunks")
                            except RuntimeError as e:
                                if "cancelled" in str(e).lower():
                                    error_container["err"] = RuntimeError("Embedding was cancelled")
                                    return
                            
                            # Single forward pass for all text-only chunks
                            text_embs = self.model.encode_text(tokenized)
                            text_embs_np = text_embs.detach().cpu().numpy()
                            
                            # Store embeddings in correct order
                            for idx, orig_idx in enumerate(text_only_indices):
                                embs[orig_idx] = text_embs_np[idx].tolist()
                        
                        # Process image+text chunks individually (they need image processing)
                        for img_ch_idx, ch in enumerate(image_chunks):
                            orig_idx = image_indices[img_ch_idx]
                            try:
                                _check_cancel(f"Before processing image chunk {img_ch_idx + 1}")
                            except RuntimeError as e:
                                if "cancelled" in str(e).lower():
                                    error_container["err"] = RuntimeError("Embedding was cancelled")
                                    return
                            
                            text = self._augment_text_with_tables(ch.get("text") or "", ch.get("tables"))
                            images = ch.get("images") or []

                            vecs = []
                            for img_idx, img in enumerate(images):
                                try:
                                    _check_cancel(f"Before embedding image {img_idx + 1}")
                                except RuntimeError as e:
                                    if "cancelled" in str(e).lower():
                                        error_container["err"] = RuntimeError("Embedding was cancelled")
                                        return
                                
                                local_candidate = img.get("local_path") or img.get("localPath")
                                primary = local_candidate or img.get("data") or ""
                                path = resolve_image_path(str(primary))

                                if (not path or not Path(path).exists()) and img.get("data"):
                                    path = resolve_image_path(str(img.get("data")))

                                if (not path or not Path(path).exists()) and img.get("bucket") and img.get("data"):
                                    bucket_name = img.get("bucket")
                                    object_name = img.get("data")
                                    try:
                                        temp_file = self._download_minio_object(bucket_name, object_name)
                                        if temp_file and Path(temp_file).exists():
                                            path = temp_file
                                            img["local_path"] = temp_file
                                    except Exception as minio_exc:
                                        print(f"[WARNING] Failed to download image {object_name} from bucket {bucket_name}: {minio_exc}")
                                        path = None

                                if not path or not Path(path).exists():
                                    continue
                                try:
                                    v = self.model.encode(image=path, text=text)
                                    vecs.append(v.detach().cpu().numpy().reshape(-1))
                                except Exception as e:
                                    continue

                            if not vecs:
                                # Fallback to text-only if image encoding failed
                                tokenized = tokenizer([text], return_tensors="pt", padding=True, truncation=True, max_length=512)
                                tokenized = tokenized.to(self.device)
                                v = self.model.encode_text(tokenized)
                                embs[orig_idx] = v.detach().cpu().numpy()[0].tolist()
                            else:
                                avg = np.mean(np.stack(vecs, axis=0), axis=0)
                                embs[orig_idx] = avg.astype(float).tolist()
                    
                    # Convert to list of lists (remove None values - should not happen, but safety check)
                    result_container["embs"] = [emb if emb is not None else [0.0] * 1024 for emb in embs]

                except Exception as e:
                    error_container["err"] = e

            t = threading.Thread(target=embed_job)
            t.start()
            # Use calculated timeout for each batch
            batch_timeout = max(min_timeout, min(max_timeout, int(calculated_timeout / total_batches)))
            t.join(timeout=batch_timeout)

            if t.is_alive():
                raise RuntimeError(f"❌ Chunk embedding timeout (> {batch_timeout}s) for batch {batch_num}/{total_batches}")
            if "err" in error_container:
                err = error_container["err"]
                # Re-raise cancellation errors
                if isinstance(err, RuntimeError) and "cancelled" in str(err).lower():
                    raise err
                raise RuntimeError(f"❌ Chunk embedding failed in batch {batch_num}/{total_batches}: {err}")

            batch_embs = result_container.get("embs", [])
            if not batch_embs:
                print(f"[WARNING] Batch {batch_num} produced no embeddings, using text-only fallback")
                # Fallback to text-only embedding for failed batch
                try:
                    batch_texts = [
                        self._augment_text_with_tables(ch.get("text") or "", ch.get("tables"))
                        for ch in batch
                    ]
                    # Use embed() method which handles List[str]
                    text_embs = self.embed(batch_texts)
                    batch_embs = text_embs
                except Exception as e:
                    print(f"[ERROR] Text-only fallback also failed: {e}")
                    # Try to get embedding dimension from first successful batch or default
                    emb_dim = len(all_embs[0]) if all_embs else 1024
                    # Create zero vectors as last resort
                    batch_embs = [[0.0] * emb_dim] * len(batch)
            
            all_embs.extend(batch_embs)
            print(f"[LOG] Batch {batch_num}/{total_batches} completed: {len(batch_embs)} embeddings")
            # Check cancel flag after each batch
            try:
                _check_cancel(f"After embedding batch {batch_num}")
            except RuntimeError as e:
                if "cancelled" in str(e).lower():
                    print(f"[LOG] ⚠️ Embedding cancelled after batch {batch_num}/{total_batches}")
                    raise

        _check_cancel("After all chunks embedded")
        print(f"[LOG] All chunks embedded: {len(all_embs)} total embeddings")
        
        # Save embeddings to cache only after all batches are complete
        if len(all_embs) == len(chunks):
            try:
                self._save_embeddings_cache(cache_key, all_embs)
            except Exception as e:
                print(f"[WARNING] Failed to save embeddings cache: {e}")
        
        return all_embs

    # --------------------------
    # Download helper for Minio objects
    # --------------------------
    def _download_minio_object(self, bucket: str, object_name: str) -> Optional[str]:
        """Download object from Minio to a temporary location and return path."""
        client = get_minio_client()
        try:
            response = client.get_object(bucket, object_name)
            data = response.read()
            response.close()
            response.release_conn()
        except Exception as exc:
            print(f"[WARNING] Failed to fetch object {object_name} from bucket {bucket}: {exc}")
            return None

        suffix = Path(object_name).suffix or ".bin"
        temp_dir = Path("tmp/minio_assets")
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_file = temp_dir / f"{hashlib.md5(object_name.encode()).hexdigest()}{suffix}"

        try:
            with open(temp_file, "wb") as fh:
                fh.write(data)
            return str(temp_file)
        except Exception as exc:
            print(f"[WARNING] Failed to persist Minio object {object_name}: {exc}")
            return None


# ------------------------------
# Factory method
# ------------------------------
def get_embedder(_name_ignored: str | None = None) -> Embedder:
    """Always return singleton VisualizedBGEEmbedder instance"""
    return VisualizedBGEEmbedder()
