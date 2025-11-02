from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import torch
import numpy as np
from pathlib import Path
import threading
import os


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

    # --------------------------
    # Lazy model loading
    # --------------------------
    def _ensure_model(self):
        if self.model is None and not self._loading_lock:
            self._loading_lock = True
            try:
                print(f"🔹 Loading Visualized_BGE model from {self.model_weight_path} ...")
                from visual_bge.modeling import Visualized_BGE

                model_container = {}

                def load_model():
                    model_container["model"] = Visualized_BGE(
                        model_name_bge=self.model_name,
                        model_weight=self.model_weight_path
                    )

                loader_thread = threading.Thread(target=load_model)
                loader_thread.start()
                # Extend timeout to allow heavy weight load on CPU
                timeout_s = int(os.getenv("VISUAL_BGE_LOAD_TIMEOUT", "300"))
                loader_thread.join(timeout=timeout_s)

                if loader_thread.is_alive():
                    raise TimeoutError(f"Model loading timeout (>{timeout_s}s)")

                self.model = model_container["model"]
                self.model.eval()
                self.model.to(self.device)
                print("✅ Visualized_BGE loaded successfully.")

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
        with torch.no_grad():
            # Process each text individually to avoid confusion with image parameter
            embeddings = []
            for text in texts:
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
    # Encode chunks (image+text)
    # --------------------------
    def embed_chunks(self, chunks: List[Dict[str, Any]]) -> List[List[float]]:
        self._ensure_model()
        if not chunks:
            return []

        # Configurable timeout - allow more time for large batches
        # Default: 60s base + 5s per chunk, minimum 120s, maximum 600s (10 minutes)
        base_timeout = int(os.getenv("CHUNK_EMBEDDING_TIMEOUT_BASE", "60"))
        timeout_per_chunk = float(os.getenv("CHUNK_EMBEDDING_TIMEOUT_PER_CHUNK", "5.0"))
        min_timeout = int(os.getenv("CHUNK_EMBEDDING_TIMEOUT_MIN", "120"))
        max_timeout = int(os.getenv("CHUNK_EMBEDDING_TIMEOUT_MAX", "600"))
        
        # Calculate timeout based on number of chunks
        calculated_timeout = max(min_timeout, min(max_timeout, int(base_timeout + len(chunks) * timeout_per_chunk)))
        print(f"[LOG] Embedding {len(chunks)} chunks with timeout: {calculated_timeout}s")
        
        # Batch processing for large chunks to avoid timeout
        batch_size = int(os.getenv("CHUNK_EMBEDDING_BATCH_SIZE", "50"))
        all_embs: List[List[float]] = []
        
        for batch_idx in range(0, len(chunks), batch_size):
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

                    embs: List[List[float]] = []
                    with self._torch.no_grad():
                        for ch in batch:
                            text = (ch.get("text") or "")
                            images = ch.get("images") or []

                            vecs = []
                            for img in images:
                                path = resolve_image_path(str(img.get("data") or ""))
                                if not path:
                                    continue
                                try:
                                    v = self.model.encode(image=path, text=text)
                                    vecs.append(v.detach().cpu().numpy().reshape(-1))
                                except Exception:
                                    continue

                            if not vecs:
                                v = self.model.encode(text=text)
                                embs.append(v.detach().cpu().numpy().reshape(-1).tolist())
                            else:
                                avg = np.mean(np.stack(vecs, axis=0), axis=0)
                                embs.append(avg.astype(float).tolist())

                    result_container["embs"] = embs

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
                raise RuntimeError(f"❌ Chunk embedding failed in batch {batch_num}/{total_batches}: {error_container['err']}")

            batch_embs = result_container.get("embs", [])
            if not batch_embs:
                print(f"[WARNING] Batch {batch_num} produced no embeddings, using text-only fallback")
                # Fallback to text-only embedding for failed batch
                try:
                    batch_texts = [ch.get("text") or "" for ch in batch]
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

        print(f"[LOG] All chunks embedded: {len(all_embs)} total embeddings")
        return all_embs


# ------------------------------
# Factory method
# ------------------------------
def get_embedder(_name_ignored: str | None = None) -> Embedder:
    """Always return singleton VisualizedBGEEmbedder instance"""
    return VisualizedBGEEmbedder()
