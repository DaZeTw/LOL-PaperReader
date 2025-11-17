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
    force_new: Optional[bool] = False  # If True, always create new session even if one with same title exists

class ChatSessionListResponse(BaseModel):
    sessions: List[ChatSessionResponse]

@router.post("/sessions", response_model=ChatSessionResponse)
async def create_chat_session(request: ChatSessionCreateRequest):
    """Create a new chat session, or return existing one if found"""
    try:
        # First, check if there's an existing session with the same title and user_id
        # This prevents creating duplicate sessions for the same PDF
        # BUT: If force_new=True, skip this check and always create new session
        if request.title and not request.force_new:
            existing_session = await chat_service.find_session_by_title(
                title=request.title,
                user_id=request.user_id
            )
            
            if existing_session:
                # Return existing session instead of creating new one
                print(f"[LOG] Found existing session for title '{request.title}': {existing_session.session_id}")
                return ChatSessionResponse(
                    session_id=existing_session.session_id,
                    title=existing_session.title,
                    messages=existing_session.messages,
                    created_at=existing_session.created_at,
                    updated_at=existing_session.updated_at,
                    message_count=len(existing_session.messages)
                )
        elif request.force_new:
            print(f"[LOG] force_new=True, skipping existing session check and creating new session for title '{request.title}'")
        
        # No existing session found, create new one
        session_id = str(uuid.uuid4())
        
        session_data = ChatSessionCreate(
            session_id=session_id,
            user_id=request.user_id,
            title=request.title,
            initial_message=request.initial_message
        )
        
        import asyncio
        session = await asyncio.wait_for(
            chat_service.create_session(session_data),
            timeout=10.0  # 10 second timeout for session creation
        )
        
        print(f"[LOG] Created new session: {session.session_id} for title '{request.title}'")
        
        return ChatSessionResponse(
            session_id=session.session_id,
            title=session.title,
            messages=session.messages,
            created_at=session.created_at,
            updated_at=session.updated_at,
            message_count=len(session.messages)
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Connection timeout: Session creation took too long.")
    except Exception as e:
        error_msg = str(e)
        if "timeout" in error_msg.lower() or "connection" in error_msg.lower():
            raise HTTPException(status_code=503, detail=f"Backend connection issue: {error_msg}")
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
            print(f"[LOG] Session has {len(session.messages) if session.messages else 0} existing messages")
        
        # Get recent chat history for context (last 10 messages for better context)
        # CRITICAL: Verify we're using the correct session_id
        print(f"[DEBUG] ===== RETRIEVING CHAT HISTORY =====")
        print(f"[DEBUG] Request session_id: {request.session_id}")
        print(f"[DEBUG] Session from DB has {len(session.messages) if session.messages else 0} messages")
        print(f"[DEBUG] Session ID from DB: {session.session_id if hasattr(session, 'session_id') else 'N/A'}")
        
        # Verify session_id matches
        if hasattr(session, 'session_id') and session.session_id != request.session_id:
            print(f"[ERROR] ❌ SESSION ID MISMATCH!")
            print(f"[ERROR] Request session_id: {request.session_id}")
            print(f"[ERROR] DB session_id: {session.session_id}")
            raise HTTPException(status_code=500, detail="Session ID mismatch detected")
        
        chat_history = await chat_service.get_recent_messages(request.session_id, limit=10)
        
        # Debug: Print chat history retrieved
        print(f"[DEBUG] ===== CHAT HISTORY RETRIEVED =====")
        print(f"[DEBUG] Retrieved {len(chat_history)} messages from database for session_id: {request.session_id}")
        for i, msg in enumerate(chat_history):
            content_preview = msg.content[:100] + "..." if len(msg.content) > 100 else msg.content
            print(f"[DEBUG] Message {i+1}: {msg.role} - {content_preview}")
        print(f"[DEBUG] ================================")
        
        # No more embedding search - just use recent chat history
        
        # Prepare chat history for generator - add system prompt first, then user/assistant messages
        history_for_generator = []
        
        # Add system prompt (not saved in DB, added dynamically here)
        # STRONGER PROMPT for chat history usage
        system_prompt = (
            "You are a helpful assistant that answers questions using chat history, images, and document context."
            "\n\nCRITICAL: You MUST use the chat history provided below to answer questions about previous conversations."
            "\nWhen the user asks questions about previous messages or conversation history, you MUST review the chat history "
            "and provide a clear summary of ALL previous questions and answers."
            "\n\nPRIORITY ORDER:"
            "\n1. CHAT HISTORY FIRST: For ANY question about previous messages or conversation history, you MUST check and summarize the chat history provided below. "
            "List all previous user questions and your corresponding answers clearly. DO NOT include the current question in your summary."
            "\n2. Analyze user-uploaded images directly for image questions."
            "\n3. Use provided document context only to support explanations."
            "\n\nRULES:"
            "\n- For simple greetings or casual conversation (e.g., 'hi', 'hello', 'thanks'), respond briefly and naturally WITHOUT using document context. Keep it short and friendly."
            "\n- For questions that don't require document knowledge (greetings, casual chat, general questions), answer directly without referencing document contexts."
            "\n- ONLY use document contexts when the question is about the document content, research topics, or requires specific information from the document."
            "\n- NEVER ignore chat history when asked about previous messages or conversation history. The chat history below contains ALL previous messages."
            "\n- When summarizing previous messages, be specific: mention what was asked and what was answered."
            "\n- CRITICAL: When asked about previous messages or conversation history, summarize ONLY the messages that came BEFORE the current question. Do NOT include the current question in your summary."
            "\n- If you reference citations [cN] from previous answers, use those exact citation numbers as they appeared in the previous answer."
            "\n- Never quote raw document text when answering."
            "\n- Focus on what is visible in images for image-related queries."
            "\n- Be concise and factual. Add [cN] markers ONLY when referencing document context."
            "\n- At the end of your answer, provide a confidence score (0.0-1.0) based on how well the provided document context supports your answer. Format: [CONFIDENCE:0.85]"
        )
        history_for_generator.append({
            "role": "system",
            "content": system_prompt,
            "metadata": {}
        })
        
        # Add recent chat history messages (only user and assistant - no system messages from DB)
        # CRITICAL: Only add if chat_history has actual messages (not just empty)
        # CRITICAL: Filter out current question from history to avoid confusion (shouldn't be there, but double-check for race conditions)
        current_question = request.question.strip()
        if chat_history and len(chat_history) > 0:
            print(f"[DEBUG] Adding {len(chat_history)} messages from chat history to generator")
            filtered_count = 0
            for msg in chat_history:
                # Skip system messages (shouldn't be in DB, but double-check)
                if msg.role == "system":
                    print(f"[DEBUG] ⚠️ WARNING: System message found in DB chat_history, skipping")
                    continue
                # CRITICAL: Exclude current question from history to prevent model confusion
                # If somehow current question is already in history (race condition), skip it
                if msg.role == "user" and msg.content.strip() == current_question:
                    print(f"[DEBUG] ⚠️ WARNING: Current question found in chat_history, excluding it (this shouldn't happen normally)")
                    filtered_count += 1
                    continue
                history_for_generator.append({
                    "role": msg.role,
                    "content": msg.content,
                    "metadata": msg.metadata or {}
                })
            if filtered_count > 0:
                print(f"[DEBUG] ⚠️ Filtered out {filtered_count} message(s) that matched current question")
            print(f"[DEBUG] ✅ Added messages to history_for_generator. Total now: {len(history_for_generator)}")
        else:
            print(f"[DEBUG] ⚠️ No chat history messages to add (empty or None). Only system prompt will be used.")
        
        # Debug: Count messages by role to confirm assistant messages are included
        user_count = sum(1 for msg in history_for_generator if msg.get("role") == "user")
        assistant_count = sum(1 for msg in history_for_generator if msg.get("role") == "assistant")
        system_count = sum(1 for msg in history_for_generator if msg.get("role") == "system")
        print(f"[DEBUG] ===== CHAT HISTORY PREPARED FOR GENERATOR =====")
        print(f"[DEBUG] Total messages: {len(history_for_generator)}")
        print(f"[DEBUG]   - System messages: {system_count}")
        print(f"[DEBUG]   - User messages: {user_count}")
        print(f"[DEBUG]   - Assistant messages (OpenAI responses): {assistant_count}")
        if user_count > 0 or assistant_count > 0:
            print(f"[DEBUG] ✅ Chat history will be passed to OpenAI")
            # Show preview of first few messages
            for i, msg in enumerate(history_for_generator[:5]):
                role = msg.get("role")
                content_preview = msg.get("content", "")[:80] + "..." if len(msg.get("content", "")) > 80 else msg.get("content", "")
                print(f"[DEBUG]   [{i+1}] {role}: {content_preview}")
        else:
            print(f"[DEBUG] ⚠️ WARNING: No user/assistant messages in history - this is a new conversation")
        print(f"[DEBUG] ===============================================")
        
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
        
        # Get session to extract PDF name from title
        session = await chat_service.get_session(request.session_id)
        pdf_name = None
        if session and session.title:
            # Extract PDF name from title format "Chat: {pdfFile.name}" or "Chat: {pdfFile.name} - {timestamp} - {randomId}"
            if session.title.startswith("Chat: "):
                # Remove "Chat: " prefix
                title_without_prefix = session.title.replace("Chat: ", "").strip()
                # Extract PDF name (everything before first " - " separator, if present)
                # Format can be: "filename.pdf" or "filename.pdf - timestamp - randomId"
                if " - " in title_without_prefix:
                    pdf_name = title_without_prefix.split(" - ")[0].strip()
                else:
                    pdf_name = title_without_prefix.strip()
                # Remove file extension if present (but keep the name for matching)
                if pdf_name.endswith(".pdf"):
                    pdf_name = pdf_name[:-4]
                # Normalize: remove any whitespace and ensure consistent format
                pdf_name = pdf_name.strip()
                print(f"[DEBUG] Extracted PDF name from session title: '{pdf_name}' (original: '{session.title}')")
                print(f"[DEBUG] PDF name will be used to filter chunks by doc_id matching '{pdf_name}' or '{pdf_name}-embedded'")
        
        # Configure and get cached QA pipeline (reuses chunks and embeddings)
        config = PipelineConfig(
            retriever_name=request.retriever,
            generator_name=request.generator,
            image_policy=request.image_policy,
            top_k=request.top_k,
            max_tokens=request.max_tokens,
        )
        
        # Use cached pipeline - only rebuilds when PDFs change
        # Pass pdf_name to get PDF-specific pipeline
        print(f"[DEBUG] Getting pipeline for question: {request.question[:50]}... (PDF: {pdf_name or 'default'})")
        pipeline = await get_pipeline(config, pdf_name=pdf_name)
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
        
        # Collect ALL citation markers (including duplicates) to preserve order
        all_citation_markers = []
        for match in citation_pattern.finditer(answer_text):
            citation_num = int(match.group(1))
            all_citation_markers.append(citation_num)
        
        # Get unique citation numbers in order of first appearance
        seen = set()
        used_citation_numbers = []
        for citation_num in all_citation_markers:
            if citation_num not in seen:
                seen.add(citation_num)
                used_citation_numbers.append(citation_num)
        
        print(f"[DEBUG] Citations used in answer (total markers: {len(all_citation_markers)}, unique: {len(used_citation_numbers)}): {used_citation_numbers}")
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
        hit_index_to_new_num = {}  # Map hit_index to new citation number (for deduplication)
        
        # CRITICAL: Check if answer is about previous questions - if so, citations might be from previous messages
        # Collect citations from previous assistant messages to use as fallback
        previous_citations_map = {}  # Map old citation numbers from previous messages
        is_about_previous_questions = any(keyword in answer_text.lower() for keyword in [
            "previous questions", "previous answers", "what did i ask", "what were", "earlier"
        ])
        
        if is_about_previous_questions:
            print(f"[DEBUG] ⚠️ Answer appears to be about previous questions - checking previous messages for citations")
            # Get previous assistant messages that have citations
            for msg in chat_history:
                if msg.role == "assistant" and msg.metadata and msg.metadata.get("cited_sections"):
                    prev_cited = msg.metadata.get("cited_sections", [])
                    print(f"[DEBUG] Found previous message with {len(prev_cited)} citations")
                    # Map previous citations by their citation_number
                    for prev_cit in prev_cited:
                        cit_num = prev_cit.get("citation_number") or prev_cit.get("citation_label", "").replace("c", "")
                        if cit_num:
                            try:
                                cit_num_int = int(cit_num) if isinstance(cit_num, str) and cit_num.isdigit() else cit_num
                                previous_citations_map[cit_num_int] = prev_cit
                                print(f"[DEBUG] Mapped previous citation c{cit_num_int}")
                            except:
                                pass
        
        # Build mapping: citation number in answer -> hit index -> citation info
        for original_citation_num in used_citation_numbers:
            # Convert citation number to hit index: [c1] -> 0, [c2] -> 1, etc.
            hit_index = original_citation_num - 1
            
            # Check if we've already mapped this hit_index to a citation
            if hit_index in hit_index_to_new_num:
                # This hit_index was already mapped - reuse the same citation number
                new_num = hit_index_to_new_num[hit_index]
                old_to_new_map[original_citation_num] = new_num
                print(f"[DEBUG] Citation c{original_citation_num} (hit index {hit_index}) already mapped to c{new_num}, reusing")
                continue
            
            # Find citation by hit_index in our mapping (from current retrieval)
            cit = hit_index_to_citation.get(hit_index)
            if not cit and hit_index in pipeline_citations:
                # Fallback: try to find by position in pipeline_citations (should not be needed)
                position_in_pipeline = pipeline_citations.index(hit_index)
                if position_in_pipeline < len(cited_sections):
                    cit = cited_sections[position_in_pipeline]
            
            # CRITICAL: If citation not found in current retrieval AND answer is about previous questions,
            # try to get citation from previous messages
            is_from_previous = False
            if not cit and is_about_previous_questions and original_citation_num in previous_citations_map:
                cit = previous_citations_map[original_citation_num]
                is_from_previous = True
                print(f"[DEBUG] ✅ Found citation c{original_citation_num} from previous message (answer about previous questions)")
                # When using citation from previous message, preserve original citation number if possible
                # or assign new sequential number
                new_num = len(used_citations) + 1
                old_to_new_map[original_citation_num] = new_num
                # Don't map hit_index for previous citations since they don't have hit_index
                print(f"[DEBUG] Mapping previous citation c{original_citation_num} -> c{new_num}")
            elif cit:
                # Citation found in current retrieval - normal flow
                # Assign new sequential number
                new_num = len(used_citations) + 1
                hit_index_to_new_num[hit_index] = new_num
                old_to_new_map[original_citation_num] = new_num
            
            if cit:
                # When citation is from previous message, use excerpt or summary if excerpt is truncated
                if is_from_previous:
                    # Previous citations may have summary (truncated) and excerpt (full)
                    # Prefer excerpt if available and not empty, otherwise use summary
                    excerpt = cit.get("excerpt", "")
                    if not excerpt or len(excerpt.strip()) == 0:
                        # Fallback to summary from previous message
                        excerpt = cit.get("summary", "") or cit.get("text", "") or cit.get("content", "") or ""
                        print(f"[DEBUG] Citation from previous message - using summary (excerpt was empty)")
                    else:
                        print(f"[DEBUG] Citation from previous message - using full excerpt")
                else:
                    # Citation from current retrieval - normal flow
                    excerpt = cit.get("excerpt", "")
                    # Ensure excerpt is not empty and preserve full context
                    if not excerpt or len(excerpt.strip()) == 0:
                        # Try to get from other fields if excerpt is missing
                        excerpt = cit.get("text", "") or cit.get("content", "") or ""
                
                # CRITICAL: Log excerpt to debug missing characters
                if excerpt:
                    print(f"[DEBUG] Citation c{new_num} excerpt preview: '{excerpt[:100]}...'")
                    print(f"[DEBUG] Citation c{new_num} excerpt length: {len(excerpt)}")
                    if len(excerpt) > 0:
                        print(f"[DEBUG] Citation c{new_num} excerpt first 50 chars: '{excerpt[:50]}'")
                
                # For summary: if citation is from previous message and already has a summary, use it
                # Otherwise, create summary from excerpt
                if is_from_previous and cit.get("summary"):
                    # Use existing summary from previous message (already formatted)
                    summary_text = cit.get("summary")
                    print(f"[DEBUG] Citation c{new_num} from previous - using existing summary")
                elif len(excerpt) > 950:  # 800 + 150 + space for "..."
                    # Preserve more at the beginning to avoid losing important context
                    # Try to start from a word boundary (space or punctuation)
                    first_part = excerpt[:800]
                    # If the 800-char mark is in the middle of a word, try to extend to word boundary
                    if len(excerpt) > 800 and excerpt[800] not in ' \n\t.,;:!?':
                        # Find last space before position 850 (max 50 chars back)
                        last_space = first_part.rfind(' ', max(0, 750))
                        if last_space > 0:
                            first_part = excerpt[:last_space + 1]
                    
                    last_part = excerpt[-150:]
                    # If the -150 mark is in the middle of a word, try to extend back
                    if len(excerpt) > 150 and excerpt[-151] not in ' \n\t.,;:!?':
                        # Find first space after position -200 (max 50 chars forward)
                        first_space = last_part.find(' ', 50)
                        if first_space > 0:
                            last_part = excerpt[-(150 + first_space):]
                    
                    summary_text = first_part + "..." + last_part
                    print(f"[DEBUG] Citation c{new_num} summary first 50 chars: '{summary_text[:50]}'")
                elif len(excerpt) > 500:
                    # For medium excerpts, preserve more at start
                    first_part = excerpt[:400]
                    # Try word boundary
                    if len(excerpt) > 400 and excerpt[400] not in ' \n\t.,;:!?':
                        last_space = first_part.rfind(' ', max(0, 350))
                        if last_space > 0:
                            first_part = excerpt[:last_space + 1]
                    
                    last_part = excerpt[-100:]
                    if len(excerpt) > 100 and excerpt[-101] not in ' \n\t.,;:!?':
                        first_space = last_part.find(' ', 30)
                        if first_space > 0:
                            last_part = excerpt[-(100 + first_space):]
                    
                    summary_text = first_part + "..." + last_part
                    print(f"[DEBUG] Citation c{new_num} summary first 50 chars: '{summary_text[:50]}'")
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
                    "excerpt": excerpt  # Keep full excerpt for reference
                })
            else:
                print(f"[WARNING] Citation c{original_citation_num} (hit index {hit_index}) not found in valid citations. This citation will be skipped but marker remains in answer.")
        
        # Update answer text to use new sequential citation numbers
        # Replace ALL instances (including duplicates) with the new number
        updated_answer = answer_text
        for old_num, new_num in sorted(old_to_new_map.items(), key=lambda x: x[0], reverse=True):
            # Replace from largest to smallest to avoid conflicts (e.g., [c10] before [c1])
            # Use regex to match the full pattern exactly
            updated_answer = re.sub(rf"\[c{old_num}\]", f"[c{new_num}]", updated_answer)
        
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
            
            # Message saved successfully (in-memory storage)
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
        
        # Get recent chat history for context (last 10 messages for better context)
        chat_history = await chat_service.get_recent_messages(session_id, limit=10)
        
        # Debug: Print chat history retrieved
        print(f"[DEBUG] ===== CHAT HISTORY RETRIEVED (ask-with-upload) =====")
        print(f"[DEBUG] Retrieved {len(chat_history)} messages from database")
        for i, msg in enumerate(chat_history):
            content_preview = msg.content[:100] + "..." if len(msg.content) > 100 else msg.content
            print(f"[DEBUG] Message {i+1}: {msg.role} - {content_preview}")
        print(f"[DEBUG] ================================")
        
        # No more embedding search - just use recent chat history
        
        # Prepare chat history for generator - add system prompt first, then user/assistant messages
        history_for_generator = []
        
        # Add system prompt (not saved in DB, added dynamically here)
        # STRONGER PROMPT for chat history usage (same as /ask endpoint)
        system_prompt = (
            "You are a helpful assistant that answers questions using chat history, images, and document context."
            "\n\nCRITICAL: You MUST use the chat history provided below to answer questions about previous conversations."
            "\nWhen the user asks 'What did I ask before?', 'What were my previous questions?', 'What did we discuss?', "
            "or similar questions, you MUST review the chat history and provide a clear summary of ALL previous questions and answers."
            "\n\nPRIORITY ORDER:"
            "\n1. CHAT HISTORY FIRST: For ANY question about previous messages, you MUST check and summarize the chat history provided below. "
            "List all previous user questions and your corresponding answers clearly."
            "\n2. Analyze user-uploaded images directly for image questions."
            "\n3. Use provided document context only to support explanations."
            "\n\nRULES:"
            "\n- For simple greetings or casual conversation (e.g., 'hi', 'hello', 'thanks'), respond briefly and naturally WITHOUT using document context. Keep it short and friendly."
            "\n- For questions that don't require document knowledge (greetings, casual chat, general questions), answer directly without referencing document contexts."
            "\n- ONLY use document contexts when the question is about the document content, research topics, or requires specific information from the document."
            "\n- NEVER ignore chat history when asked about previous questions. The chat history below contains ALL previous messages."
            "\n- When summarizing previous questions, be specific: mention what was asked and what was answered."
            "\n- Never quote raw document text when answering."
            "\n- Focus on what is visible in images for image-related queries."
            "\n- Be concise and factual. Add [cN] markers ONLY when referencing document context."
            "\n- At the end of your answer, provide a confidence score (0.0-1.0) based on how well the provided document context supports your answer. Format: [CONFIDENCE:0.85]"
        )
        history_for_generator.append({
            "role": "system",
            "content": system_prompt,
            "metadata": {}
        })
        
        # Add recent chat history messages (only user and assistant - no system messages from DB)
        for msg in chat_history:
            history_for_generator.append({
                "role": msg.role,
                "content": msg.content,
                "metadata": msg.metadata or {}
            })
        
        # Debug: Count messages by role to confirm assistant messages are included
        user_count = sum(1 for msg in history_for_generator if msg.get("role") == "user")
        assistant_count = sum(1 for msg in history_for_generator if msg.get("role") == "assistant")
        system_count = sum(1 for msg in history_for_generator if msg.get("role") == "system")
        print(f"[DEBUG] ===== CHAT HISTORY PREPARED FOR GENERATOR (ask-with-upload) =====")
        print(f"[DEBUG] Total messages: {len(history_for_generator)}")
        print(f"[DEBUG]   - System messages: {system_count}")
        print(f"[DEBUG]   - User messages: {user_count}")
        print(f"[DEBUG]   - Assistant messages (OpenAI responses): {assistant_count}")
        if user_count > 0 or assistant_count > 0:
            print(f"[DEBUG] ✅ Chat history will be passed to OpenAI")
            # Show preview of first few messages
            for i, msg in enumerate(history_for_generator[:5]):
                role = msg.get("role")
                content_preview = msg.get("content", "")[:80] + "..." if len(msg.get("content", "")) > 80 else msg.get("content", "")
                print(f"[DEBUG]   [{i+1}] {role}: {content_preview}")
        else:
            print(f"[DEBUG] ⚠️ WARNING: No user/assistant messages in history - this is a new conversation")
        print(f"[DEBUG] ===============================================")
        
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
        
        # Get session to extract PDF name from title
        session = await chat_service.get_session(session_id)
        pdf_name = None
        if session and session.title:
            # Extract PDF name from title format "Chat: {pdfFile.name}" or "Chat: {pdfFile.name} - {timestamp} - {randomId}"
            if session.title.startswith("Chat: "):
                # Remove "Chat: " prefix
                title_without_prefix = session.title.replace("Chat: ", "").strip()
                # Extract PDF name (everything before first " - " separator, if present)
                # Format can be: "filename.pdf" or "filename.pdf - timestamp - randomId"
                if " - " in title_without_prefix:
                    pdf_name = title_without_prefix.split(" - ")[0].strip()
                else:
                    pdf_name = title_without_prefix.strip()
                # Remove file extension if present (but keep the name for matching)
                if pdf_name.endswith(".pdf"):
                    pdf_name = pdf_name[:-4]
                # Normalize: remove any whitespace and ensure consistent format
                pdf_name = pdf_name.strip()
                print(f"[DEBUG] Extracted PDF name from session title: '{pdf_name}' (original: '{session.title}')")
                print(f"[DEBUG] PDF name will be used to filter chunks by doc_id matching '{pdf_name}' or '{pdf_name}-embedded'")
        
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
        # Pass pdf_name to get PDF-specific pipeline
        print(f"[DEBUG] Getting pipeline for question: {question[:50]}... (PDF: {pdf_name or 'default'})")
        pipeline = await get_pipeline(config, pdf_name=pdf_name)
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
                # Ensure excerpt is not empty and preserve full context
                if not excerpt or len(excerpt.strip()) == 0:
                    # Try to get from other fields if excerpt is missing
                    excerpt = cit.get("text", "") or cit.get("content", "") or ""
                
                # For summary, preserve more context at the beginning (where most info is)
                # Use first 800 chars + "..." + last 150 chars for better context
                if len(excerpt) > 950:  # 800 + 150 + space for "..."
                    # Preserve more at the beginning to avoid losing important context
                    summary_text = excerpt[:800] + "..." + excerpt[-150:]
                elif len(excerpt) > 500:
                    # For medium excerpts, preserve more at start
                    summary_text = excerpt[:400] + "..." + excerpt[-100:]
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
