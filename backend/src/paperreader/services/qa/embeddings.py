from abc import ABC, abstractmethod
from typing import List, Dict, Any


class Embedder(ABC):
    @abstractmethod
    def embed(self, texts: List[str]) -> List[List[float]]:
        ...


class VisualizedBGEEmbedder(Embedder):
    """Embedder backed by Visualized_BGE for composed image-text retrieval.

    We use text-only encoding here (query and chunks) to maintain the
    existing pipeline signatures. The underlying model supports image+text
    composition and can be extended later to incorporate chunk images.
    """

    def __init__(self, model_name: str = "BAAI/bge-m3", model_weight_path: str | None = None) -> None:
        import torch  # local import to avoid hard dependency during module import
        from pathlib import Path
        # Import Visualized_BGE from the in-repo path
        from visual_bge.modeling import Visualized_BGE  # type: ignore

        self._torch = torch
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        # Resolve default weight path inside repo if not provided
        if model_weight_path is None:
            model_weight_path = "Visualized_m3.pth"
        print(f"model_weight_path: {model_weight_path}")
        self.model = Visualized_BGE(model_name_bge=model_name, model_weight=model_weight_path)
        self.model.eval()
        self.model.to(self.device)

    def embed(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        embs: List[List[float]] = []
        with self._torch.no_grad():
            for t in texts:
                # Encode text only; returns a tensor shape (1, D)
                emb = self.model.encode(text=t)
                # Move to CPU, convert to list of floats
                embs.append(emb.detach().cpu().numpy().reshape(-1).tolist())
        return embs

    def encode_query(self, *, image: str | None, text: str | None) -> List[float]:
        with self._torch.no_grad():
            if image and text:
                emb = self.model.encode(image=image, text=text)
            elif image:
                emb = self.model.encode(image=image)
            else:
                emb = self.model.encode(text=text or "")
            return emb.detach().cpu().numpy().reshape(-1).tolist()

    # New: image+text embedding for chunks
    def embed_chunks(self, chunks: List[Dict[str, Any]]) -> List[List[float]]:
        """Compute embeddings for chunk dicts combining images (if any) with text.

        Strategy:
        - If chunk has images, encode each image with the chunk text and average the vectors.
        - If no images, fall back to text-only encoding.
        Image paths are resolved relative to `services/qa/parser` for paths starting with
        "output/" or "output\\".
        """
        if not chunks:
            return []
        from pathlib import Path
        import numpy as np  # type: ignore

        parser_base = Path(__file__).resolve().parent / "parser"

        def resolve_image_path(p: str) -> str:
            if not p:
                return ""
            path = Path(p)
            if path.is_absolute() and path.exists():
                return str(path)
            # Try relative to parser base
            cand = parser_base / p
            if cand.exists():
                return str(cand)
            # Sometimes backslashes are present in JSON; normalize
            cand2 = parser_base / p.replace("\\", "/")
            if cand2.exists():
                return str(cand2)
            # Try relative to current working directory
            if path.exists():
                return str(path)
            # Try as absolute path (in case it's a Windows path)
            try:
                abs_path = Path(p).resolve()
                if abs_path.exists():
                    return str(abs_path)
            except Exception:
                pass
            return p  # let underlying model try; may handle other schemes

        embs: List[List[float]] = []
        with self._torch.no_grad():
            for i, ch in enumerate(chunks):
                text = (ch.get("text") or "")
                images = ch.get("images") or []
                print(f"[DEBUG] Chunk {i}: text_len={len(text)}, images={len(images)}")
                if images:
                    print(f"[DEBUG] Chunk {i} images: {[img.get('data', 'no_data') for img in images]}")
                
                vecs: List[Any] = []
                for img in images:
                    path = resolve_image_path(str(img.get("data") or ""))
                    print(f"[DEBUG] Resolved image path: {path}")
                    if not path:
                        continue
                    try:
                        v = self.model.encode(image=path, text=text)
                        vecs.append(v.detach().cpu().numpy().reshape(-1))
                        print(f"[DEBUG] Successfully encoded image+text for chunk {i}")
                    except Exception as e:
                        print(f"[DEBUG] Failed to encode image+text for chunk {i}: {e}")
                        continue
                if not vecs:
                    # fallback to text-only
                    v = self.model.encode(text=text)
                    embs.append(v.detach().cpu().numpy().reshape(-1).tolist())
                    print(f"[DEBUG] Used text-only encoding for chunk {i}")
                else:
                    avg = np.mean(np.stack(vecs, axis=0), axis=0)
                    embs.append(avg.astype(float).tolist())
                    print(f"[DEBUG] Used image+text encoding for chunk {i}")
        return embs


def get_embedder(_name_ignored: str | None = None) -> Embedder:
    # Always return Visualized_BGE implementation. Options are intentionally ignored.
    return VisualizedBGEEmbedder()
