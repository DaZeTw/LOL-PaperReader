#chat_routes.py
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
import uuid
from datetime import datetime

from paperreader.services.chat.chat_service import chat_service
from paperreader.models.chat import (
    ChatSessionCreate, 
    ChatMessageCreate, 
    ChatSessionResponse,
    ChatMessageResponse
)
from paperreader.services.qa.config import PipelineConfig
from paperreader.services.qa.pipeline import QAPipeline

router = APIRouter()

class ChatAskRequest(BaseModel):
    session_id: str
    question: str
    retriever: str = "hybrid"
    generator: str = "openai"
    image_policy: str = "auto"
    top_k: int = 5
    max_tokens: int = 512
    user_images: Optional[List[str]] = None

class ChatAskResponse(BaseModel):
    session_id: str
    question: str
    answer: str
    cited_sections: List[dict]
    retriever_scores: List[dict]
    message_id: str
    timestamp: datetime

class ChatSessionCreateRequest(BaseModel):
    user_id: Optional[str] = None
    title: Optional[str] = None
    initial_message: Optional[str] = None

class ChatSessionListResponse(BaseModel):
    sessions: List[ChatSessionResponse]

@router.post("/sessions", response_model=ChatSessionResponse)
async def create_chat_session(request: ChatSessionCreateRequest):
    """Create a new chat session"""
    try:
        # Generate a unique session ID
        session_id = str(uuid.uuid4())
        
        session_data = ChatSessionCreate(
            session_id=session_id,
            user_id=request.user_id,
            title=request.title,
            initial_message=request.initial_message
        )
        
        session = await chat_service.create_session(session_data)
        
        return ChatSessionResponse(
            session_id=session.session_id,
            title=session.title,
            messages=session.messages,
            created_at=session.created_at,
            updated_at=session.updated_at,
            message_count=len(session.messages)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_chat_session(session_id: str):
    """Get a chat session by ID"""
    try:
        session = await chat_service.get_session_response(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions", response_model=ChatSessionListResponse)
async def list_chat_sessions(user_id: Optional[str] = None, limit: int = 20):
    """List chat sessions for a user"""
    try:
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")
        
        sessions = await chat_service.list_user_sessions(user_id, limit)
        return ChatSessionListResponse(sessions=sessions)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ask", response_model=ChatAskResponse)
async def ask_question(request: ChatAskRequest):
    """Ask a question in a chat session"""
    try:
        # Get or create session
        session = await chat_service.get_session(request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get recent chat history for context (last 10 messages)
        chat_history = await chat_service.get_recent_messages(request.session_id, limit=10)
        
        # Convert chat history to the format expected by the generator
        history_for_generator = []
        for msg in chat_history:
            history_for_generator.append({
                "role": msg.role,
                "content": msg.content
            })
        
        # Add user question to chat history
        await chat_service.add_message(request.session_id, ChatMessageCreate(
            role="user",
            content=request.question
        ))
        
        # Configure and run the QA pipeline
        config = PipelineConfig(
            retriever_name=request.retriever,
            generator_name=request.generator,
            image_policy=request.image_policy,
            top_k=request.top_k,
            max_tokens=request.max_tokens,
        )
        
        pipeline = QAPipeline(config)
        result = await pipeline.answer(
            question=request.question,
            user_images=request.user_images,
            chat_history=history_for_generator
        )
        
        # Add assistant response to chat history
        await chat_service.add_message(request.session_id, ChatMessageCreate(
            role="assistant",
            content=result["answer"],
            metadata={
                "citations": result.get("citations", []),
                "cited_sections": result.get("cited_sections", []),
                "retriever_scores": result.get("retriever_scores", [])
            }
        ))
        
        # Generate message ID for the response
        message_id = str(uuid.uuid4())
        
        return ChatAskResponse(
            session_id=request.session_id,
            question=request.question,
            answer=result["answer"],
            cited_sections=result.get("cited_sections", []),
            retriever_scores=result.get("retriever_scores", []),
            message_id=message_id,
            timestamp=datetime.utcnow()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ask-with-upload")
async def ask_with_upload(
    session_id: str,
    question: str,
    retriever: str = "hybrid",
    generator: str = "openai",
    image_policy: str = "auto",
    top_k: int = 5,
    max_tokens: int = 512,
    images: List[UploadFile] = File(None),
):
    """Ask a question with image uploads in a chat session"""
    try:
        import base64
        from pathlib import Path
        
        # Get or create session
        session = await chat_service.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Convert uploaded images to base64 data URLs
        user_images = []
        if images:
            for img in images:
                content = await img.read()
                b64 = base64.b64encode(content).decode("ascii")
                # Infer mime type from filename
                ext = Path(img.filename).suffix.lower()
                mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}
                mime = mime_map.get(ext, "image/png")
                data_url = f"data:{mime};base64,{b64}"
                user_images.append(data_url)
        
        # Get recent chat history for context
        chat_history = await chat_service.get_recent_messages(session_id, limit=10)
        
        # Convert chat history to the format expected by the generator
        history_for_generator = []
        for msg in chat_history:
            history_for_generator.append({
                "role": msg.role,
                "content": msg.content
            })
        
        # Add user question to chat history
        await chat_service.add_message(session_id, ChatMessageCreate(
            role="user",
            content=question
        ))
        
        # Configure and run the QA pipeline
        config = PipelineConfig(
            retriever_name=retriever,
            generator_name=generator,
            image_policy=image_policy,
            top_k=top_k,
            max_tokens=max_tokens,
        )
        
        pipeline = QAPipeline(config)
        result = await pipeline.answer(
            question=question,
            user_images=user_images or None,
            chat_history=history_for_generator
        )
        
        # Add assistant response to chat history
        await chat_service.add_message(session_id, ChatMessageCreate(
            role="assistant",
            content=result["answer"],
            metadata={
                "citations": result.get("citations", []),
                "cited_sections": result.get("cited_sections", []),
                "retriever_scores": result.get("retriever_scores", [])
            }
        ))
        
        # Generate message ID for the response
        message_id = str(uuid.uuid4())
        
        return ChatAskResponse(
            session_id=session_id,
            question=question,
            answer=result["answer"],
            cited_sections=result.get("cited_sections", []),
            retriever_scores=result.get("retriever_scores", []),
            message_id=message_id,
            timestamp=datetime.utcnow()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/sessions/{session_id}/title")
async def update_session_title(session_id: str, title: str):
    """Update the title of a chat session"""
    try:
        success = await chat_service.update_session_title(session_id, title)
        if not success:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"message": "Title updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/sessions/{session_id}")
async def delete_chat_session(session_id: str):
    """Delete a chat session"""
    try:
        success = await chat_service.delete_session(session_id)
        if not success:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"message": "Session deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
