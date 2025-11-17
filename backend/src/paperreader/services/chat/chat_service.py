from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

from paperreader.models.chat import (
    ChatSession, 
    ChatMessage, 
    ChatSessionCreate, 
    ChatMessageCreate,
    ChatSessionResponse,
    ChatMessageResponse
)

# In-memory storage (temporary until database is redesigned)
_sessions_store: Dict[str, ChatSession] = {}

class ChatService:
    def __init__(self):
        self.collection_name = "chat_sessions"  # Kept for compatibility, not used
    
    async def create_session(self, session_data: ChatSessionCreate) -> ChatSession:
        """Create a new chat session"""
        print(f"[DEBUG] Creating session in-memory: {session_data.session_id}")
        
        # Create initial messages - DO NOT save system messages
        messages = []
        
        # Only add user messages if provided (never save system messages)
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
        
        # Store in memory
        _sessions_store[session_data.session_id] = chat_session
        
        print(f"[DEBUG] ✅ Session created in-memory: {session_data.session_id}")
        return chat_session
    
    async def get_session(self, session_id: str) -> Optional[ChatSession]:
        """Get a chat session by session_id"""
        return _sessions_store.get(session_id)
    
    async def add_message(self, session_id: str, message: ChatMessageCreate) -> Optional[ChatSession]:
        """Add a message to an existing chat session"""
        print(f"[DEBUG] Adding message to session: {session_id}, role: {message.role}")
        
        # Filter: Do NOT save system messages
        if message.role == "system":
            print(f"[DEBUG] Skipping system message - system messages are not saved")
            return await self.get_session(session_id)
        
        # Get or create session
        session = _sessions_store.get(session_id)
        if not session:
            print(f"[DEBUG] Session not found, creating new session: {session_id}")
            session_data = ChatSessionCreate(
                session_id=session_id,
                user_id=None,
                title=f"Chat Session {session_id[:8]}",
                initial_message=None
            )
            session = await self.create_session(session_data)
        
        # Create the message object
        chat_message = ChatMessage(
            role=message.role,
            content=message.content,
            metadata=message.metadata,
            timestamp=datetime.utcnow()
        )
        
        # Add message to session
        if not session.messages:
            session.messages = []
        session.messages.append(chat_message)
        session.updated_at = datetime.utcnow()
        
        # Update store
        _sessions_store[session_id] = session
        
        print(f"[DEBUG] ✅ Message saved. Session now has {len(session.messages)} messages")
        return session
    
    async def get_session_messages(self, session_id: str, limit: Optional[int] = None) -> List[ChatMessage]:
        """Get messages from a chat session (excludes system messages)"""
        print(f"[DEBUG] get_session_messages called with session_id: {session_id}")
        session = await self.get_session(session_id)
        if not session:
            print(f"[DEBUG] ⚠️ Session {session_id} not found - returning empty messages list")
            return []
        
        print(f"[DEBUG] ✅ Found session {session_id} with {len(session.messages) if session.messages else 0} total messages")
        
        # Filter out system messages - only return user and assistant messages
        messages = [msg for msg in session.messages if msg.role != "system"]
        print(f"[DEBUG] After filtering system messages: {len(messages)} messages (user + assistant)")
        
        if limit:
            messages = messages[-limit:]  # Get last N messages
            print(f"[DEBUG] After applying limit={limit}: {len(messages)} messages")
        
        return messages
    
    async def get_recent_messages(self, session_id: str, limit: int = 10) -> List[ChatMessage]:
        """Get recent messages from a chat session for context"""
        return await self.get_session_messages(session_id, limit)
    
    async def update_session_title(self, session_id: str, title: str) -> bool:
        """Update the title of a chat session"""
        session = _sessions_store.get(session_id)
        if not session:
            return False
        
        session.title = title
        session.updated_at = datetime.utcnow()
        _sessions_store[session_id] = session
        return True
    
    async def delete_session(self, session_id: str) -> bool:
        """Delete a chat session"""
        if session_id in _sessions_store:
            del _sessions_store[session_id]
            return True
        return False
    
    async def list_user_sessions(self, user_id: str, limit: int = 20) -> List[ChatSessionResponse]:
        """List chat sessions for a user"""
        sessions = []
        for session in _sessions_store.values():
            if session.user_id == user_id:
                sessions.append(ChatSessionResponse(
                    session_id=session.session_id,
                    title=session.title,
                    messages=session.messages,
                    created_at=session.created_at,
                    updated_at=session.updated_at,
                    message_count=len(session.messages)
                ))
        
        # Sort by updated_at descending and limit
        sessions.sort(key=lambda s: s.updated_at, reverse=True)
        return sessions[:limit]
    
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
    
    async def find_session_by_title(self, title: str, user_id: Optional[str] = None) -> Optional[ChatSession]:
        """Find the most recent session with matching title (and user_id if provided)"""
        matching_sessions = []
        
        for session in _sessions_store.values():
            if session.title == title:
                if user_id is not None:
                    if session.user_id == user_id:
                        matching_sessions.append(session)
                else:
                    if session.user_id is None:
                        matching_sessions.append(session)
        
        if not matching_sessions:
            return None
        
        # Return most recently updated
        matching_sessions.sort(key=lambda s: s.updated_at, reverse=True)
        return matching_sessions[0]

# Global chat service instance
chat_service = ChatService()
