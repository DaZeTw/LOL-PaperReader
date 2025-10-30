from typing import List, Dict, Any, Optional
from datetime import datetime
import base64
import uuid
from pathlib import Path
import os

from paperreader.database.mongodb import mongodb
from paperreader.models.chat import ChatSession, ChatMessage
import numpy as np


class SimpleChatEmbeddingService:
    """Simplified service to handle chat message storage without heavy embedding models"""
    
    def __init__(self):
        self.collection_name = "chat_sessions"
        self.embedding_collection_name = "chat_embeddings"
    
    async def get_unembedded_messages(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get chat messages that haven't been embedded yet"""
        collection = mongodb.get_collection(self.collection_name)
        embedding_collection = mongodb.get_collection(self.embedding_collection_name)
        
        # Get all embedded message IDs
        embedded_ids = set()
        async for doc in embedding_collection.find({}, {"message_id": 1}):
            embedded_ids.add(doc.get("message_id"))
        
        # Get unembedded messages
        unembedded_messages = []
        async for session_doc in collection.find():
            session = ChatSession(**session_doc)
            for message in session.messages:
                # Create a unique message ID
                message_id = f"{session.session_id}_{message.timestamp.isoformat()}_{message.role}"
                
                if message_id not in embedded_ids:
                    unembedded_messages.append({
                        "message_id": message_id,
                        "session_id": session.session_id,
                        "user_id": session.user_id,
                        "role": message.role,
                        "content": message.content,
                        "timestamp": message.timestamp,
                        "metadata": message.metadata or {},
                        "has_images": self._has_images_in_message(message)
                    })
        
        return unembedded_messages[:limit]
    
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
    
    async def store_message_for_embedding(self, message_data: Dict[str, Any]) -> bool:
        """Store message data for later embedding (without actually embedding)"""
        try:
            message_id = message_data["message_id"]
            content = message_data["content"]
            has_images = message_data["has_images"]
            
            # Store basic message info without embedding
            embedding_collection = mongodb.get_collection(self.embedding_collection_name)
            await embedding_collection.insert_one({
                "message_id": message_id,
                "text": content,
                "metadata": {
                    "message_id": message_id,
                    "session_id": message_data["session_id"],
                    "user_id": message_data["user_id"],
                    "role": message_data["role"],
                    "timestamp": message_data["timestamp"].isoformat(),
                    "source": "chat_message"
                },
                "has_images": has_images,
                "needs_embedding": True,  # Flag to indicate this needs embedding
                "created_at": datetime.utcnow()
            })
            
            print(f"[LOG] Stored message {message_id} for embedding")
            return True
            
        except Exception as e:
            print(f"[ERROR] Failed to store message {message_data.get('message_id', 'unknown')}: {e}")
            return False
    
    async def store_unembedded_messages(self, limit: int = 50) -> Dict[str, Any]:
        """Store all unembedded chat messages for later embedding"""
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
                success = await self.store_message_for_embedding(message_data)
                if success:
                    processed += 1
                else:
                    failed += 1
            
            return {
                "status": "success",
                "message": f"Stored {processed} messages for embedding, {failed} failed",
                "processed": processed,
                "failed": failed,
                "total_found": len(unembedded)
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"Failed to store messages: {str(e)}",
                "processed": 0,
                "failed": 0
            }
    
    async def get_embedding_stats(self) -> Dict[str, Any]:
        """Get statistics about stored messages"""
        try:
            # Get total chat messages
            collection = mongodb.get_collection(self.collection_name)
            
            total_messages = 0
            async for session_doc in collection.find():
                total_messages += len(session_doc.get("messages", []))
            
            # Get stored messages count
            embedding_collection = mongodb.get_collection(self.embedding_collection_name)
            stored_count = await embedding_collection.count_documents({})
            
            # Get messages that need embedding
            needs_embedding_count = await embedding_collection.count_documents({"needs_embedding": True})
            
            return {
                "total_chat_messages": total_messages,
                "stored_messages": stored_count,
                "needs_embedding": needs_embedding_count,
                "unembedded_messages": total_messages - stored_count,
                "storage_percentage": (stored_count / total_messages * 100) if total_messages > 0 else 0
            }
        except Exception as e:
            return {
                "error": f"Failed to get stats: {str(e)}"
            }


# Global instance
simple_chat_embedding_service = SimpleChatEmbeddingService()
