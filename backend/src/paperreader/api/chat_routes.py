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
from paperreader.services.qa.pipeline import get_pipeline
# Removed chat_embedding_service import - no longer using embeddings

router = APIRouter()


@router.get("/debug/database-info")
async def get_database_info():
    """Debug endpoint to check MongoDB connection and database info"""
    try:
        from paperreader.database.mongodb import mongodb
        from paperreader.config.settings import settings
        
        # Check if MongoDB is connected (proper way to check motor database objects)
        # Motor database objects cannot be compared with None directly, so we check by accessing name
        try:
            db_name = mongodb.database.name
        except (AttributeError, TypeError):
            return {
                "connected": False,
                "error": "MongoDB not connected",
                "database": None,
                "collections": [],
                "mongodb_url_configured": False
            }
        
        collection_names = await mongodb.database.list_collection_names()
        
        # Count documents in chat_sessions
        chat_collection = mongodb.database["chat_sessions"]
        chat_count = await chat_collection.count_documents({})
        
        # Get sample sessions
        sample_sessions = []
        async for session in chat_collection.find({}).limit(5):
            sample_sessions.append({
                "session_id": session.get("session_id"),
                "title": session.get("title"),
                "message_count": len(session.get("messages", [])),
                "created_at": str(session.get("created_at")),
                "_id": str(session.get("_id"))
            })
        
        # Get MongoDB URL info (partial for security)
        mongodb_url = settings.mongodb_url
        url_info = mongodb_url[:30] + "..." if len(mongodb_url) > 30 else mongodb_url
        
        return {
            "connected": True,
            "database": db_name,
            "collections": collection_names,
            "chat_sessions_count": chat_count,
            "sample_sessions": sample_sessions,
            "mongodb_url_configured": bool(mongodb.client is not None),
            "mongodb_url_preview": url_info,
            "client_type": type(mongodb.client).__name__ if mongodb.client else None
        }
    except Exception as e:
        import traceback
        return {
            "connected": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
            "database": None,
            "collections": []
        }


@router.get("/debug/session/{session_id}")
async def debug_session(session_id: str):
    """Debug endpoint to check if a session exists in MongoDB"""
    try:
        from paperreader.database.mongodb import mongodb
        from paperreader.services.chat.chat_service import chat_service
        
        # Check connection
        try:
            db_name = mongodb.database.name
        except (AttributeError, TypeError):
            return {
                "found": False,
                "error": "MongoDB not connected",
                "database": None
            }
        
        collection = mongodb.database["chat_sessions"]
        
        # Search by session_id (UUID string)
        session_data = await collection.find_one({"session_id": session_id})
        
        if session_data:
            return {
                "found": True,
                "database": db_name,
                "collection": "chat_sessions",
                "session_id": session_data.get("session_id"),
                "mongodb_id": str(session_data.get("_id")),
                "title": session_data.get("title"),
                "user_id": session_data.get("user_id"),
                "message_count": len(session_data.get("messages", [])),
                "created_at": str(session_data.get("created_at")),
                "updated_at": str(session_data.get("updated_at")),
                "messages_preview": [
                    {
                        "role": msg.get("role"),
                        "content_preview": msg.get("content", "")[:100] + "..." if len(msg.get("content", "")) > 100 else msg.get("content", ""),
                        "timestamp": str(msg.get("timestamp"))
                    }
                    for msg in session_data.get("messages", [])[:5]  # First 5 messages
                ]
            }
        else:
            # Also try searching by MongoDB _id in case user passed that
            try:
                from bson import ObjectId
                if len(session_id) == 24:  # ObjectId length
                    session_by_id = await collection.find_one({"_id": ObjectId(session_id)})
                    if session_by_id:
                        return {
                            "found": True,
                            "note": "Found by MongoDB _id (not session_id)",
                            "database": db_name,
                            "collection": "chat_sessions",
                            "session_id": session_by_id.get("session_id"),
                            "mongodb_id": str(session_by_id.get("_id")),
                            "title": session_by_id.get("title"),
                            "message_count": len(session_by_id.get("messages", []))
                        }
            except:
                pass
            
            # List all session_ids to help debug
            all_session_ids = []
            async for doc in collection.find({}).limit(10):
                all_session_ids.append({
                    "session_id": doc.get("session_id"),
                    "mongodb_id": str(doc.get("_id")),
                    "title": doc.get("title")
                })
            
            return {
                "found": False,
                "database": db_name,
                "collection": "chat_sessions",
                "searched_session_id": session_id,
                "total_sessions": await collection.count_documents({}),
                "sample_session_ids": all_session_ids,
                "help": "Use session_id (UUID string), not MongoDB _id (ObjectId)"
            }
    except Exception as e:
        import traceback
        return {
            "found": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }

@router.post("/debug/test-save")
async def test_save_to_mongodb():
    """Test endpoint to manually test saving to MongoDB"""
    try:
        from paperreader.database.mongodb import mongodb
        from paperreader.services.chat.chat_service import chat_service
        from paperreader.models.chat import ChatSessionCreate, ChatMessageCreate
        import uuid
        
        # Check connection
        try:
            db_name = mongodb.database.name
        except (AttributeError, TypeError):
            return {
                "success": False,
                "error": "MongoDB not connected"
            }
        
        # Create a test session
        test_session_id = str(uuid.uuid4())
        test_title = f"TEST_SESSION_{test_session_id[:8]}"
        
        print(f"[TEST] Creating test session: {test_session_id}")
        session_data = ChatSessionCreate(
            session_id=test_session_id,
            user_id="test_user",
            title=test_title,
            initial_message=None
        )
        
        session = await chat_service.create_session(session_data)
        print(f"[TEST] Session created: {session.session_id}")
        
        # Add a test message
        test_message = ChatMessageCreate(
            role="user",
            content="This is a test message",
            metadata={"test": True}
        )
        
        print(f"[TEST] Adding test message to session: {test_session_id}")
        saved = await chat_service.add_message(test_session_id, test_message)
        
        if saved:
            # Verify it was saved
            collection = mongodb.database["chat_sessions"]
            verify = await collection.find_one({"session_id": test_session_id})
            
            if verify:
                msg_count = len(verify.get("messages", []))
                return {
                    "success": True,
                    "database": db_name,
                    "session_id": test_session_id,
                    "message_count": msg_count,
                    "session_found": True,
                    "messages": [
                        {
                            "role": msg.get("role"),
                            "content": msg.get("content")[:50] + "..." if len(msg.get("content", "")) > 50 else msg.get("content")
                        }
                        for msg in verify.get("messages", [])
                    ]
                }
            else:
                return {
                    "success": False,
                    "error": "Session created but not found after save",
                    "database": db_name
                }
        else:
            return {
                "success": False,
                "error": "Failed to save message",
                "database": db_name
            }
            
    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }

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
    confidence: Optional[float] = None

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
    print(f"[DEBUG] Session ID (UUID): {request.session_id}")
    print(f"[DEBUG] Session ID type: {type(request.session_id).__name__}, length: {len(request.session_id)}")
    print(f"[DEBUG] Question: {request.question}")
    print(f"[DEBUG] User images: {request.user_images}")
    print(f"[DEBUG] ==============================")
    try:
        # Get or create session
        session = await chat_service.get_session(request.session_id)
        if not session:
            # Auto-create session if not found
            print(f"[WARNING] Session {request.session_id} not found in database, creating new session...")
            print(f"[WARNING] ⚠️ Make sure you created the session via POST /api/chat/sessions first!")
            session_data = ChatSessionCreate(
                session_id=request.session_id,
                user_id=None,
                title=f"Chat Session {request.session_id[:8]}",
                initial_message=None
            )
            session = await chat_service.create_session(session_data)
            print(f"[LOG] ✅ Auto-created session with session_id: {request.session_id}")
        else:
            print(f"[LOG] ✅ Found existing session: {request.session_id}")
            print(f"[LOG] MongoDB _id: {session.id if hasattr(session, 'id') and session.id else 'N/A'}")
            print(f"[LOG] Session has {len(session.messages) if session.messages else 0} existing messages")
        
        # Get recent chat history for context (last 5 messages)
        chat_history = await chat_service.get_recent_messages(request.session_id, limit=5)
        
        # No more embedding search - just use recent chat history
        
        # Prepare chat history for generator - use recent messages directly
        history_for_generator = []
        
        # Add recent chat history messages (including assistant messages from OpenAI)
        for msg in chat_history:
            history_for_generator.append({
                "role": msg.role,
                "content": msg.content,
                "metadata": msg.metadata or {}
            })
        
        # Debug: Count messages by role to confirm assistant messages are included
        user_count = sum(1 for msg in history_for_generator if msg.get("role") == "user")
        assistant_count = sum(1 for msg in history_for_generator if msg.get("role") == "assistant")
        print(f"[DEBUG] Chat history prepared for generator: {len(history_for_generator)} total messages")
        print(f"[DEBUG]   - User messages: {user_count}")
        print(f"[DEBUG]   - Assistant messages (OpenAI responses): {assistant_count}")
        
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
        print(f"[DEBUG] Saving user message to database for session: {request.session_id}")
        user_message = ChatMessageCreate(
            role="user",
            content=request.question,
            metadata={
                "user_images": processed_user_images  # Store file paths, not base64
            }
        )
        user_saved = await chat_service.add_message(request.session_id, user_message)
        if user_saved:
            print(f"[DEBUG] ✅ User message saved. Session now has {len(user_saved.messages)} messages")
        else:
            print(f"[ERROR] ❌ Failed to save user message")
        
        # No more embedding - just save to chat history
        
        # Configure and get cached QA pipeline (reuses chunks and embeddings)
        config = PipelineConfig(
            retriever_name=request.retriever,
            generator_name=request.generator,
            image_policy=request.image_policy,
            top_k=request.top_k,
            max_tokens=request.max_tokens,
        )
        
        # Use cached pipeline - only rebuilds when PDFs change
        print(f"[DEBUG] Getting pipeline for question: {request.question[:50]}...")
        pipeline = await get_pipeline(config)
        print(f"[DEBUG] Pipeline retrieved, calling answer()")
        
        result = await pipeline.answer(
            question=request.question,
            user_images=all_base64_images if all_base64_images else None,
            chat_history=history_for_generator
        )
        
        print(f"[DEBUG] Pipeline answer completed. Result keys: {list(result.keys())}")
        print(f"[DEBUG] Answer length: {len(result.get('answer', ''))}, Citations: {len(result.get('cited_sections', []))}")
        
        # Calculate confidence from retriever scores if not provided by generator
        confidence = result.get("confidence")
        if confidence is None:
            scores = result.get("retriever_scores", [])
            if scores:
                avg_score = sum(s.get("score", 0) for s in scores) / len(scores)
                # Normalize to 0-1 range (assuming scores are typically 0-1 or 0-100)
                if avg_score > 1:
                    confidence = min(0.95, max(0.3, avg_score / 100))
                else:
                    confidence = min(0.95, max(0.3, avg_score))
            else:
                confidence = 0.5  # Default confidence if no scores
        
        # Extract citation numbers that are actually used in the answer text
        import re
        answer_text = result.get("answer", "")
        citation_pattern = re.compile(r"\[c(\d+)\]")
        used_citation_numbers = []
        for match in citation_pattern.finditer(answer_text):
            citation_num = int(match.group(1))
            if citation_num not in used_citation_numbers:
                used_citation_numbers.append(citation_num)
        
        print(f"[DEBUG] Citations used in answer: {used_citation_numbers}")
        print(f"[DEBUG] Total citations from pipeline: {len(result.get('cited_sections', []))}")
        print(f"[DEBUG] Pipeline citations (hit indices): {result.get('citations', [])}")
        
        # Get data from pipeline
        pipeline_citations = result.get("citations", [])  # Hit indices (0-indexed) in order of appearance (only valid ones)
        cited_sections = result.get("cited_sections", [])  # Citations ordered by appearance (only valid ones)
        
        # Build mapping from hit_index to citation info
        # pipeline_citations now contains only valid hit indices (unique_ordered_indices)
        # in the same order as cited_sections, so pipeline_citations[i] corresponds to cited_sections[i]
        hit_index_to_citation = {}
        for i, hit_idx in enumerate(pipeline_citations):
            if i < len(cited_sections):
                hit_index_to_citation[hit_idx] = cited_sections[i]
        
        used_citations = []
        old_to_new_map = {}  # Map old citation number to new sequential number
        
        # Build mapping: citation number in answer -> hit index -> citation info
        for new_num, original_citation_num in enumerate(used_citation_numbers, start=1):
            # Convert citation number to hit index: [c1] -> 0, [c2] -> 1, etc.
            hit_index = original_citation_num - 1
            
            # Find citation by hit_index in our mapping
            cit = hit_index_to_citation.get(hit_index)
            if not cit and hit_index in pipeline_citations:
                # Fallback: try to find by position in pipeline_citations (should not be needed)
                position_in_pipeline = pipeline_citations.index(hit_index)
                if position_in_pipeline < len(cited_sections):
                    cit = cited_sections[position_in_pipeline]
            
            if cit:
                excerpt = cit.get("excerpt", "")
                # Extract summary from excerpt: first 600 chars + "..." + last 100 chars
                # This gives context from both beginning and end of the excerpt
                if len(excerpt) > 700:  # 600 + 100 + space for "..."
                    summary_text = excerpt[:600] + "..." + excerpt[-100:]
                else:
                    # If excerpt is short enough, use the full text
                    summary_text = excerpt
                used_citations.append({
                    "citation_number": new_num,  # Renumber sequentially
                    "citation_label": f"c{new_num}",
                    "summary": summary_text,
                    "doc_id": cit.get("doc_id"),
                    "title": cit.get("title"),
                    "page": cit.get("page"),
                    "excerpt": excerpt
                })
                old_to_new_map[original_citation_num] = new_num
            else:
                print(f"[WARNING] Citation c{original_citation_num} (hit index {hit_index}) not found in valid citations. This citation will be skipped but marker remains in answer.")
        
        # Update answer text to use new sequential citation numbers
        updated_answer = answer_text
        for old_num, new_num in sorted(old_to_new_map.items(), key=lambda x: x[0], reverse=True):
            # Replace from largest to smallest to avoid conflicts (e.g., [c10] before [c1])
            updated_answer = updated_answer.replace(f"[c{old_num}]", f"[c{new_num}]")
        
        formatted_citations = used_citations
        print(f"[DEBUG] Filtered citations: {len(formatted_citations)} (only those actually used in answer)")
        if len(formatted_citations) < len(used_citation_numbers):
            missing = set(used_citation_numbers) - set(old_to_new_map.keys())
            print(f"[WARNING] {len(missing)} citation(s) missing references: {missing}")
        
        # Add assistant response to chat history with citations and confidence
        print(f"[DEBUG] Preparing assistant message with {len(formatted_citations)} citations, confidence: {confidence}")
        assistant_message = ChatMessageCreate(
            role="assistant",
            content=updated_answer,
            metadata={
                "cited_sections": formatted_citations,
                "confidence": confidence,
                "retriever_scores": result.get("retriever_scores", [])
            }
        )
        print(f"[DEBUG] Calling chat_service.add_message() for session: {request.session_id}")
        saved_session = await chat_service.add_message(request.session_id, assistant_message)
        
        if saved_session:
            msg_count = len(saved_session.messages) if saved_session.messages else 0
            print(f"[DEBUG] ✅ Message saved successfully! Session now has {msg_count} messages")
        else:
            print(f"[ERROR] ❌ Failed to save assistant message - saved_session is None")
        
        # No more embedding - just save to chat history
        
        # Generate message ID for the response
        message_id = str(uuid.uuid4())
        
        return ChatAskResponse(
            session_id=request.session_id,
            question=request.question,
            answer=updated_answer,  # Use updated answer with renumbered citations
            cited_sections=formatted_citations,  # Formatted citations
            retriever_scores=result.get("retriever_scores", []),
            message_id=message_id,
            timestamp=datetime.utcnow(),
            confidence=confidence
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
        
        # Add recent chat history messages (including assistant messages from OpenAI)
        for msg in chat_history:
            history_for_generator.append({
                "role": msg.role,
                "content": msg.content,
                "metadata": msg.metadata or {}
            })
        
        # Debug: Count messages by role to confirm assistant messages are included
        user_count = sum(1 for msg in history_for_generator if msg.get("role") == "user")
        assistant_count = sum(1 for msg in history_for_generator if msg.get("role") == "assistant")
        print(f"[DEBUG] Chat history prepared for generator: {len(history_for_generator)} total messages")
        print(f"[DEBUG]   - User messages: {user_count}")
        print(f"[DEBUG]   - Assistant messages (OpenAI responses): {assistant_count}")
        
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
        
        # Configure and get cached QA pipeline (reuses chunks and embeddings)
        config = PipelineConfig(
            retriever_name=retriever,
            generator_name=generator,
            image_policy=image_policy,
            top_k=top_k,
            max_tokens=max_tokens,
        )
        
        # Combine current images with history images
        all_base64_images = user_images_base64 + history_base64_images
        
        # Use cached pipeline - only rebuilds when PDFs change
        pipeline = await get_pipeline(config)
        result = await pipeline.answer(
            question=question,
            user_images=all_base64_images if all_base64_images else None,
            chat_history=history_for_generator
        )
        
        # Calculate confidence from retriever scores if not provided by generator
        confidence = result.get("confidence")
        if confidence is None:
            scores = result.get("retriever_scores", [])
            if scores:
                avg_score = sum(s.get("score", 0) for s in scores) / len(scores)
                # Normalize to 0-1 range (assuming scores are typically 0-1 or 0-100)
                if avg_score > 1:
                    confidence = min(0.95, max(0.3, avg_score / 100))
                else:
                    confidence = min(0.95, max(0.3, avg_score))
            else:
                confidence = 0.5  # Default confidence if no scores
        
        # Extract citation numbers that are actually used in the answer text
        import re
        answer_text = result.get("answer", "")
        citation_pattern = re.compile(r"\[c(\d+)\]")
        used_citation_numbers = []
        for match in citation_pattern.finditer(answer_text):
            citation_num = int(match.group(1))
            if citation_num not in used_citation_numbers:
                used_citation_numbers.append(citation_num)
        
        print(f"[DEBUG] Citations used in answer: {used_citation_numbers}")
        print(f"[DEBUG] Total citations from pipeline: {len(result.get('cited_sections', []))}")
        print(f"[DEBUG] Pipeline citations (hit indices): {result.get('citations', [])}")
        
        # Get data from pipeline
        pipeline_citations = result.get("citations", [])  # Hit indices (0-indexed) in order of appearance (only valid ones)
        cited_sections = result.get("cited_sections", [])  # Citations ordered by appearance (only valid ones)
        
        # Build mapping from hit_index to citation info
        # pipeline_citations now contains only valid hit indices (unique_ordered_indices)
        # in the same order as cited_sections, so pipeline_citations[i] corresponds to cited_sections[i]
        hit_index_to_citation = {}
        for i, hit_idx in enumerate(pipeline_citations):
            if i < len(cited_sections):
                hit_index_to_citation[hit_idx] = cited_sections[i]
        
        used_citations = []
        old_to_new_map = {}  # Map old citation number to new sequential number
        
        # Build mapping: citation number in answer -> hit index -> citation info
        for new_num, original_citation_num in enumerate(used_citation_numbers, start=1):
            # Convert citation number to hit index: [c1] -> 0, [c2] -> 1, etc.
            hit_index = original_citation_num - 1
            
            # Find citation by hit_index in our mapping
            cit = hit_index_to_citation.get(hit_index)
            if not cit and hit_index in pipeline_citations:
                # Fallback: try to find by position in pipeline_citations (should not be needed)
                position_in_pipeline = pipeline_citations.index(hit_index)
                if position_in_pipeline < len(cited_sections):
                    cit = cited_sections[position_in_pipeline]
            
            if cit:
                excerpt = cit.get("excerpt", "")
                # Extract summary from excerpt: first 600 chars + "..." + last 100 chars
                # This gives context from both beginning and end of the excerpt
                if len(excerpt) > 700:  # 600 + 100 + space for "..."
                    summary_text = excerpt[:600] + "..." + excerpt[-100:]
                else:
                    # If excerpt is short enough, use the full text
                    summary_text = excerpt
                used_citations.append({
                    "citation_number": new_num,  # Renumber sequentially
                    "citation_label": f"c{new_num}",
                    "summary": summary_text,
                    "doc_id": cit.get("doc_id"),
                    "title": cit.get("title"),
                    "page": cit.get("page"),
                    "excerpt": excerpt
                })
                old_to_new_map[original_citation_num] = new_num
            else:
                print(f"[WARNING] Citation c{original_citation_num} (hit index {hit_index}) not found in valid citations. This citation will be skipped but marker remains in answer.")
        
        # Update answer text to use new sequential citation numbers
        updated_answer = answer_text
        for old_num, new_num in sorted(old_to_new_map.items(), key=lambda x: x[0], reverse=True):
            # Replace from largest to smallest to avoid conflicts (e.g., [c10] before [c1])
            updated_answer = updated_answer.replace(f"[c{old_num}]", f"[c{new_num}]")
        
        formatted_citations = used_citations
        print(f"[DEBUG] Filtered citations: {len(formatted_citations)} (only those actually used in answer)")
        if len(formatted_citations) < len(used_citation_numbers):
            missing = set(used_citation_numbers) - set(old_to_new_map.keys())
            print(f"[WARNING] {len(missing)} citation(s) missing references: {missing}")
        
        # Add assistant response to chat history with citations and confidence
        assistant_message = ChatMessageCreate(
            role="assistant",
            content=updated_answer,
            metadata={
                "cited_sections": formatted_citations,
                "confidence": confidence,
                "retriever_scores": result.get("retriever_scores", [])
            }
        )
        await chat_service.add_message(session_id, assistant_message)
        
        # No more embedding - just save to chat history
        
        # Generate message ID for the response
        message_id = str(uuid.uuid4())
        
        return ChatAskResponse(
            session_id=session_id,
            question=question,
            answer=updated_answer,  # Use updated answer with renumbered citations
            cited_sections=formatted_citations,  # Formatted citations
            retriever_scores=result.get("retriever_scores", []),
            message_id=message_id,
            timestamp=datetime.utcnow(),
            confidence=confidence
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
