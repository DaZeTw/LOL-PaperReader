# Chat Embedding System

Hệ thống embedding chat messages để có thể retrieval lịch sử chat trong các cuộc trò chuyện sau này.

## Tổng quan

Hệ thống này cho phép:
- **Embed chat messages**: Chuyển đổi các tin nhắn chat thành vector embeddings
- **Lưu trữ ảnh**: Xử lý và embed cả text và ảnh trong chat
- **Retrieval**: Tìm kiếm trong lịch sử chat dựa trên text và ảnh
- **Tích hợp RAG**: Sử dụng chat history trong RAG pipeline

## API Endpoints

### 1. Embed Messages

#### POST `/api/chat-embedding/embed-messages`
Embed tất cả các chat messages chưa được embed.

**Request Body:**
```json
{
  "limit": 50
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Processed 25 messages, 0 failed",
  "processed": 25,
  "failed": 0,
  "total_found": 30
}
```

### 2. Get Unembedded Messages

#### GET `/api/chat-embedding/unembedded-messages`
Lấy danh sách các messages chưa được embed.

**Query Parameters:**
- `limit`: Số lượng messages tối đa (default: 100)

**Response:**
```json
{
  "messages": [
    {
      "message_id": "session_123_2024-01-01T10:00:00_user",
      "session_id": "session_123",
      "user_id": "user_456",
      "role": "user",
      "content": "What is machine learning?",
      "timestamp": "2024-01-01T10:00:00Z",
      "metadata": {
        "user_images": ["data:image/png;base64,..."]
      },
      "has_images": true
    }
  ],
  "total_count": 1
}
```

### 3. Search Chat History

#### POST `/api/chat-embedding/search-chat`
Tìm kiếm trong lịch sử chat đã được embed.

**Request Body:**
```json
{
  "query": "machine learning algorithms",
  "top_k": 5,
  "image": "data:image/png;base64,..."  // optional
}
```

**Response:**
```json
{
  "results": [
    {
      "score": 0.85,
      "text": "Machine learning is a subset of AI...",
      "session_id": "session_123",
      "user_id": "user_456",
      "role": "user",
      "timestamp": "2024-01-01T10:00:00Z",
      "message_id": "session_123_2024-01-01T10:00:00_user",
      "has_images": true
    }
  ],
  "total_found": 1
}
```

### 4. Get Embedding Statistics

#### GET `/api/chat-embedding/embedding-stats`
Lấy thống kê về việc embedding.

**Response:**
```json
{
  "total_chat_messages": 100,
  "embedded_messages": 75,
  "vector_store_entries": 75,
  "unembedded_messages": 25,
  "embedding_percentage": 75.0
}
```

### 5. Embed Specific Message

#### POST `/api/chat-embedding/embed-specific-message`
Embed một message cụ thể.

**Query Parameters:**
- `message_id`: ID của message cần embed

**Response:**
```json
{
  "status": "success",
  "message": "Successfully embedded message session_123_2024-01-01T10:00:00_user",
  "message_id": "session_123_2024-01-01T10:00:00_user"
}
```

### 6. Clear All Embeddings

#### DELETE `/api/chat-embedding/clear-embeddings`
Xóa tất cả embeddings (cẩn thận!).

**Response:**
```json
{
  "status": "success",
  "message": "Cleared 75 embeddings",
  "deleted_count": 75
}
```

## Cách sử dụng

### 1. Khởi tạo hệ thống

```python
# Import service
from paperreader.services.chat.chat_embedding_service import chat_embedding_service

# Embed tất cả messages chưa được xử lý
result = await chat_embedding_service.embed_unembedded_messages(limit=50)
print(f"Processed: {result['processed']}, Failed: {result['failed']}")
```

### 2. Tìm kiếm trong chat history

```python
# Tìm kiếm text
results = await chat_embedding_service.search_chat_history(
    query="machine learning",
    top_k=5
)

# Tìm kiếm với ảnh
results = await chat_embedding_service.search_chat_history(
    query="What is this diagram showing?",
    image="data:image/png;base64,...",
    top_k=3
)
```

### 3. Sử dụng trong RAG pipeline

```python
from paperreader.services.qa.chat_retriever import chat_retriever

# Lấy context từ chat history
chat_context = await chat_retriever.get_relevant_chat_context(
    query="machine learning",
    session_id="session_123",  # optional
    top_k=3
)

# Format cho generator
formatted_context = chat_retriever.format_chat_context_for_generator(chat_context)
```

## Cấu trúc dữ liệu

### Chat Message với Images

```json
{
  "role": "user",
  "content": "What is this diagram showing?",
  "timestamp": "2024-01-01T10:00:00Z",
  "metadata": {
    "user_images": [
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ..."
    ]
  }
}
```

### Embedded Message

```json
{
  "message_id": "session_123_2024-01-01T10:00:00_user",
  "text": "What is this diagram showing?",
  "embedding": [0.1, 0.2, 0.3, ...],  // Vector embedding
  "metadata": {
    "session_id": "session_123",
    "user_id": "user_456",
    "role": "user",
    "timestamp": "2024-01-01T10:00:00Z",
    "source": "chat_message"
  },
  "has_images": true,
  "images": [
    {
      "data": "/path/to/temp/image.png",
      "caption": "Chat image 1",
      "figure_id": "chat_2024-01-01T10:00:00_0"
    }
  ],
  "created_at": "2024-01-01T10:05:00Z"
}
```

## Xử lý ảnh

Hệ thống tự động:
1. **Phát hiện ảnh**: Tìm ảnh trong `metadata.user_images` và content
2. **Lưu tạm thời**: Chuyển base64 thành file tạm
3. **Embed kết hợp**: Sử dụng Visualized_BGE để embed text + image
4. **Dọn dẹp**: Xóa file tạm sau khi embed

## Tích hợp với Chat System

Khi user upload ảnh trong chat, hệ thống sẽ:
1. Lưu ảnh vào `metadata.user_images`
2. Khi embed, tự động phát hiện và xử lý ảnh
3. Tạo embedding kết hợp text + image
4. Lưu vào vector store để retrieval

## Testing

Chạy test script:

```bash
cd backend
python test_chat_embedding.py
```

Test API endpoints (cần server đang chạy):

```bash
python test_chat_embedding.py --api
```

## Lưu ý

- **Performance**: Embedding có thể chậm với nhiều messages
- **Storage**: Ảnh được lưu tạm thời, cần dọn dẹp định kỳ
- **Memory**: Vector store được lưu trong memory, cần restart để reload
- **Images**: Chỉ hỗ trợ base64 data URLs trong chat messages
