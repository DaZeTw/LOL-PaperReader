# Enhanced Chat Implementation

## Tóm tắt
Đã cải thiện hệ thống chat để:
1. **Lấy lịch sử chat 3 câu gần nhất** (thay vì 10 câu)
2. **Retrieval top-3 câu hỏi/câu trả lời tương đồng** từ embedding
3. **Merge và sắp xếp theo thứ tự thời gian** để tránh trùng lặp
4. **Tích hợp thông tin vào generator** để cải thiện chất lượng trả lời

## Các thay đổi đã thực hiện

### 1. Chat Routes (`src/paperreader/api/chat_routes.py`)

#### Thay đổi lịch sử chat từ 10 xuống 3 câu:
```python
# Trước: limit=10
chat_history = await chat_service.get_recent_messages(request.session_id, limit=10)

# Sau: limit=3  
chat_history = await chat_service.get_recent_messages(request.session_id, limit=3)
```

#### Thêm retrieval similar Q&A pairs:
```python
# Get similar Q&A pairs from chat history using embedding search
similar_qa_pairs = []
try:
    similar_results = await chat_embedding_service.search_chat_history(
        query=request.question,
        top_k=3
    )
    for result in similar_results:
        similar_qa_pairs.append({
            "role": result.get("role", ""),
            "content": result.get("text", ""),
            "score": result.get("score", 0.0),
            "session_id": result.get("session_id", ""),
            "timestamp": result.get("timestamp", "")
        })
    print(f"[DEBUG] Found {len(similar_qa_pairs)} similar Q&A pairs")
except Exception as e:
    print(f"[WARNING] Failed to search similar Q&A pairs: {e}")
    similar_qa_pairs = []
```

#### Merge và sắp xếp theo thứ tự thời gian:
```python
# Merge recent chat history with similar Q&A pairs and sort by timestamp
all_messages = []

# Add recent chat history with timestamp
for msg in chat_history:
    all_messages.append({
        "role": msg.role,
        "content": msg.content,
        "timestamp": msg.timestamp.isoformat(),
        "source": "recent_history"
    })

# Add similar Q&A pairs with timestamp
for qa_pair in similar_qa_pairs:
    all_messages.append({
        "role": qa_pair.get("role", ""),
        "content": qa_pair.get("content", ""),
        "timestamp": qa_pair.get("timestamp", ""),
        "source": "similar_qa"
    })

# Remove duplicates based on content and sort by timestamp
seen_contents = set()
unique_messages = []
for msg in all_messages:
    content_key = f"{msg['role']}:{msg['content']}"
    if content_key not in seen_contents:
        seen_contents.add(content_key)
        unique_messages.append(msg)

# Sort by timestamp (most recent first)
unique_messages.sort(key=lambda x: x['timestamp'], reverse=True)
```

#### Truyền merged chat history vào pipeline:
```python
result = await pipeline.answer(
    question=request.question,
    user_images=processed_user_images if processed_user_images else None,
    chat_history=history_for_generator  # ← Đã merge và sort
)
```

### 2. Pipeline (`src/paperreader/services/qa/pipeline.py`)

#### Simplified pipeline (không cần thay đổi):
```python
async def answer(self, question: str, image: str | None = None, user_images: List[str] | None = None, chat_history: List[Dict[str, str]] | None = None) -> Dict[str, Any]:
```

#### Truyền merged chat history vào generator:
```python
gen_out = self.generator.generate(question, contexts, max_tokens=self.config.max_tokens, query_image=query_image, query_images=user_images, chat_history=chat_history)
```

**Lưu ý**: Pipeline không cần thay đổi vì chat_history đã được merge và sort ở chat_routes.py

## Cách hoạt động

### 1. Lịch sử chat 3 câu gần nhất
- Hệ thống chỉ lấy 3 câu chat gần nhất thay vì 10 câu
- Giảm tải xử lý và tập trung vào context gần nhất

### 2. Retrieval similar Q&A pairs
- Sử dụng `chat_embedding_service.search_chat_history()` để tìm kiếm
- Tìm top-3 câu hỏi/câu trả lời tương đồng nhất
- Dựa trên embedding similarity

### 3. Merge và sắp xếp theo thứ tự thời gian
- Recent chat history (3 câu gần nhất) được merge với similar Q&A pairs
- Loại bỏ duplicates dựa trên nội dung (role:content)
- Sắp xếp theo timestamp (mới nhất trước)
- Generator nhận được merged chat history đã được tối ưu

### 4. Tích hợp vào generator
- Generator nhận được merged chat history đã được merge và sort
- Cải thiện chất lượng trả lời dựa trên context phong phú và có thứ tự

## Endpoints được cập nhật

### 1. `/chat/ask`
- Lấy recent chat history (3 câu gần nhất)
- Retrieval similar Q&A pairs (top-3)
- Merge và sort theo timestamp
- Truyền merged chat history vào pipeline

### 2. `/chat/ask-with-upload`  
- Tương tự như `/ask` nhưng hỗ trợ upload images
- Cũng có merge và sort logic

## Test

Chạy test script để kiểm tra:
```bash
python test_enhanced_chat.py
```

Test script sẽ:
- Tạo chat session
- Gửi nhiều câu hỏi liên tiếp
- Kiểm tra logs để xác nhận:
  - Chat history chỉ lấy 3 câu gần nhất
  - Similar Q&A pairs được retrieve
  - Messages được merge và sort theo timestamp
  - Duplicates được loại bỏ
  - Merged chat history được truyền vào generator

## Lợi ích

1. **Hiệu suất tốt hơn**: Chỉ lấy 3 câu chat gần nhất thay vì 10
2. **Context phong phú hơn**: Thêm similar Q&A pairs từ toàn bộ chat history
3. **Tránh trùng lặp**: Loại bỏ duplicates dựa trên nội dung
4. **Thứ tự logic**: Sắp xếp theo timestamp (mới nhất trước)
5. **Chất lượng trả lời tốt hơn**: Generator có context phong phú và có thứ tự
6. **Tương thích ngược**: Không ảnh hưởng đến API hiện tại

## Logs để debug

Khi chạy, bạn sẽ thấy các logs sau:
```
[DEBUG] Found X similar Q&A pairs
[DEBUG] Merged chat history: X unique messages
[LOG] Retrieving hits for question: '...'
[LOG] LLM generated answer: ...
```

Điều này giúp xác nhận rằng hệ thống đang hoạt động đúng như mong đợi:
- Similar Q&A pairs được tìm thấy
- Messages được merge và loại bỏ duplicates
- Merged chat history được truyền vào generator
