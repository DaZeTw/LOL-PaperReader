"""
Persistent Vector Store implementation using MongoDB
This replaces the in-memory vector store with a persistent solution
"""
import asyncio
import json
import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime
import pickle
import base64

from paperreader.database.mongodb import mongodb
from paperreader.services.qa.vectorstore import InMemoryVectorStore
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class PersistentVectorStore:
    """Persistent vector store using MongoDB for storage"""
    
    def __init__(self, collection_name: str = "vector_embeddings"):
        self.collection_name = collection_name
        self.memory_store = None  # Cache for frequently accessed data
        self.tfidf_vectorizer = None
        self._initialized = False
    
    async def initialize(self):
        """Initialize the persistent vector store"""
        if self._initialized:
            return
        
        try:
            # Load existing embeddings into memory cache
            await self._load_embeddings_to_memory()
            self._initialized = True
            print(f"✅ PersistentVectorStore initialized with {len(self.memory_store.metadatas) if self.memory_store else 0} embeddings")
        except Exception as e:
            print(f"❌ Failed to initialize PersistentVectorStore: {e}")
            # Initialize empty store
            self.memory_store = InMemoryVectorStore(
                dense_vectors=np.empty((0, 0)),
                metadatas=[],
                tfidf_matrix=None,
                tfidf_vectorizer=None
            )
            self._initialized = True
    
    async def _load_embeddings_to_memory(self):
        """Load embeddings from MongoDB into memory cache"""
        collection = mongodb.get_collection(self.collection_name)
        
        # Get all embeddings
        embeddings_data = []
        async for doc in collection.find():
            embeddings_data.append(doc)
        
        if not embeddings_data:
            # No embeddings found, create empty store
            self.memory_store = InMemoryVectorStore(
                dense_vectors=np.empty((0, 0)),
                metadatas=[],
                tfidf_matrix=None,
                tfidf_vectorizer=None
            )
            return
        
        # Reconstruct vectors and metadatas
        vectors = []
        metadatas = []
        
        for doc in embeddings_data:
            # Decode embedding vector
            embedding_vector = self._decode_vector(doc.get("embedding_vector"))
            if embedding_vector is not None:
                vectors.append(embedding_vector)
                metadatas.append(doc.get("metadata", {}))
        
        if vectors:
            dense_vectors = np.array(vectors)
            
            # Rebuild TF-IDF matrix
            texts = [meta.get("text", "") for meta in metadatas]
            if texts:
                try:
                    # Filter out empty texts
                    non_empty_texts = [text for text in texts if text and text.strip()]
                    if non_empty_texts:
                        tfidf_vectorizer = TfidfVectorizer(max_features=50000, ngram_range=(1, 2))
                        tfidf_matrix = tfidf_vectorizer.fit_transform(non_empty_texts)
                    else:
                        print("[WARNING] All texts are empty, skipping TF-IDF")
                        tfidf_matrix = None
                        tfidf_vectorizer = None
                except Exception as e:
                    print(f"[WARNING] Failed to create TF-IDF matrix: {e}")
                    tfidf_matrix = None
                    tfidf_vectorizer = None
            else:
                tfidf_matrix = None
                tfidf_vectorizer = None
            
            self.memory_store = InMemoryVectorStore(
                dense_vectors=dense_vectors,
                metadatas=metadatas,
                tfidf_matrix=tfidf_matrix,
                tfidf_vectorizer=tfidf_vectorizer
            )
        else:
            self.memory_store = InMemoryVectorStore(
                dense_vectors=np.empty((0, 0)),
                metadatas=[],
                tfidf_matrix=None,
                tfidf_vectorizer=None
            )
    
    def _encode_vector(self, vector: List[float]) -> str:
        """Encode vector to base64 string for MongoDB storage"""
        try:
            vector_bytes = pickle.dumps(vector)
            return base64.b64encode(vector_bytes).decode('utf-8')
        except Exception as e:
            print(f"❌ Failed to encode vector: {e}")
            return None
    
    def _decode_vector(self, encoded_vector: str) -> Optional[List[float]]:
        """Decode base64 string back to vector"""
        try:
            if not encoded_vector:
                return None
            vector_bytes = base64.b64decode(encoded_vector.encode('utf-8'))
            return pickle.loads(vector_bytes)
        except Exception as e:
            print(f"❌ Failed to decode vector: {e}")
            return None
    
    async def add_embeddings(self, texts: List[str], embeddings: List[List[float]], metadatas: List[Dict[str, Any]]):
        """Add new embeddings to the persistent store"""
        if not texts or not embeddings or not metadatas:
            return
        
        if len(texts) != len(embeddings) or len(texts) != len(metadatas):
            raise ValueError("Texts, embeddings, and metadatas must have the same length")
        
        collection = mongodb.get_collection(self.collection_name)
        
        # Prepare documents for MongoDB
        documents = []
        for i, (text, embedding, metadata) in enumerate(zip(texts, embeddings, metadatas)):
            doc = {
                "text": text,
                "embedding_vector": self._encode_vector(embedding),
                "metadata": metadata,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            documents.append(doc)
        
        # Insert into MongoDB
        try:
            result = await collection.insert_many(documents)
            print(f"✅ Added {len(documents)} embeddings to persistent store")
            
            # Update memory cache
            await self._update_memory_cache(texts, embeddings, metadatas)
            
        except Exception as e:
            print(f"❌ Failed to add embeddings to persistent store: {e}")
            raise
    
    async def _update_memory_cache(self, texts: List[str], embeddings: List[List[float]], metadatas: List[Dict[str, Any]]):
        """Update the memory cache with new embeddings"""
        if not self.memory_store:
            await self.initialize()
        
        # Convert to numpy arrays
        new_vectors = np.array(embeddings)
        
        if self.memory_store.dense_vectors.size == 0:
            # First embeddings
            self.memory_store.dense_vectors = new_vectors
            self.memory_store.metadatas = metadatas
        else:
            # Append to existing
            self.memory_store.dense_vectors = np.vstack([
                self.memory_store.dense_vectors, 
                new_vectors
            ])
            self.memory_store.metadatas.extend(metadatas)
        
        # Update TF-IDF matrix
        all_texts = [meta.get("text", "") for meta in self.memory_store.metadatas]
        if all_texts:
            try:
                # Filter out empty texts
                non_empty_texts = [text for text in all_texts if text and text.strip()]
                if non_empty_texts:
                    tfidf_vectorizer = TfidfVectorizer(max_features=50000, ngram_range=(1, 2))
                    self.memory_store.tfidf_matrix = tfidf_vectorizer.fit_transform(non_empty_texts)
                    self.memory_store.tfidf_vectorizer = tfidf_vectorizer
                else:
                    print("[WARNING] All texts are empty, skipping TF-IDF update")
                    self.memory_store.tfidf_matrix = None
                    self.memory_store.tfidf_vectorizer = None
            except Exception as e:
                print(f"[WARNING] Failed to update TF-IDF matrix: {e}")
                self.memory_store.tfidf_matrix = None
                self.memory_store.tfidf_vectorizer = None
    
    def dense_search(self, query_vec: np.ndarray, top_k: int = 5) -> List[Tuple[int, float]]:
        """Search using dense similarity"""
        if not self.memory_store or self.memory_store.dense_vectors.size == 0:
            return []
        return self.memory_store.dense_search(query_vec, top_k)
    
    def keyword_search(self, query: str, top_k: int = 5, generated_keywords: List[str] = None) -> List[Tuple[int, float]]:
        """Search using keyword similarity"""
        if not self.memory_store:
            return []
        return self.memory_store.keyword_search(query, top_k, generated_keywords)
    
    def hybrid_search(self, query: str, query_vec: np.ndarray, top_k: int = 5, alpha: float = 0.5) -> List[Tuple[int, float]]:
        """Hybrid search combining dense and keyword search"""
        if not self.memory_store:
            return []
        return self.memory_store.hybrid_search(query, query_vec, top_k, alpha)
    
    async def get_embedding_count(self) -> int:
        """Get total number of stored embeddings"""
        collection = mongodb.get_collection(self.collection_name)
        return await collection.count_documents({})
    
    async def clear_all_embeddings(self):
        """Clear all embeddings from the store"""
        collection = mongodb.get_collection(self.collection_name)
        result = await collection.delete_many({})
        print(f"✅ Cleared {result.deleted_count} embeddings from persistent store")
        
        # Reset memory cache
        self.memory_store = InMemoryVectorStore(
            dense_vectors=np.empty((0, 0)),
            metadatas=[],
            tfidf_matrix=None,
            tfidf_vectorizer=None
        )
    
    def get_memory_store(self) -> InMemoryVectorStore:
        """Get the memory store for compatibility"""
        return self.memory_store


# Global instance
persistent_vector_store = PersistentVectorStore()
