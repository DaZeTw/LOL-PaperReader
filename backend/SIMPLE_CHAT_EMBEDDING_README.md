# Simple Chat Embedding System

Hệ thống embedding chat messages đơn giản để tránh load model nặng khi khởi động server.

## Vấn đề đã giải quyết

- ❌ **Server bị stuck**: Khi load Visualized_BGE model, server bị stuck
- ✅ **Giải pháp**: Sử dụng Simple Chat Embedding Service không load model nặng

## Tính năng

### 1. **Lưu trữ Messages** (không embed)
- Lưu chat messages vào MongoDB
- Đánh dấu messages cần embed sau này
- Không load model nặng khi khởi động

### 2. **API Endpoints**

#### POST `/api/chat-embedding/embed-messages`
Lưu trữ messages chưa được xử lý.

**Request:**
```json
{
  "limit": 50
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Stored 25 messages for embedding, 0 failed",
  "processed": 25,
  "failed": 0,
  "total_found": 30
}
```

#### GET `/api/chat-embedding/unembedded-messages`
Lấy danh sách messages chưa được lưu trữ.

#### GET `/api/chat-embedding/embedding-stats`
Thống kê về messages đã lưu trữ.

**Response:**
```json
{
  "total_chat_messages": 100,
  "stored_messages": 75,
  "needs_embedding": 75,
  "unembedded_messages": 25,
  "storage_percentage": 75.0
}
```

## Cách sử dụng

### 1. **Khởi động server** (không bị stuck)
```bash
cd backend
python -m uvicorn src.paperreader.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. **Lưu trữ messages**
```bash
curl -X POST "http://localhost:8000/api/chat-embedding/embed-messages" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}'
```

### 3. **Kiểm tra thống kê**
```bash
curl "http://localhost:8000/api/chat-embedding/embedding-stats"
```

### 4. **Test script**
```bash
cd backend
python test_simple_chat_embedding.py
```

## Cấu trúc dữ liệu

### Stored Message
```json
{
  "message_id": "session_123_2024-01-01T10:00:00_user",
  "text": "What is machine learning?",
  "metadata": {
    "message_id": "session_123_2024-01-01T10:00:00_user",
    "session_id": "session_123",
    "user_id": "user_456",
    "role": "user",
    "timestamp": "2024-01-01T10:00:00Z",
    "source": "chat_message"
  },
  "has_images": true,
  "needs_embedding": true,
  "created_at": "2024-01-01T10:05:00Z"
}
```

## Lợi ích

1. **Server khởi động nhanh**: Không load model nặng
2. **Lưu trữ messages**: Chuẩn bị dữ liệu cho embedding sau
3. **API hoạt động**: Có thể test và sử dụng ngay
4. **Mở rộng dễ dàng**: Có thể thêm embedding logic sau

## Kế hoạch phát triển

### Phase 1: ✅ **Hoàn thành**
- Lưu trữ messages không embed
- API endpoints cơ bản
- Test script

### Phase 2: **Tương lai**
- Thêm embedding logic khi cần
- Tích hợp với RAG pipeline
- Search functionality

## So sánh

| Tính năng | Full Embedding | Simple Embedding |
|-----------|----------------|------------------|
| Server startup | ❌ Chậm (load model) | ✅ Nhanh |
| Memory usage | ❌ Cao | ✅ Thấp |
| Embedding | ✅ Có | ❌ Chưa |
| Storage | ✅ Có | ✅ Có |
| Search | ✅ Có | ❌ Chưa |

## Kết luận

Simple Chat Embedding System giải quyết vấn đề server bị stuck bằng cách:
- Không load model nặng khi khởi động
- Lưu trữ messages để xử lý sau
- Cung cấp API cơ bản để quản lý

Đây là giải pháp tạm thời hiệu quả để server có thể chạy được và chuẩn bị dữ liệu cho embedding sau này.
