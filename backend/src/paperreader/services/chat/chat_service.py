from typing import List, Optional, Dict, Any
from datetime import datetime
from bson import ObjectId

from paperreader.database.mongodb import mongodb
from paperreader.models.chat import (
    ChatSession, 
    ChatMessage, 
    ChatSessionCreate, 
    ChatMessageCreate,
    ChatSessionResponse,
    ChatMessageResponse
)

class ChatService:
    def __init__(self):
        self.collection_name = "chat_sessions"
    
    async def create_session(self, session_data: ChatSessionCreate) -> ChatSession:
        """Create a new chat session"""
        collection = mongodb.get_collection(self.collection_name)
        
        # Create initial message if provided
        messages = []
        if session_data.initial_message:
            messages.append(ChatMessage(
                role="user",
                content=session_data.initial_message,
                timestamp=datetime.utcnow()
            ))
        
        chat_session = ChatSession(
            session_id=session_data.session_id,
            user_id=session_data.user_id,
            title=session_data.title,
            messages=messages,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        # Convert to dict for MongoDB insertion
        session_dict = chat_session.dict(by_alias=True, exclude={"id"})
        result = await collection.insert_one(session_dict)
        
        # Update the session with the MongoDB ID
        chat_session.id = result.inserted_id
        return chat_session
    
    async def get_session(self, session_id: str) -> Optional[ChatSession]:
        """Get a chat session by session_id"""
        collection = mongodb.get_collection(self.collection_name)
        session_data = await collection.find_one({"session_id": session_id})
        
        if not session_data:
            return None
        
        return ChatSession(**session_data)
    
    async def add_message(self, session_id: str, message: ChatMessageCreate) -> Optional[ChatSession]:
        """Add a message to an existing chat session"""
        collection = mongodb.get_collection(self.collection_name)
        
        # Create the message object
        chat_message = ChatMessage(
            role=message.role,
            content=message.content,
            metadata=message.metadata,
            timestamp=datetime.utcnow()
        )
        
        # Update the session with the new message
        result = await collection.update_one(
            {"session_id": session_id},
            {
                "$push": {"messages": chat_message.dict()},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        if result.matched_count == 0:
            return None
        
        # Return the updated session
        return await self.get_session(session_id)
    
    async def get_session_messages(self, session_id: str, limit: Optional[int] = None) -> List[ChatMessage]:
        """Get messages from a chat session"""
        session = await self.get_session(session_id)
        if not session:
            return []
        
        messages = session.messages
        if limit:
            messages = messages[-limit:]  # Get last N messages
        
        return messages
    
    async def get_recent_messages(self, session_id: str, limit: int = 10) -> List[ChatMessage]:
        """Get recent messages from a chat session for context"""
        return await self.get_session_messages(session_id, limit)
    
    async def update_session_title(self, session_id: str, title: str) -> bool:
        """Update the title of a chat session"""
        collection = mongodb.get_collection(self.collection_name)
        result = await collection.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "title": title,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        return result.matched_count > 0
    
    async def delete_session(self, session_id: str) -> bool:
        """Delete a chat session"""
        collection = mongodb.get_collection(self.collection_name)
        result = await collection.delete_one({"session_id": session_id})
        return result.deleted_count > 0
    
    async def list_user_sessions(self, user_id: str, limit: int = 20) -> List[ChatSessionResponse]:
        """List chat sessions for a user"""
        collection = mongodb.get_collection(self.collection_name)
        
        cursor = collection.find(
            {"user_id": user_id}
        ).sort("updated_at", -1).limit(limit)
        
        sessions = []
        async for session_data in cursor:
            session = ChatSession(**session_data)
            sessions.append(ChatSessionResponse(
                session_id=session.session_id,
                title=session.title,
                messages=session.messages,
                created_at=session.created_at,
                updated_at=session.updated_at,
                message_count=len(session.messages)
            ))
        
        return sessions
    
    async def get_session_response(self, session_id: str) -> Optional[ChatSessionResponse]:
        """Get a session as a response object"""
        session = await self.get_session(session_id)
        if not session:
            return None
        
        return ChatSessionResponse(
            session_id=session.session_id,
            title=session.title,
            messages=session.messages,
            created_at=session.created_at,
            updated_at=session.updated_at,
            message_count=len(session.messages)
        )

# Global chat service instance
chat_service = ChatService()
