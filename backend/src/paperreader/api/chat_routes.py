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
# Removed chat_embedding_service import - no longer using embeddings

router = APIRouter()

class ChatAskRequest(BaseModel):
    session_id: str
    question: str
    retriever: str = "hybrid"
    generator: str = "openai"
    image_policy: str = "auto"
    top_k: int = 5
    max_tokens: int = 1024  # Increased default for better responses
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
    print(f"[DEBUG] ===== CHAT ROUTE CALLED =====")
    print(f"[DEBUG] Session ID: {request.session_id}")
    print(f"[DEBUG] Question: {request.question}")
    print(f"[DEBUG] User images: {request.user_images}")
    print(f"[DEBUG] ==============================")
    try:
        # Get or create session
        session = await chat_service.get_session(request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get recent chat history for context (last 5 messages)
        chat_history = await chat_service.get_recent_messages(request.session_id, limit=5)
        
        # No more embedding search - just use recent chat history
        
        # Prepare chat history for generator - use recent messages directly
        history_for_generator = []
        
        # Add recent chat history messages
        for msg in chat_history:
            history_for_generator.append({
                "role": msg.role,
                "content": msg.content,
                "metadata": msg.metadata or {}
            })
        
        # Extract images from chat history for comparison
        history_images = []
        history_base64_images = []
        for msg in chat_history:
            if msg.metadata and msg.metadata.get("user_images"):
                for img in msg.metadata["user_images"]:
                    if img.startswith("data:image/"):
                        # Already base64
                        history_base64_images.append(img)
                    else:
                        # File path - convert to base64
                        try:
                            import base64
                            from pathlib import Path
                            
                            # Resolve image path
                            if img.startswith("./paperreader/img_query/"):
                                full_path = Path(img)
                            elif img.startswith("paperreader/img_query/"):
                                full_path = Path(f"./{img}")
                            else:
                                full_path = Path(img)
                            
                            if full_path.exists():
                                # Read and convert to base64
                                with open(full_path, "rb") as f:
                                    img_bytes = f.read()
                                
                                ext = full_path.suffix.lower()
                                mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}
                                mime = mime_map.get(ext, "image/png")
                                
                                b64 = base64.b64encode(img_bytes).decode("ascii")
                                data_url = f"data:{mime};base64,{b64}"
                                history_base64_images.append(data_url)
                                print(f"[DEBUG] History image {img} -> base64")
                            else:
                                print(f"[WARNING] History image file not found: {img}")
                        except Exception as e:
                            print(f"[WARNING] Failed to process history image {img}: {e}")
        
        print(f"[DEBUG] Chat history for generator: {len(history_for_generator)} messages")
        print(f"[DEBUG] Found {len(history_base64_images)} images from chat history")
        
        # Process user images - keep file paths for database, convert to base64 only for OpenAI
        processed_user_images = []
        base64_images_for_openai = []
        
        if request.user_images:
            for img_path in request.user_images:
                if isinstance(img_path, str):
                    if img_path.startswith("data:image/"):
                        # Already base64, use as is
                        processed_user_images.append(img_path)
                        base64_images_for_openai.append(img_path)
                    else:
                        # File path - keep original path for database
                        processed_user_images.append(img_path)
                        
                        # Convert to base64 only for OpenAI API
                        try:
                            import base64
                            from pathlib import Path
                            
                            # Resolve image path
                            if img_path.startswith("./paperreader/img_query/"):
                                full_path = Path(img_path)
                            elif img_path.startswith("paperreader/img_query/"):
                                full_path = Path(f"./{img_path}")
                            else:
                                full_path = Path(img_path)
                            
                            if full_path.exists():
                                # Read and convert to base64 for OpenAI
                                with open(full_path, "rb") as f:
                                    img_bytes = f.read()
                                
                                ext = full_path.suffix.lower()
                                mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}
                                mime = mime_map.get(ext, "image/png")
                                
                                b64 = base64.b64encode(img_bytes).decode("ascii")
                                data_url = f"data:{mime};base64,{b64}"
                                base64_images_for_openai.append(data_url)
                                print(f"[DEBUG] Image {img_path} -> base64 for OpenAI")
                            else:
                                print(f"[WARNING] Image file not found: {img_path}")
                        except Exception as e:
                            print(f"[WARNING] Failed to process image {img_path}: {e}")
                else:
                    print(f"[WARNING] Invalid image data type: {type(img_path)}")
        
        # Combine current images with history images for comparison
        all_user_images = processed_user_images + history_images
        all_base64_images = base64_images_for_openai + history_base64_images
        
        print(f"[DEBUG] ===== IMAGE PROCESSING =====")
        print(f"[DEBUG] Processed user images (file paths): {len(processed_user_images)}")
        print(f"[DEBUG] Base64 images for OpenAI: {len(base64_images_for_openai)}")
        print(f"[DEBUG] History base64 images: {len(history_base64_images)}")
        print(f"[DEBUG] Total images for comparison: {len(all_user_images)}")
        print(f"[DEBUG] Total base64 images: {len(all_base64_images)}")
        print(f"[DEBUG] ============================")
        
        # Add user question to chat history with file paths in metadata
        user_message = ChatMessageCreate(
            role="user",
            content=request.question,
            metadata={
                "user_images": processed_user_images  # Store file paths, not base64
            }
        )
        await chat_service.add_message(request.session_id, user_message)
        
        # No more embedding - just save to chat history
        
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
            user_images=all_base64_images if all_base64_images else None,
            chat_history=history_for_generator
        )
        
        # Add assistant response to chat history (simplified - no citations)
        assistant_message = ChatMessageCreate(
            role="assistant",
            content=result["answer"],
            metadata={}  # Simplified - no citations in chat sessions
        )
        await chat_service.add_message(request.session_id, assistant_message)
        
        # No more embedding - just save to chat history
        
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
    max_tokens: int = 1024,  # Increased default for better responses
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
        
        # Convert uploaded images to base64 data URLs for OpenAI, but save file paths to database
        user_images_base64 = []
        user_images_paths = []
        if images and len(images) > 0:
            for img in images:
                if img is not None:  # Check if img is not None
                    try:
                        content = await img.read()
                        b64 = base64.b64encode(content).decode("ascii")
                        # Infer mime type from filename
                        ext = Path(img.filename).suffix.lower() if img.filename else ".png"
                        mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}
                        mime = mime_map.get(ext, "image/png")
                        data_url = f"data:{mime};base64,{b64}"
                        user_images_base64.append(data_url)
                        
                        # Save as file path for database consistency
                        # Generate a unique filename and save to temp directory
                        import uuid
                        temp_dir = Path("src/temp_chat_images")
                        temp_dir.mkdir(exist_ok=True)
                        unique_filename = f"chat_img_{uuid.uuid4()}{ext}"
                        temp_path = temp_dir / unique_filename
                        
                        # Save the image file
                        with open(temp_path, "wb") as f:
                            f.write(content)
                        
                        # Store relative path for database
                        user_images_paths.append(f"./{temp_path}")
                        print(f"[DEBUG] Uploaded image saved to: {temp_path}")
                        
                    except Exception as e:
                        print(f"[WARNING] Failed to process uploaded image: {e}")
                        continue
        
        # Get recent chat history for context (last 5 messages)
        chat_history = await chat_service.get_recent_messages(session_id, limit=5)
        
        # No more embedding search - just use recent chat history
        
        # Prepare chat history for generator - use recent messages directly
        history_for_generator = []
        
        # Add recent chat history messages
        for msg in chat_history:
            history_for_generator.append({
                "role": msg.role,
                "content": msg.content,
                "metadata": msg.metadata or {}
            })
        
        # Extract images from chat history for comparison
        history_base64_images = []
        for msg in chat_history:
            if msg.metadata and msg.metadata.get("user_images"):
                for img in msg.metadata["user_images"]:
                    if img.startswith("data:image/"):
                        # Already base64
                        history_base64_images.append(img)
                    else:
                        # File path - convert to base64
                        try:
                            # Resolve image path
                            if img.startswith("./paperreader/img_query/"):
                                full_path = Path(img)
                            elif img.startswith("paperreader/img_query/"):
                                full_path = Path(f"./{img}")
                            elif img.startswith("./src/temp_chat_images/"):
                                full_path = Path(img)
                            else:
                                full_path = Path(img)
                            
                            if full_path.exists():
                                # Read and convert to base64
                                with open(full_path, "rb") as f:
                                    img_bytes = f.read()
                                
                                ext = full_path.suffix.lower()
                                mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}
                                mime = mime_map.get(ext, "image/png")
                                
                                b64 = base64.b64encode(img_bytes).decode("ascii")
                                data_url = f"data:{mime};base64,{b64}"
                                history_base64_images.append(data_url)
                                print(f"[DEBUG] History image {img} -> base64")
                            else:
                                print(f"[WARNING] History image file not found: {img}")
                        except Exception as e:
                            print(f"[WARNING] Failed to process history image {img}: {e}")
        
        print(f"[DEBUG] Chat history for generator: {len(history_for_generator)} messages")
        print(f"[DEBUG] Found {len(history_base64_images)} images from chat history")
        
        # Add user question to chat history with file paths in metadata
        user_message = ChatMessageCreate(
            role="user",
            content=question,
            metadata={
                "user_images": user_images_paths if user_images_paths else []
            }
        )
        await chat_service.add_message(session_id, user_message)
        
        # No more embedding - just save to chat history
        
        # Configure and run the QA pipeline
        config = PipelineConfig(
            retriever_name=retriever,
            generator_name=generator,
            image_policy=image_policy,
            top_k=top_k,
            max_tokens=max_tokens,
        )
        
        # Combine current images with history images
        all_base64_images = user_images_base64 + history_base64_images
        
        pipeline = QAPipeline(config)
        result = await pipeline.answer(
            question=question,
            user_images=all_base64_images if all_base64_images else None,
            chat_history=history_for_generator
        )
        
        # Add assistant response to chat history (simplified - no citations)
        assistant_message = ChatMessageCreate(
            role="assistant",
            content=result["answer"],
            metadata={}  # Simplified - no citations in chat sessions
        )
        await chat_service.add_message(session_id, assistant_message)
        
        # No more embedding - just save to chat history
        
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
