from typing import List, Optional, Dict, Any
import uuid

from paperreader.models.chat import (
    ChatSession,
    ChatMessage,
    ChatSessionCreate,
    ChatMessageCreate,
    ChatSessionResponse,
    ChatMessageResponse,
)
from paperreader.services.chat import repository as chat_repository


class ChatService:
    async def create_session(self, session_data: ChatSessionCreate) -> ChatSession:
        metadata = session_data.metadata or {}
        session_id = session_data.session_id or str(uuid.uuid4())

        doc = await chat_repository.create_session(
            session_id=session_id,
            user_id=session_data.user_id,
            title=None,
            metadata=metadata,
        )

        if session_data.initial_message:
            await self.add_message(
                session_id,
                ChatMessageCreate(role="user", content=session_data.initial_message),
            )

        return await self.get_session(session_id) or ChatSession(
            session_id=session_id,
            user_id=session_data.user_id,
            title=None,
            metadata=metadata,
            messages=[],
        )

    async def get_session(self, session_id: str) -> Optional[ChatSession]:
        session_doc = await chat_repository.get_session(session_id)
        if not session_doc:
            return None

        messages = [
            ChatMessage(
                role=msg.get("role"),
                content=msg.get("content"),
                metadata=msg.get("metadata"),
                timestamp=msg.get("created_at"),
            )
            for msg in session_doc.get("messages", [])
            if msg.get("role") != "system"
        ]

        return ChatSession(
            session_id=session_doc["session_id"],
            user_id=session_doc.get("user_id"),
            title=None,
            metadata=session_doc.get("metadata") or {},
            messages=messages,
            created_at=session_doc.get("created_at"),
            updated_at=session_doc.get("updated_at"),
        )

    async def add_message(self, session_id: str, message: ChatMessageCreate) -> Optional[ChatSession]:
        if message.role == "system":
            return await self.get_session(session_id)

        await chat_repository.append_message(
            session_id=session_id,
            role=message.role,
            content=message.content,
            metadata=message.metadata,
        )
        return await self.get_session(session_id)

    async def get_session_messages(self, session_id: str, limit: Optional[int] = None) -> List[ChatMessage]:
        messages = await chat_repository.get_recent_messages(session_id, limit or 0)
        return [
            ChatMessage(
                role=msg.get("role"),
                content=msg.get("content"),
                metadata=msg.get("metadata"),
                timestamp=msg.get("created_at"),
            )
            for msg in messages
            if msg.get("role") != "system"
        ]

    async def get_recent_messages(self, session_id: str, limit: int = 10) -> List[ChatMessage]:
        return await self.get_session_messages(session_id, limit)

    async def delete_session(self, session_id: str) -> None:
        await chat_repository.delete_session(session_id)

    async def list_user_sessions(self, user_id: str, limit: int = 20) -> List[ChatSessionResponse]:
        sessions = await chat_repository.list_sessions(user_id, limit)
        responses: List[ChatSessionResponse] = []
        for session in sessions:
            messages = await self.get_session_messages(session["session_id"], limit=5)
            responses.append(
                ChatSessionResponse(
                    session_id=session["session_id"],
                    title=None,
                    messages=messages,
                    created_at=session.get("created_at"),
                    updated_at=session.get("updated_at"),
                    message_count=len(messages),
                    metadata=session.get("metadata") or {},
                )
            )
        return responses

    async def get_session_response(self, session_id: str) -> Optional[ChatSessionResponse]:
        session = await self.get_session(session_id)
        if not session:
            return None
        return ChatSessionResponse(
            session_id=session.session_id,
            title=session.title,
            messages=session.messages,
            created_at=session.created_at,
            updated_at=session.updated_at,
            message_count=len(session.messages),
            metadata=session.metadata or {},
        )

    async def find_session_by_title(self, title: str, user_id: Optional[str] = None) -> Optional[ChatSession]:
        sessions = await chat_repository.list_sessions(user_id, limit=100) if user_id else []
        for session in sessions:
            if session.get("title") == title:
                return await self.get_session(session["session_id"])
        return None

    async def find_session_by_document(
        self,
        document_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Optional[ChatSession]:
        """Find an existing chat session by document_id."""
        session_doc = await chat_repository.find_session_by_document(
            document_id=document_id,
            user_id=user_id,
        )
        if not session_doc:
            return None

        messages = [
            ChatMessage(
                role=msg.get("role"),
                content=msg.get("content"),
                metadata=msg.get("metadata"),
                timestamp=msg.get("created_at"),
            )
            for msg in session_doc.get("messages", [])
            if msg.get("role") != "system"
        ]

        return ChatSession(
            session_id=session_doc["session_id"],
            user_id=session_doc.get("user_id"),
            title=None,
            metadata=session_doc.get("metadata") or {},
            messages=messages,
            created_at=session_doc.get("created_at"),
            updated_at=session_doc.get("updated_at"),
        )


chat_service = ChatService()
