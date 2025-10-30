# Cập nhật hệ thống Chat Embeddings

## 🎯 Mục tiêu đã hoàn thành

### 1. **Embed và lưu User Query**
- ✅ Khi user chat, query được embed và lưu vào database chat embeddings
- ✅ Chạy async để không block response

### 2. **Embed và lưu AI Response** 
- ✅ Khi AI trả lời xong, response được embed và lưu vào database (chạy ngầm)
- ✅ Citations và metadata được lưu trong embeddings, không trong chat sessions

### 3. **Đơn giản hóa Chat Sessions**
- ✅ Chat sessions chỉ lưu đoạn chat đơn giản
- ✅ Bỏ cited_sections khỏi chat sessions
- ✅ Metadata trống cho chat messages

### 4. **Tách biệt Vector Embeddings**
- ✅ Chunk embeddings (từ PDF) chỉ lưu trong memory
- ✅ Chat embeddings lưu trong database MongoDB
- ✅ Hai loại embeddings hoạt động độc lập

## 🔧 Các thay đổi chi tiết

### 1. **File: `chat_routes.py`**

#### User Query Embedding:
```python
# Embed and save user query to database (async)
user_message_data = {
    "message_id": f"{session_id}_{datetime.utcnow().isoformat()}_user",
    "session_id": session_id,
    "user_id": session.user_id,
    "role": "user",
    "content": question,
    "timestamp": datetime.utcnow(),
    "metadata": user_message.metadata or {},
    "has_images": bool(user_images)
}
# Run embedding in background
asyncio.create_task(chat_embedding_service.embed_message(user_message_data))
```

#### AI Response Embedding:
```python
# Add assistant response to chat history (simplified - no citations)
assistant_message = ChatMessageCreate(
    role="assistant",
    content=result["answer"],
    metadata={}  # Simplified - no citations in chat sessions
)

# Embed and save AI response to database (async background task)
assistant_message_data = {
    "message_id": f"{session_id}_{datetime.utcnow().isoformat()}_assistant",
    "session_id": session_id,
    "user_id": session.user_id,
    "role": "assistant",
    "content": result["answer"],
    "timestamp": datetime.utcnow(),
    "metadata": {
        "citations": result.get("citations", []),
        "cited_sections": result.get("cited_sections", []),
        "retriever_scores": result.get("retriever_scores", [])
    },
    "has_images": False
}
# Run embedding in background
asyncio.create_task(chat_embedding_service.embed_message(assistant_message_data))
```

### 2. **File: `pipeline.py`**

#### Disabled Persistent Store for Chunks:
```python
async def _ensure_persistent_store(self):
    """Initialize persistent store if not already done - DISABLED for chunk embeddings"""
    # Note: Chunk embeddings are kept in memory only for performance
    # Chat embeddings are handled separately by chat_embedding_service
    if self.persistent_store is None:
        print("[LOG] Using memory-only vector store for chunk embeddings")
        # Keep using memory store for chunk embeddings
        self.persistent_store = None
```

### 3. **File: `retrievers.py`**

#### Use Memory Store for Chunks:
```python
def retrieve(self, question: str, top_k: int = 5, image: str | None = None):
    # Use memory store for chunk embeddings (no persistent store for chunks)
    search_store = self.store
```

### 4. **File: `chat_embedding_routes.py`** (MỚI)

#### API Endpoints for Chat Embeddings:
```python
@router.get("/stats")  # Get embedding statistics
@router.post("/process-unembedded")  # Process unembedded messages
@router.post("/search")  # Search chat history
@router.delete("/clear-all")  # Clear all embeddings
@router.get("/health")  # Health check
```

## 📊 Cấu trúc dữ liệu

### 1. **Chat Sessions** (Đơn giản)
```json
{
  "session_id": "uuid",
  "user_id": "user123",
  "messages": [
    {
      "role": "user",
      "content": "What is machine learning?",
      "timestamp": "2024-01-01T10:00:00Z",
      "metadata": {}  // Trống
    },
    {
      "role": "assistant", 
      "content": "Machine learning is...",
      "timestamp": "2024-01-01T10:00:05Z",
      "metadata": {}  // Trống
    }
  ]
}
```

### 2. **Chat Embeddings** (Chi tiết)
```json
{
  "message_id": "session_id_timestamp_role",
  "text": "What is machine learning?",
  "embedding_vector": "base64_encoded_vector",
  "metadata": {
    "session_id": "uuid",
    "user_id": "user123", 
    "role": "user",
    "timestamp": "2024-01-01T10:00:00Z",
    "source": "chat_message",
    "citations": [...],  // Chỉ có trong AI responses
    "cited_sections": [...],
    "retriever_scores": [...]
  },
  "has_images": false,
  "created_at": "2024-01-01T10:00:00Z"
}
```

## 🚀 API Endpoints mới

### 1. **Chat Embedding Management**
```
GET /api/chat-embedding/stats
POST /api/chat-embedding/process-unembedded?limit=50
POST /api/chat-embedding/search?query=test&top_k=5
DELETE /api/chat-embedding/clear-all
GET /api/chat-embedding/health
```

### 2. **Ví dụ sử dụng**
```bash
# Get embedding statistics
curl http://localhost:8000/api/chat-embedding/stats

# Search chat history
curl -X POST "http://localhost:8000/api/chat-embedding/search?query=machine%20learning&top_k=5"

# Process unembedded messages
curl -X POST "http://localhost:8000/api/chat-embedding/process-unembedded?limit=100"
```

## 🎯 Lợi ích

### 1. **Performance**
- ✅ Chat sessions load nhanh (không có citations)
- ✅ Chunk embeddings trong memory (truy vấn nhanh)
- ✅ Chat embeddings persistent (không mất khi restart)

### 2. **Scalability**
- ✅ Tách biệt hai loại embeddings
- ✅ Chat embeddings có thể scale riêng
- ✅ Memory usage được tối ưu

### 3. **User Experience**
- ✅ Response nhanh (embedding chạy ngầm)
- ✅ Chat history đơn giản, dễ đọc
- ✅ Search chat history với embeddings

### 4. **Data Management**
- ✅ Citations được lưu trong embeddings
- ✅ Chat sessions clean và đơn giản
- ✅ Có thể clear embeddings riêng biệt

## 📝 Lưu ý quan trọng

### 1. **Async Processing**
- User query và AI response được embed async
- Không block response time
- Có thể có delay nhỏ trong việc search chat history

### 2. **Memory vs Database**
- Chunk embeddings: Memory only (fast retrieval)
- Chat embeddings: Database + Memory cache (persistent)

### 3. **Error Handling**
- Embedding failures không ảnh hưởng chat
- Có warning logs khi embedding fail
- Fallback mechanisms

## 🎉 Kết luận

Hệ thống đã được cập nhật hoàn chỉnh:
- ✅ User queries được embed và lưu vào database
- ✅ AI responses được embed và lưu vào database (async)
- ✅ Chat sessions đơn giản, không có citations
- ✅ Tách biệt chunk embeddings (memory) và chat embeddings (database)
- ✅ API endpoints để quản lý chat embeddings

Bây giờ hệ thống sẽ hoạt động theo đúng yêu cầu của bạn!
