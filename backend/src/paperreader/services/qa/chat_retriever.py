from typing import List, Dict, Any, Optional
import numpy as np
from paperreader.services.chat.chat_embedding_service import chat_embedding_service
from paperreader.services.qa.embeddings import get_embedder


class ChatRetriever:
    """Retriever that searches through embedded chat history"""
    
    def __init__(self):
        self.embedder = get_embedder()
        self.chat_service = chat_embedding_service
    
    async def retrieve_chat_history(self, query: str, top_k: int = 5, image: str = None) -> List[Dict[str, Any]]:
        """Retrieve relevant chat history based on query"""
        try:
            results = await self.chat_service.search_chat_history(
                query=query,
                top_k=top_k,
                image=image
            )
            
            # Format results for use in RAG pipeline
            formatted_results = []
            for result in results:
                formatted_results.append({
                    "text": result["text"],
                    "metadata": {
                        "source": "chat_history",
                        "session_id": result["session_id"],
                        "user_id": result["user_id"],
                        "role": result["role"],
                        "timestamp": result["timestamp"],
                        "message_id": result["message_id"],
                        "has_images": result["has_images"],
                        "score": result["score"]
                    }
                })
            
            return formatted_results
            
        except Exception as e:
            print(f"[ERROR] Failed to retrieve chat history: {e}")
            return []
    
    async def get_relevant_chat_context(self, query: str, session_id: str = None, top_k: int = 3) -> List[Dict[str, Any]]:
        """Get relevant chat context for a specific session or globally"""
        try:
            # If session_id provided, filter results to that session
            results = await self.retrieve_chat_history(query, top_k=top_k*2)
            
            if session_id:
                # Filter to specific session
                results = [r for r in results if r["metadata"]["session_id"] == session_id]
            
            # Return top_k results
            return results[:top_k]
            
        except Exception as e:
            print(f"[ERROR] Failed to get relevant chat context: {e}")
            return []
    
    def format_chat_context_for_generator(self, chat_results: List[Dict[str, Any]]) -> str:
        """Format chat results for use in generator context"""
        if not chat_results:
            return ""
        
        context_parts = []
        for i, result in enumerate(chat_results, 1):
            role = result["metadata"]["role"]
            text = result["text"]
            timestamp = result["metadata"]["timestamp"]
            
            context_parts.append(f"[Chat Context {i} - {role} at {timestamp}]\n{text}")
        
        return "\n\n".join(context_parts)


# Global instance
chat_retriever = ChatRetriever()
