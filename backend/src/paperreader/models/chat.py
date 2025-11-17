# chat.py
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
import uuid

# -----------------------------
# Chat message model
# -----------------------------
class ChatMessage(BaseModel):
    role: str  # "system", "user", or "assistant"
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Optional[Dict[str, Any]] = None  # citations, images, scores, etc.

# -----------------------------
# Chat session model
# -----------------------------
class ChatSession(BaseModel):
    id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    session_id: str = Field(..., description="Unique session identifier")
    user_id: Optional[str] = Field(None, description="User identifier if available")
    title: Optional[str] = Field(None, description="Chat session title")
    messages: List[ChatMessage] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

    model_config = {
        "populate_by_name": True,            # tương đương allow_population_by_field_name
        "protected_namespaces": ()          # loại bỏ warning "model_" conflict
    }

# -----------------------------
# Request / Create models
# -----------------------------
class ChatSessionCreate(BaseModel):
    session_id: str
    user_id: Optional[str] = None
    title: Optional[str] = None
    initial_message: Optional[str] = None

class ChatMessageCreate(BaseModel):
    role: str
    content: str
    metadata: Optional[Dict[str, Any]] = None

# -----------------------------
# Response models
# -----------------------------
class ChatSessionResponse(BaseModel):
    session_id: str
    title: Optional[str]
    messages: List[ChatMessage]
    created_at: datetime
    updated_at: datetime
    message_count: int

class ChatMessageResponse(BaseModel):
    role: str
    content: str
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None
