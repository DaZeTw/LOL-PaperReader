from typing import List, Dict, Any, Optional
from datetime import datetime
import base64
import uuid
from pathlib import Path
import os

# MongoDB removed - service disabled
# from paperreader.database.mongodb import mongodb
from paperreader.models.chat import ChatSession, ChatMessage
from paperreader.services.qa.embeddings import get_embedder
from paperreader.services.qa.vectorstore import InMemoryVectorStore
from paperreader.services.qa.persistent_vectorstore import PersistentVectorStore
from paperreader.services.qa.retrievers import build_corpus, build_store
import numpy as np


class ChatEmbeddingService:
    """Service to handle embedding of chat messages for retrieval"""
    
    def __init__(self):
        self.collection_name = "chat_sessions"
        self.embedding_collection_name = "chat_embeddings"
        self.embedder = None  # Lazy load khi cần
        self.vector_store = None
        self.persistent_store = None
        self._initialize_vector_store()
    
    def _initialize_vector_store(self):
        """Initialize the vector store for chat embeddings"""
        try:
            # Initialize persistent store
            self.persistent_store = PersistentVectorStore(collection_name=self.embedding_collection_name)
            # Initialize empty memory store as fallback
            self.vector_store = InMemoryVectorStore(
                dense_vectors=np.empty((0, 0)),
                metadatas=[],
                tfidf_matrix=None,
                tfidf_vectorizer=None
            )
        except Exception as e:
            print(f"[WARNING] Could not initialize persistent store: {e}")
            # Initialize empty store
            self.vector_store = InMemoryVectorStore(
                dense_vectors=np.empty((0, 0)),
                metadatas=[],
                tfidf_matrix=None,
                tfidf_vectorizer=None
            )
    
    def _get_embedder(self):
        """Lazy load embedder when needed"""
        if self.embedder is None:
            print("[LOG] Loading embedder...")
            self.embedder = get_embedder()
            print("[LOG] Embedder loaded successfully")
        return self.embedder
    
    async def get_unembedded_messages(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get chat messages that haven't been embedded yet"""
        # MongoDB removed - return empty list
        print("[WARNING] ChatEmbeddingService.get_unembedded_messages() called but MongoDB is disabled")
        return []
    
    def _has_images_in_message(self, message: ChatMessage) -> bool:
        """Check if a message contains images"""
        if not message.metadata:
            return False
        
        # Check for user_images in metadata
        user_images = message.metadata.get("user_images", [])
        if user_images:
            return True
        
        # Check for images in content (base64 data URLs)
        if "data:image/" in message.content:
            return True
        
        return False
    
    def _extract_images_from_message(self, message: ChatMessage) -> List[Dict[str, Any]]:
        """Extract images from a chat message"""
        print(f"[DEBUG] _extract_images_from_message called")
        print(f"[DEBUG] Message role: {message.role}")
        print(f"[DEBUG] Message metadata: {message.metadata}")
        print(f"[DEBUG] Message metadata type: {type(message.metadata)}")
        
        images = []
        
        # Extract from metadata.user_images
        if message.metadata and message.metadata.get("user_images"):
            print(f"[DEBUG] Found user_images in metadata")
            user_images = message.metadata["user_images"]
            print(f"[DEBUG] user_images type: {type(user_images)}")
            print(f"[DEBUG] user_images value: {user_images}")
            
            # Ensure user_images is a list
            if not isinstance(user_images, list):
                print(f"[WARNING] user_images is not a list, got {type(user_images)}: {user_images}")
                return images
            
            print(f"[DEBUG] Processing {len(user_images)} user_images")
            for i, img_data in enumerate(user_images):
                print(f"[DEBUG] Processing image {i}: {type(img_data)} - {img_data[:100] if isinstance(img_data, str) else img_data}")
                # Ensure img_data is a string
                if not isinstance(img_data, str):
                    print(f"[WARNING] Image data at index {i} is not a string, got {type(img_data)}: {img_data}")
                    continue
                    
                if img_data.startswith("data:image/"):
                    print(f"[DEBUG] Saving base64 image {i}")
                    # Save base64 image to temporary file
                    img_path = self._save_base64_image(img_data, f"chat_img_{uuid.uuid4()}")
                    if img_path:
                        images.append({
                            "data": img_path,
                            "caption": f"Chat image {i+1}",
                            "figure_id": f"chat_{message.timestamp.isoformat()}_{i}"
                        })
                        print(f"[DEBUG] Saved image {i} to: {img_path}")
                else:
                    print(f"[DEBUG] Image {i} is not base64 data URL, skipping")
        else:
            print(f"[DEBUG] No user_images found in metadata")
        
        # Extract from content (base64 data URLs)
        print(f"[DEBUG] Checking content for base64 images...")
        import re
        img_pattern = re.compile(r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)')
        matches = list(img_pattern.finditer(message.content))
        print(f"[DEBUG] Found {len(matches)} base64 images in content")
        
        for i, match in enumerate(matches):
            print(f"[DEBUG] Processing content image {i}")
            img_data = f"data:image/png;base64,{match.group(1)}"
            img_path = self._save_base64_image(img_data, f"content_img_{uuid.uuid4()}")
            if img_path:
                images.append({
                    "data": img_path,
                    "caption": f"Content image {i+1}",
                    "figure_id": f"content_{message.timestamp.isoformat()}_{i}"
                })
                print(f"[DEBUG] Saved content image {i} to: {img_path}")
        
        print(f"[DEBUG] Total images extracted: {len(images)}")
        return images
    
    def _save_base64_image(self, img_data: str, filename: str) -> Optional[str]:
        """Save base64 image to temporary file and return path"""
        try:
            # Create temp directory
            temp_dir = Path("temp_chat_images")
            temp_dir.mkdir(exist_ok=True)
            
            # Decode base64
            header, data = img_data.split(",", 1)
            img_bytes = base64.b64decode(data)
            
            # Determine file extension
            if "jpeg" in header or "jpg" in header:
                ext = ".jpg"
            elif "png" in header:
                ext = ".png"
            elif "gif" in header:
                ext = ".gif"
            else:
                ext = ".png"  # default
            
            # Save file
            file_path = temp_dir / f"{filename}{ext}"
            with open(file_path, "wb") as f:
                f.write(img_bytes)
            
            return str(file_path)
        except Exception as e:
            print(f"[ERROR] Failed to save base64 image: {e}")
            return None
    
    async def embed_message(self, message_data: Dict[str, Any]) -> bool:
        """Embed a single chat message"""
        try:
            message_id = message_data["message_id"]
            content = message_data["content"]
            has_images = message_data["has_images"]
            
            print(f"[DEBUG] ===== START EMBEDDING MESSAGE {message_id} =====")
            print(f"[DEBUG] Role: {message_data['role']}")
            print(f"[DEBUG] Has images: {has_images}")
            print(f"[DEBUG] Content length: {len(content)}")
            print(f"[DEBUG] Message metadata keys: {list(message_data.get('metadata', {}).keys())}")
            print(f"[DEBUG] Full metadata: {message_data.get('metadata', {})}")
            
            # Create a ChatMessage object for processing
            print(f"[DEBUG] Creating ChatMessage object...")
            message = ChatMessage(
                role=message_data["role"],
                content=content,
                timestamp=message_data["timestamp"],
                metadata=message_data["metadata"]
            )
            print(f"[DEBUG] ChatMessage created successfully")
            
            # Extract images if present
            images = []
            if has_images:
                print(f"[DEBUG] Extracting images from message...")
                try:
                    images = self._extract_images_from_message(message)
                    print(f"[DEBUG] Extracted {len(images)} images from message")
                    for i, img in enumerate(images):
                        print(f"[DEBUG] Image {i}: {img.get('data', 'NO_DATA')}")
                except Exception as e:
                    print(f"[ERROR] Failed to extract images from message: {e}")
                    print(f"[ERROR] Exception type: {type(e)}")
                    print(f"[ERROR] Exception args: {e.args}")
                    import traceback
                    print(f"[ERROR] Traceback: {traceback.format_exc()}")
                    print(f"[ERROR] Message metadata: {message.metadata}")
                    # Continue without images
                    images = []
            else:
                print(f"[DEBUG] No images to extract (has_images=False)")
            
            # Create chunk-like structure for embedding
            chunk = {
                "text": content,
                "images": images,
                "metadata": {
                    "message_id": message_id,
                    "session_id": message_data["session_id"],
                    "user_id": message_data["user_id"],
                    "role": message_data["role"],
                    "timestamp": message_data["timestamp"].isoformat(),
                    "source": "chat_message"
                }
            }
            
            # Embed the chunk
            print(f"[DEBUG] Getting embedder...")
            embedder = self._get_embedder()
            print(f"[DEBUG] Embedder obtained: {type(embedder)}")
            
            if has_images and images:
                print(f"[DEBUG] Using image+text embedding with {len(images)} images")
                try:
                    embedding = embedder.embed_chunks([chunk])[0]
                    print(f"[DEBUG] Image+text embedding successful, length: {len(embedding)}")
                except Exception as e:
                    print(f"[ERROR] Image+text embedding failed: {e}")
                    print(f"[ERROR] Exception type: {type(e)}")
                    import traceback
                    print(f"[ERROR] Traceback: {traceback.format_exc()}")
                    raise
            else:
                print(f"[DEBUG] Using text-only embedding")
                try:
                    embedding = embedder.embed([content])[0]
                    print(f"[DEBUG] Text-only embedding successful, length: {len(embedding)}")
                except Exception as e:
                    print(f"[ERROR] Text-only embedding failed: {e}")
                    print(f"[ERROR] Exception type: {type(e)}")
                    import traceback
                    print(f"[ERROR] Traceback: {traceback.format_exc()}")
                    raise
            
            # Initialize persistent store if needed
            if self.persistent_store is None:
                self.persistent_store = PersistentVectorStore(collection_name=self.embedding_collection_name)
                await self.persistent_store.initialize()
            
            # Store in persistent vector store
            try:
                await self.persistent_store.add_embeddings(
                    texts=[content],
                    embeddings=[embedding],
                    metadatas=[chunk["metadata"]]
                )
                print(f"[DEBUG] Successfully stored embedding in persistent store for message {message_id}")
            except Exception as e:
                print(f"[ERROR] Failed to store in persistent store: {e}")
            
            # MongoDB removed - embeddings are only stored in memory/vector store
            
            print(f"[LOG] Successfully embedded message {message_id}")
            return True
            
        except Exception as e:
            print(f"[ERROR] Failed to embed message {message_data.get('message_id', 'unknown')}: {e}")
            return False
    
    def _update_vector_store(self, chunks: List[Dict[str, Any]], embeddings: List[List[float]]):
        """Update the in-memory vector store with new embeddings"""
        try:
            if not chunks or not embeddings:
                return
            
            # Convert to numpy arrays
            new_vectors = np.array(embeddings)
            new_metadatas = [chunk["metadata"] for chunk in chunks]
            
            if self.vector_store.dense_vectors.size == 0:
                # First embeddings
                self.vector_store.dense_vectors = new_vectors
                self.vector_store.metadatas = new_metadatas
            else:
                # Append to existing
                self.vector_store.dense_vectors = np.vstack([
                    self.vector_store.dense_vectors, 
                    new_vectors
                ])
                self.vector_store.metadatas.extend(new_metadatas)
            
            # Update TF-IDF matrix
            from sklearn.feature_extraction.text import TfidfVectorizer
            all_texts = [meta.get("text", "") for meta in self.vector_store.metadatas]
            
            if all_texts:
                tfidf = TfidfVectorizer(max_features=50000, ngram_range=(1, 2))
                self.vector_store.tfidf_matrix = tfidf.fit_transform(all_texts)
                self.vector_store.tfidf_vectorizer = tfidf
            
            print(f"[LOG] Updated vector store with {len(chunks)} new embeddings")
            
        except Exception as e:
            print(f"[ERROR] Failed to update vector store: {e}")
    
    async def embed_unembedded_messages(self, limit: int = 50) -> Dict[str, Any]:
        """Embed all unembedded chat messages"""
        try:
            unembedded = await self.get_unembedded_messages(limit)
            
            if not unembedded:
                return {
                    "status": "success",
                    "message": "No unembedded messages found",
                    "processed": 0,
                    "failed": 0
                }
            
            processed = 0
            failed = 0
            
            for message_data in unembedded:
                success = await self.embed_message(message_data)
                if success:
                    processed += 1
                else:
                    failed += 1
            
            return {
                "status": "success",
                "message": f"Processed {processed} messages, {failed} failed",
                "processed": processed,
                "failed": failed,
                "total_found": len(unembedded)
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"Failed to embed messages: {str(e)}",
                "processed": 0,
                "failed": 0
            }
    
    async def search_chat_history(self, query: str, top_k: int = 5, image: str = None) -> List[Dict[str, Any]]:
        """Search chat history using the vector store"""
        try:
            # Initialize persistent store if needed
            if self.persistent_store is None:
                self.persistent_store = PersistentVectorStore(collection_name=self.embedding_collection_name)
                await self.persistent_store.initialize()
            
            memory_store = self.persistent_store.get_memory_store()
            if not memory_store or memory_store.dense_vectors.size == 0:
                return []
            
            # Use embedder to encode query
            embedder = self._get_embedder()
            if image:
                query_embedding = embedder.encode_query(image=image, text=query)
            else:
                query_embedding = embedder.embed([query])[0]
            
            # Search using dense similarity
            query_vec = np.array(query_embedding)
            hits = memory_store.dense_search(query_vec, top_k)
            
            results = []
            for idx, score in hits:
                if idx < len(memory_store.metadatas):
                    metadata = memory_store.metadatas[idx]
                    results.append({
                        "score": float(score),
                        "text": metadata.get("text", ""),
                        "session_id": metadata.get("session_id", ""),
                        "user_id": metadata.get("user_id", ""),
                        "role": metadata.get("role", ""),
                        "timestamp": metadata.get("timestamp", ""),
                        "message_id": metadata.get("message_id", ""),
                        "has_images": metadata.get("has_images", False)
                    })
            
            return results
            
        except Exception as e:
            print(f"[ERROR] Failed to search chat history: {e}")
            return []
    
    def get_vector_store(self) -> InMemoryVectorStore:
        """Get the current vector store for use in retrieval"""
        if self.persistent_store and self.persistent_store.get_memory_store():
            return self.persistent_store.get_memory_store()
        return self.vector_store


# Global instance
chat_embedding_service = ChatEmbeddingService()
