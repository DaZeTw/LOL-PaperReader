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
        # Check if MongoDB is connected (proper way to check motor database objects)
        # Motor database objects cannot be compared with None directly, so we check by accessing name
        try:
            db_name = mongodb.database.name
        except (AttributeError, TypeError):
            print("[ERROR] MongoDB database not connected! Call mongodb.connect() first.")
            raise RuntimeError("MongoDB not connected")
        
        print(f"[DEBUG] Creating session in database: {db_name}, collection: {self.collection_name}")
        
        collection = mongodb.get_collection(self.collection_name)
        
        # Create initial messages - always add system message first
        messages = []
        
        # Add system message with default system prompt
        system_prompt = (
            "You are a helpful assistant that answers questions using chat history, images, and document context."
            "\n\nPRIORITY ORDER:"
            "\n1. Use chat history for questions about previous messages."
            "\n2. Analyze user-uploaded images directly for image questions."
            "\n3. Use provided document context only to support explanations."
            "\n\nRULES:"
            "\n- Never quote raw document text when answering."
            "\n- Focus on what is visible in images for image-related queries."
            "\n- Be concise and factual. Add [cN] markers when referencing document context."
            "\n- At the end of your answer, provide a confidence score (0.0-1.0) based on how well the provided document context supports your answer. Format: [CONFIDENCE:0.85]"
        )
        messages.append(ChatMessage(
            role="system",
            content=system_prompt,
            timestamp=datetime.utcnow()
        ))
        
        # Create initial message if provided
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
        print(f"[DEBUG] ===== CREATING NEW CHAT SESSION =====")
        print(f"[DEBUG] session_id (UUID): {session_data.session_id}")
        print(f"[DEBUG] Database: {db_name}, Collection: {self.collection_name}")
        
        try:
            result = await collection.insert_one(session_dict)
            print(f"[DEBUG] ✅ Session created successfully!")
            print(f"[DEBUG] 📋 Session Info:")
            print(f"[DEBUG]   - session_id (UUID): {session_data.session_id}")
            print(f"[DEBUG]   - MongoDB _id (ObjectId): {result.inserted_id}")
            print(f"[DEBUG]   - Database: {db_name}, Collection: {self.collection_name}")
            print(f"[DEBUG] 💡 To query in MongoDB Atlas, use: {{'session_id': '{session_data.session_id}'}}")
            
            # Verify the session was saved
            verify_session = await collection.find_one({"_id": result.inserted_id})
            if verify_session:
                print(f"[DEBUG] ✅ Verified: Session exists in database")
                print(f"[DEBUG]   - Verified session_id: {verify_session.get('session_id')}")
                print(f"[DEBUG] =======================================")
            else:
                print(f"[WARNING] ❌ Session verification failed - not found after insert!")
                print(f"[DEBUG] =======================================")
        except Exception as e:
            print(f"[ERROR] Failed to create session in MongoDB: {e}")
            print(f"[ERROR] Database: {db_name}, Collection: {self.collection_name}")
            raise
        
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
        # Check if MongoDB is connected (proper way to check motor database objects)
        # Motor database objects cannot be compared with None directly, so we check by accessing name
        try:
            db_name = mongodb.database.name
        except (AttributeError, TypeError):
            print("[ERROR] MongoDB database not connected! Call mongodb.connect() first.")
            raise RuntimeError("MongoDB not connected")
        
        print(f"[DEBUG] Using database: {db_name}, collection: {self.collection_name}")
        
        collection = mongodb.get_collection(self.collection_name)
        
        # Create the message object
        chat_message = ChatMessage(
            role=message.role,
            content=message.content,
            metadata=message.metadata,
            timestamp=datetime.utcnow()
        )
        
        # Log message being saved
        print(f"[DEBUG] Saving message to database - Session: {session_id}, Role: {message.role}")
        print(f"[DEBUG] Message metadata keys: {list(message.metadata.keys()) if message.metadata else 'None'}")
        print(f"[DEBUG] Database: {db_name}, Collection: {self.collection_name}")
        
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
            
            # Verify the message was saved - try multiple times with slight delay
            import asyncio
            await asyncio.sleep(0.1)  # Small delay to ensure write is committed
            verify_session = await collection.find_one({"session_id": session_id})
            if verify_session:
                msg_count = len(verify_session.get("messages", []))
                print(f"[DEBUG] ✅ Verified: Session now has {msg_count} messages in database")
                print(f"[DEBUG] 📋 Session Info:")
                print(f"[DEBUG]   - session_id (UUID): {verify_session.get('session_id')}")
                print(f"[DEBUG]   - MongoDB _id (ObjectId): {verify_session.get('_id')}")
                print(f"[DEBUG]   - Database: {db_name}, Collection: {self.collection_name}")
                print(f"[DEBUG] 💡 To query in MongoDB Atlas, use: {{'session_id': '{session_id}'}}")
            else:
                print(f"[ERROR] ❌ Verification failed - session not found after save!")
                print(f"[ERROR] Searched for session_id: {session_id}")
            
        except Exception as e:
            import traceback
            print(f"[ERROR] Failed to save message to MongoDB: {e}")
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            print(f"[ERROR] Database: {db_name}, Collection: {self.collection_name}")
            raise
        
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
