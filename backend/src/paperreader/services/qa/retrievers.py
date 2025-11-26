#retrievers.py
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from pathlib import Path

from .embeddings import get_embedder, Embedder
from .vectorstore import InMemoryVectorStore
from .persistent_vectorstore import PersistentVectorStore


@dataclass
class Corpus:
    texts: List[str]
    metadatas: List[Dict[str, Any]]


class Retriever:
    def __init__(self, name: str, store: InMemoryVectorStore, embedder: Optional[Embedder] = None, persistent_store: Optional[PersistentVectorStore] = None, pdf_name_filter: Optional[str] = None):
        self.name = name
        self.store = store
        self.embedder = embedder
        self.persistent_store = persistent_store
        self.pdf_name_filter = pdf_name_filter  # Filter chunks by PDF name (doc_id)
        
        # If PDF filter is set, create a filtered store that only contains chunks from that PDF
        if pdf_name_filter and store.metadatas:
            self._filter_store_by_pdf()
        else:
            self.filtered_store = store

    def _filter_store_by_pdf(self):
        """Filter store to only include chunks from the specified PDF"""
        if not self.pdf_name_filter:
            self.filtered_store = self.store
            print(f"[DEBUG] No PDF filter specified, using all {len(self.store.metadatas)} chunks")
            return
        
        # Find indices of chunks that match the PDF name (doc_id)
        matching_indices = []
        matching_metadatas = []
        matching_vectors = []
        
        # Normalize PDF name filter (remove extension, strip whitespace, lowercase for comparison)
        pdf_name_normalized = self.pdf_name_filter.replace(".pdf", "").replace(".PDF", "").strip().lower()
        
        print(f"[DEBUG] Filtering store by PDF: '{self.pdf_name_filter}' (normalized: '{pdf_name_normalized}')")
        print(f"[DEBUG] Total chunks in store before filtering: {len(self.store.metadatas)}")
        
        for idx, metadata in enumerate(self.store.metadatas):
            doc_id = metadata.get("doc_id", "")
            # Normalize doc_id for comparison (remove extension, strip whitespace, lowercase)
            doc_id_normalized = doc_id.replace(".pdf", "").replace(".PDF", "").strip().lower()
            
            # Match if:
            # 1. Exact match (normalized, case-insensitive)
            # 2. doc_id starts with pdf_name (handles "example-embedded" matching "example")
            # 3. pdf_name is a prefix of doc_id (handles cases like "paper1" matching "paper1v2")
            # 4. doc_id starts with pdf_name + "-" (handles "example-embedded" matching "example")
            matches = (
                doc_id_normalized == pdf_name_normalized or  # Exact match (normalized)
                doc_id_normalized.startswith(pdf_name_normalized + "-") or  # doc_id is "pdf_name-suffix"
                doc_id_normalized.startswith(pdf_name_normalized) or  # doc_id starts with pdf_name
                (pdf_name_normalized and len(pdf_name_normalized) >= 3 and pdf_name_normalized in doc_id_normalized)  # pdf_name is in doc_id (but not too short)
            )
            
            if matches:
                matching_indices.append(idx)
                matching_metadatas.append(metadata)
                if self.store.dense_vectors is not None and idx < len(self.store.dense_vectors):
                    matching_vectors.append(self.store.dense_vectors[idx])
        
        print(f"[DEBUG] ✅ Filtered store: {len(matching_indices)}/{len(self.store.metadatas)} chunks match PDF '{self.pdf_name_filter}'")
        if len(matching_indices) == 0:
            print(f"[WARNING] ⚠️ No chunks matched PDF filter '{self.pdf_name_filter}'!")
            print(f"[WARNING] Sample doc_ids in store: {[m.get('doc_id', 'N/A')[:50] for m in self.store.metadatas[:5]]}")
        
        if matching_indices:
            # Create filtered TF-IDF matrix if available
            filtered_tfidf_matrix = None
            if self.store.tfidf_matrix is not None:
                # Filter TF-IDF matrix by matching indices
                try:
                    filtered_tfidf_matrix = self.store.tfidf_matrix[matching_indices]
                except Exception as e:
                    print(f"[WARNING] Failed to filter TF-IDF matrix: {e}, continuing without TF-IDF filtering")
                    filtered_tfidf_matrix = None
            
            # Create new filtered store
            from .vectorstore import InMemoryVectorStore
            self.filtered_store = InMemoryVectorStore(
                dense_vectors=np.array(matching_vectors) if matching_vectors else np.empty((0, 0)),
                metadatas=matching_metadatas,
                tfidf_matrix=filtered_tfidf_matrix,
                tfidf_vectorizer=self.store.tfidf_vectorizer,  # Keep same vectorizer
            )
        else:
            # No matching chunks - create empty store
            from .vectorstore import InMemoryVectorStore
            self.filtered_store = InMemoryVectorStore(
                dense_vectors=np.empty((0, 0)),
                metadatas=[],
                tfidf_matrix=None,
                tfidf_vectorizer=self.store.tfidf_vectorizer,
            )

    def retrieve(self, question: str, top_k: int = 5, image: str | None = None):
        print(f"[DEBUG] Retrieving with {self.name} retriever, top_k={top_k}, image: {image}")
        print(f"[DEBUG] Store has {len(self.filtered_store.metadatas)} documents (filtered by PDF: {self.pdf_name_filter or 'none'})")
        
        # Use filtered store for chunk embeddings (no persistent store for chunks)
        search_store = self.filtered_store
        
        if self.name == "keyword":
            hits = search_store.keyword_search(question, top_k)
            print(f"[DEBUG] Keyword search returned {len(hits)} hits")
            return [self._format_hit(i, s, search_store) for i, s in hits]
        if self.name == "dense":
            if self.embedder is None:
                raise ValueError("Dense retriever requires an embedder.")
            # Use composed image+text embedding for the query if image provided
            if hasattr(self.embedder, "encode_query"):
                print(f"[DEBUG] Using encode_query with image={image}, text={question[:100]}...")
                qv = np.array(self.embedder.encode_query(image=image, text=question))
                print(f"[DEBUG] Query vector shape: {qv.shape}")
            else:
                print(f"[DEBUG] Using embed with text={question[:100]}...")
                qv = np.array(self.embedder.embed([question])[0])
            hits = search_store.dense_search(qv, top_k)
            print(f"[DEBUG] Dense search returned {len(hits)} hits")
            return [self._format_hit(i, s, search_store) for i, s in hits]
        if self.name == "hybrid":
            if self.embedder is None:
                raise ValueError("Hybrid retriever requires an embedder.")
            if hasattr(self.embedder, "encode_query"):
                print(f"[DEBUG] Using encode_query with image={image}, text={question[:100]}...")
                qv = np.array(self.embedder.encode_query(image=image, text=question))
                print(f"[DEBUG] Query vector shape: {qv.shape}")
            else:
                print(f"[DEBUG] Using embed with text={question[:100]}...")
                qv = np.array(self.embedder.embed([question])[0])
            hits = search_store.hybrid_search(question, qv, top_k)
            print(f"[DEBUG] Hybrid search returned {len(hits)} hits")
            return [self._format_hit(i, s, search_store) for i, s in hits]
        raise ValueError(f"Unknown retriever: {self.name}")

    def _format_hit(self, idx: int, score: float, store: InMemoryVectorStore):
        meta = store.metadatas[idx]
        text = meta.get("text", "")
        return {
            "index": idx,
            "score": score,
            "text": text,
            "metadata": {k: v for k, v in meta.items() if k != "text"}
        }


def build_corpus(chunks: List[Dict[str, Any]]) -> Corpus:
    texts = [c.get("text", "") for c in chunks]

    def _normalize_images(images: Any) -> List[Dict[str, Any]]:
        norm: List[Dict[str, Any]] = []
        if not images:
            return norm
        for img in images:
            if isinstance(img, str):
                # If it's already a string, use it as-is (might be a full path)
                norm.append({"data": img})
            elif isinstance(img, dict):
                data = img.get("data") or ""
                # Use the data field as-is, don't modify the path
                item: Dict[str, Any] = {"data": data}
                if "caption" in img:
                    item["caption"] = img.get("caption")
                if "figure_id" in img:
                    item["figure_id"] = img.get("figure_id")
                if "bucket" in img:
                    item["bucket"] = img.get("bucket")
                if "local_path" in img:
                    item["local_path"] = img.get("local_path")
                if "preview" in img:
                    item["preview"] = img.get("preview")
                norm.append(item)
        return norm

    def _normalize_tables(tables: Any) -> List[Dict[str, Any]]:
        norm: List[Dict[str, Any]] = []
        if not tables:
            return norm
        for tbl in tables:
            if isinstance(tbl, dict):
                data = tbl.get("data") or tbl.get("relative_path") or ""
                item: Dict[str, Any] = {"data": data}
                if "bucket" in tbl:
                    item["bucket"] = tbl.get("bucket")
                if "local_path" in tbl:
                    item["local_path"] = tbl.get("local_path")
                if "label" in tbl:
                    item["label"] = tbl.get("label")
                if "preview" in tbl:
                    item["preview"] = tbl.get("preview")
                norm.append(item)
        return norm

    metadatas: List[Dict[str, Any]] = []
    for c in chunks:
        m = dict(c)
        m["images"] = _normalize_images(m.get("images"))
        m["tables"] = _normalize_tables(m.get("tables"))
        metadatas.append(m)
    return Corpus(texts=texts, metadatas=metadatas)


def build_store(corpus: Corpus, embedder: Optional[Embedder], cached_embeddings: Optional[List[List[float]]] = None) -> InMemoryVectorStore:
    # Import cancel check function
    from .pipeline import _check_cancel
    
    # Build dense vectors; prefer image-aware chunk embedding if available
    dense_vectors: np.ndarray
    if cached_embeddings is not None:
        # Use cached embeddings if provided (skip embedding step)
        print(f"[LOG] Using cached embeddings ({len(cached_embeddings)} vectors)")
        dense_vectors = np.array(cached_embeddings)
    elif embedder is not None and hasattr(embedder, "embed_chunks"):
        # reconstruct chunk dicts from metadatas to allow image+text encoding
        try:
            _check_cancel("Before embedding chunks")
            chunks = [dict(m, text=t) for t, m in zip(corpus.texts, corpus.metadatas)]
            # Extract PDF identifier from first chunk's doc_id if available
            pdf_identifier = chunks[0].get("doc_id") if chunks else None
            dense_vectors = np.array(getattr(embedder, "embed_chunks")(chunks, pdf_identifier=pdf_identifier)) if chunks else np.empty((0, 0))
            _check_cancel("After embedding chunks")
        except RuntimeError as e:
            if "cancelled" in str(e).lower():
                raise  # Re-raise cancel exception
            dense_vectors = np.array(embedder.embed(corpus.texts)) if corpus.texts else np.empty((0, 0))
    else:
        _check_cancel("Before embedding texts")
        dense_vectors = np.array(embedder.embed(corpus.texts)) if (corpus.texts and embedder is not None) else np.empty((0, 0))
        _check_cancel("After embedding texts")

    # Keep TF-IDF for hybrid if ever needed by callers; but primary retrieval is dense
    tfidf = TfidfVectorizer(max_features=50000, ngram_range=(1, 2))
    tfidf_matrix = tfidf.fit_transform(corpus.texts) if corpus.texts else None

    return InMemoryVectorStore(
        dense_vectors=dense_vectors,
        metadatas=corpus.metadatas,
        tfidf_matrix=tfidf_matrix,
        tfidf_vectorizer=tfidf,
    )


async def build_persistent_store(corpus: Corpus, embedder: Optional[Embedder]) -> PersistentVectorStore:
    """Build persistent vector store (in-memory storage)"""
    persistent_store = PersistentVectorStore()
    await persistent_store.initialize()
    
    if not corpus.texts:
        return persistent_store
    
    # Build dense vectors; prefer image-aware chunk embedding if available
    dense_vectors: List[List[float]]
    if embedder is not None and hasattr(embedder, "embed_chunks"):
        # reconstruct chunk dicts from metadatas to allow image+text encoding
        try:
            chunks = [dict(m, text=t) for t, m in zip(corpus.texts, corpus.metadatas)]
            # Extract PDF identifier from first chunk's doc_id if available
            pdf_identifier = chunks[0].get("doc_id") if chunks else None
            dense_vectors = getattr(embedder, "embed_chunks")(chunks, pdf_identifier=pdf_identifier) if chunks else []
        except Exception as e:
            print(f"[WARNING] Chunk embedding failed, falling back to text-only: {e}")
            dense_vectors = embedder.embed(corpus.texts) if corpus.texts else []
    else:
        dense_vectors = embedder.embed(corpus.texts) if (corpus.texts and embedder is not None) else []
    
    if dense_vectors:
        # Save to persistent store
        await persistent_store.add_embeddings(corpus.texts, dense_vectors, corpus.metadatas)
        print(f"✅ Saved {len(dense_vectors)} embeddings to persistent store")
    
    return persistent_store


def get_retriever(name: str, store: InMemoryVectorStore, embedder: Embedder, persistent_store: Optional[PersistentVectorStore] = None, pdf_name_filter: Optional[str] = None) -> Retriever:
    return Retriever(name=name, store=store, embedder=embedder, persistent_store=persistent_store, pdf_name_filter=pdf_name_filter)