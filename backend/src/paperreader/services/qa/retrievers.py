#retrievers.py
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from pathlib import Path

from .embeddings import get_embedder, Embedder
from .vectorstore import InMemoryVectorStore
from .persistent_vectorstore import PersistentVectorStore
from .elasticsearch_client import knn_search
from paperreader.services.documents.chunk_repository import get_document_chunks


@dataclass
class Corpus:
    texts: List[str]
    metadatas: List[Dict[str, Any]]


class Retriever:
    def __init__(
        self,
        name: str,
        store: Optional[InMemoryVectorStore] = None,
        embedder: Optional[Embedder] = None,
        persistent_store: Optional[PersistentVectorStore] = None,
        pdf_name_filter: Optional[str] = None,
        document_id: Optional[str] = None,
        use_elasticsearch: bool = True,
    ):
        self.name = name
        self.store = store
        self.embedder = embedder
        self.persistent_store = persistent_store
        self.pdf_name_filter = pdf_name_filter  # Filter chunks by PDF name (doc_id)
        self.document_id = document_id  # Document identifier for Elasticsearch filtering
        self.use_elasticsearch = use_elasticsearch  # Use Elasticsearch instead of in-memory store
        
        # If using Elasticsearch, skip store filtering
        if not self.use_elasticsearch and store:
            # If PDF filter is set, create a filtered store that only contains chunks from that PDF
            if pdf_name_filter and store.metadatas:
                self._filter_store_by_pdf()
            else:
                self.filtered_store = store
        else:
            self.filtered_store = None

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

    async def retrieve(self, question: str, top_k: int = 5, image: str | None = None):
        """Retrieve chunks using Elasticsearch or in-memory store"""
        print(f"[DEBUG] Retrieving with {self.name} retriever, top_k={top_k}, image: {image}, use_elasticsearch={self.use_elasticsearch}, document_id={self.document_id}")
        
        # Use Elasticsearch if enabled and document_id is available
        if self.use_elasticsearch and self.document_id:
            return await self._retrieve_from_elasticsearch(question, top_k, image)
        
        # Fallback to in-memory store
        if not self.filtered_store:
            error_msg = "No chunks available for retrieval."
            if self.use_elasticsearch and not self.document_id:
                error_msg += " Elasticsearch is enabled but document_id is missing. Please ensure the PDF has been uploaded and processed, and the session has the correct document_id in metadata."
            elif not self.use_elasticsearch:
                error_msg += " The in-memory store is not initialized - no chunks available. The document may not have been processed yet. Please ensure the PDF has been uploaded and processed."
            raise ValueError(error_msg)
        
        print(f"[DEBUG] Store has {len(self.filtered_store.metadatas)} documents (filtered by PDF: {self.pdf_name_filter or 'none'})")
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
    
    async def _retrieve_from_elasticsearch(self, question: str, top_k: int, image: str | None = None):
        """Retrieve chunks from Elasticsearch and fetch full chunks from MongoDB"""
        if self.embedder is None:
            raise ValueError("Elasticsearch retriever requires an embedder.")
        
        # Generate query embedding
        if hasattr(self.embedder, "encode_query"):
            print(f"[DEBUG] Using encode_query with image={image}, text={question[:100]}...")
            query_vector = self.embedder.encode_query(image=image, text=question)
            print(f"[DEBUG] Query vector shape: {len(query_vector) if isinstance(query_vector, list) else query_vector.shape}")
        else:
            print(f"[DEBUG] Using embed with text={question[:100]}...")
            query_vector = self.embedder.embed([question])[0]
        
        # Convert to list if numpy array
        if isinstance(query_vector, np.ndarray):
            query_vector = query_vector.tolist()
        
        # Search Elasticsearch
        print(f"[DEBUG] Searching Elasticsearch with document_id={self.document_id}, top_k={top_k}")
        es_hits = await knn_search(
            document_id=self.document_id,
            query_vector=query_vector,
            top_k=top_k,
        )
        
        print(f"[DEBUG] Elasticsearch returned {len(es_hits)} hits")
        
        if not es_hits:
            return []
        
        # Extract chunk_ids from Elasticsearch hits
        chunk_ids = []
        hit_scores = {}
        for hit in es_hits:
            chunk_id = hit.get("_source", {}).get("chunk_id")
            if chunk_id:
                chunk_ids.append(chunk_id)
                # Store score for this chunk
                hit_scores[chunk_id] = hit.get("_score", 0.0)
        
        if not chunk_ids:
            print(f"[WARNING] No chunk_ids found in Elasticsearch hits")
            return []
        
        # Fetch full chunks from MongoDB using document_id
        # We need to get all chunks for the document and filter by chunk_id
        print(f"[DEBUG] Fetching chunks from MongoDB for document_id={self.document_id}")
        all_chunks = await get_document_chunks(document_id=self.document_id)
        print(f"[DEBUG] MongoDB returned {len(all_chunks)} chunks for document_id={self.document_id}")
        if not all_chunks:
            print(f"[WARNING] MongoDB returned zero chunks for document_id={self.document_id}. Possible id mismatch or missing processing.")
        
        # Create mapping of chunk_id to chunk
        chunk_map = {}
        for chunk in all_chunks:
            chunk_id = chunk.get("chunk_id")
            if chunk_id and chunk_id in chunk_ids:
                chunk_map[chunk_id] = chunk
        
        print(f"[DEBUG] Matched {len(chunk_map)}/{len(chunk_ids)} chunks from MongoDB")
        
        # Build hits in order of Elasticsearch results
        hits = []
        for idx, chunk_id in enumerate(chunk_ids):
            chunk = chunk_map.get(chunk_id)
            if chunk:
                # Format chunk to match expected hit format
                hit = {
                    "index": idx,
                    "score": hit_scores.get(chunk_id, 0.0),
                    "text": chunk.get("text", ""),
                    "metadata": {
                        "chunk_id": chunk_id,
                        "doc_id": chunk.get("document_id") or self.document_id,
                        # title field removed from database schema
                        "page": chunk.get("page_number") or chunk.get("page"),
                        # Keep images and tables for generator
                        "images": chunk.get("images", []),
                        "tables": chunk.get("tables", []),
                    }
                }
                hits.append(hit)
        
        print(f"[DEBUG] Retrieved {len(hits)} hits from Elasticsearch + MongoDB")
        return hits

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


def get_retriever(
    name: str,
    store: Optional[InMemoryVectorStore] = None,
    embedder: Optional[Embedder] = None,
    persistent_store: Optional[PersistentVectorStore] = None,
    pdf_name_filter: Optional[str] = None,
    document_id: Optional[str] = None,
    use_elasticsearch: bool = True,
) -> Retriever:
    return Retriever(
        name=name,
        store=store,
        embedder=embedder,
        persistent_store=persistent_store,
        pdf_name_filter=pdf_name_filter,
        document_id=document_id,
        use_elasticsearch=use_elasticsearch,
    )