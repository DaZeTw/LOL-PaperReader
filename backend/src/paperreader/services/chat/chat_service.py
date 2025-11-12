from typing import List, Optional, Dict, Any
from datetime import datetime
from bson import ObjectId

from paperreader.config.settings import settings
from paperreader.database.file_storage import file_storage
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

    def _get_storage(self):
        """Get the active storage backend"""
        if settings.use_file_storage:
            return file_storage
        else:
            return mongodb.get_collection(self.collection_name)
    
    async def create_session(self, session_data: ChatSessionCreate) -> ChatSession:
        """Create a new chat session"""
        storage = self._get_storage()
        storage_type = "FileStorage" if settings.use_file_storage else "MongoDB"

        print(f"[DEBUG] Creating session using {storage_type}")

        collection = storage
        
        # Create initial messages - DO NOT save system messages to database
        # System prompt will be added dynamically when preparing chat history for generator
        messages = []
        
        # Only add user messages if provided (never save system messages to DB)
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
        
        # Convert to dict for storage insertion
        session_dict = chat_session.dict(by_alias=True, exclude={"id"})
        print(f"[DEBUG] ===== CREATING NEW CHAT SESSION =====")
        print(f"[DEBUG] session_id (UUID): {session_data.session_id}")
        print(f"[DEBUG] Storage: {storage_type}")

        try:
            result = await collection.insert_one(session_dict)
            print(f"[DEBUG] ✅ Session created successfully!")
            print(f"[DEBUG] 📋 Session Info:")
            print(f"[DEBUG]   - session_id (UUID): {session_data.session_id}")
            if not settings.use_file_storage:
                print(f"[DEBUG]   - MongoDB _id (ObjectId): {result.get('inserted_id')}")
                print(f"[DEBUG] 💡 To query in MongoDB Atlas, use: {{'session_id': '{session_data.session_id}'}}")

            # Verify the session was saved
            verify_session = await collection.find_one({"session_id": session_data.session_id})
            if verify_session:
                print(f"[DEBUG] ✅ Verified: Session exists in storage")
                print(f"[DEBUG]   - Verified session_id: {verify_session.get('session_id')}")
                print(f"[DEBUG] =======================================")
            else:
                print(f"[WARNING] ❌ Session verification failed - not found after insert!")
                print(f"[DEBUG] =======================================")
        except Exception as e:
            print(f"[ERROR] Failed to create session: {e}")
            print(f"[ERROR] Storage: {storage_type}")
            raise

        # Update the session with the storage ID (for MongoDB)
        if not settings.use_file_storage and result.get('inserted_id'):
            chat_session.id = result.get('inserted_id')
        return chat_session
    
    async def get_session(self, session_id: str) -> Optional[ChatSession]:
        """Get a chat session by session_id"""
        collection = self._get_storage()
        session_data = await collection.find_one({"session_id": session_id})

        if not session_data:
            return None

        return ChatSession(**session_data)
    
    async def add_message(self, session_id: str, message: ChatMessageCreate) -> Optional[ChatSession]:
        """Add a message to an existing chat session"""
        storage_type = "FileStorage" if settings.use_file_storage else "MongoDB"
        print(f"[DEBUG] Using storage: {storage_type}")

        collection = self._get_storage()
        
        # Create the message object
        chat_message = ChatMessage(
            role=message.role,
            content=message.content,
            metadata=message.metadata,
            timestamp=datetime.utcnow()
        )
        
        # Filter: Do NOT save system messages to database
        # Only save user and assistant messages
        if message.role == "system":
            print(f"[DEBUG] Skipping system message - system messages are not saved to database")
            print(f"[DEBUG] System messages are added dynamically when preparing chat history for generator")
            # Still return the session even though we didn't save
            return await self.get_session(session_id)
        
        # Log message being saved
        print(f"[DEBUG] Saving message to storage - Session: {session_id}, Role: {message.role}")
        print(f"[DEBUG] Message metadata keys: {list(message.metadata.keys()) if message.metadata else 'None'}")
        print(f"[DEBUG] Storage: {storage_type}")
        
        # Update the session with the new message
        try:
            result = await collection.update_one(
                {"session_id": session_id},
                {
                    "$push": {"messages": chat_message.dict()},
                    "$set": {"updated_at": datetime.utcnow()}
                }
            )
            
            print(f"[DEBUG] Update result - Matched: {result.matched_count}, Modified: {result.modified_count}")
            
            if result.matched_count == 0:
                print(f"[WARNING] Session {session_id} not found in database when trying to add message")
                print(f"[DEBUG] Checking if session exists...")
                existing = await collection.find_one({"session_id": session_id})
                if existing:
                    print(f"[DEBUG] Session exists but update failed. Session _id: {existing.get('_id')}")
                    print(f"[DEBUG] Existing session has {len(existing.get('messages', []))} messages")
                    # Try again with upsert=False to see what happens
                    print(f"[DEBUG] Retrying update...")
                else:
                    print(f"[DEBUG] Session does not exist in database")
                    print(f"[DEBUG] Creating session first...")
                    # Auto-create session if it doesn't exist
                    from paperreader.models.chat import ChatSessionCreate
                    session_data = ChatSessionCreate(
                        session_id=session_id,
                        user_id=None,
                        title=f"Chat Session {session_id[:8]}",
                        initial_message=None
                    )
                    await self.create_session(session_data)
                    # Retry the update
                    result = await collection.update_one(
                        {"session_id": session_id},
                        {
                            "$push": {"messages": chat_message.dict()},
                            "$set": {"updated_at": datetime.utcnow()}
                        }
                    )
                    print(f"[DEBUG] Retry update result - Matched: {result.matched_count}, Modified: {result.modified_count}")
                    if result.matched_count == 0:
                        return None
            
            print(f"[DEBUG] Message saved successfully. Modified count: {result.modified_count}")
            
            # Note: Detailed verification moved to after pipeline.answer() completes
            # This ensures we wait for all operations (chunk processing) to finish
            
        except Exception as e:
            import traceback
            print(f"[ERROR] Failed to save message to MongoDB: {e}")
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            print(f"[ERROR] Database: {db_name}, Collection: {self.collection_name}")
            raise
        
        # Return the updated session
        return await self.get_session(session_id)
    
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
        
        # Debug: Show message preview
        if messages:
            print(f"[DEBUG] Messages preview (last {min(3, len(messages))}):")
            for i, msg in enumerate(messages[-3:], 1):
                content_preview = msg.content[:60] + "..." if len(msg.content) > 60 else msg.content
                print(f"[DEBUG]   [{i}] {msg.role}: {content_preview}")
        
        return messages
    
    async def get_recent_messages(self, session_id: str, limit: int = 10) -> List[ChatMessage]:
        """Get recent messages from a chat session for context"""
        return await self.get_session_messages(session_id, limit)
    
    async def update_session_title(self, session_id: str, title: str) -> bool:
        """Update the title of a chat session"""
        collection = self._get_storage()
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
        collection = self._get_storage()
        result = await collection.delete_one({"session_id": session_id})
        return result.deleted_count > 0
    
    async def list_user_sessions(self, user_id: str, limit: int = 20) -> List[ChatSessionResponse]:
        """List chat sessions for a user"""
        collection = self._get_storage()

        sessions = []

        if settings.use_file_storage:
            # FileStorage.find() returns a list directly
            session_data_list = await collection.find({"user_id": user_id}, limit=limit)
            for session_data in session_data_list:
                session = ChatSession(**session_data)
                sessions.append(ChatSessionResponse(
                    session_id=session.session_id,
                    title=session.title,
                    messages=session.messages,
                    created_at=session.created_at,
                    updated_at=session.updated_at,
                    message_count=len(session.messages)
                ))
        else:
            # MongoDB returns a cursor
            cursor = collection.find(
                {"user_id": user_id}
            ).sort("updated_at", -1).limit(limit)

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
    
    async def find_session_by_title(self, title: str, user_id: Optional[str] = None) -> Optional[ChatSession]:
        """Find the most recent session with matching title (and user_id if provided)"""
        collection = self._get_storage()
        
        # Build query
        query = {"title": title}
        if user_id is not None:
            query["user_id"] = user_id
        else:
            # For anonymous sessions, match where user_id is null
            query["user_id"] = None
        
        # Find most recent session matching the title
        session_data = await collection.find_one(
            query,
            sort=[("updated_at", -1)]  # Most recently updated first
        )
        
        if not session_data:
            return None
        
        return ChatSession(**session_data)

# Global chat service instance
chat_service = ChatService()
