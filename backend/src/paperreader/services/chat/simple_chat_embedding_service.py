from typing import List, Dict, Any, Optional
from datetime import datetime
import base64
import uuid
from pathlib import Path
import os

# MongoDB removed - service disabled
# from paperreader.database.mongodb import mongodb
from paperreader.models.chat import ChatSession, ChatMessage
import numpy as np


class SimpleChatEmbeddingService:
    """Simplified service to handle chat message storage without heavy embedding models"""
    
    def __init__(self):
        self.collection_name = "chat_sessions"
        self.embedding_collection_name = "chat_embeddings"
    
    async def get_unembedded_messages(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get chat messages that haven't been embedded yet"""
        # MongoDB removed - return empty list
        print("[WARNING] SimpleChatEmbeddingService.get_unembedded_messages() called but MongoDB is disabled")
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
    
    async def store_message_for_embedding(self, message_data: Dict[str, Any]) -> bool:
        """Store message data for later embedding (without actually embedding)"""
        # MongoDB removed - service disabled
        print("[WARNING] SimpleChatEmbeddingService.store_message_for_embedding() called but MongoDB is disabled")
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
        # MongoDB removed - return empty stats
        return {
            "total_chat_messages": 0,
            "stored_messages": 0,
            "needs_embedding": 0,
            "unembedded_messages": 0,
            "storage_percentage": 0,
            "note": "MongoDB disabled - stats unavailable"
        }


# Global instance
simple_chat_embedding_service = SimpleChatEmbeddingService()
