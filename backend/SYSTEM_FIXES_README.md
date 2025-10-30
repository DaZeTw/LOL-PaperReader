# Hệ thống đã được sửa chữa - Không còn bị stuck/đơ máy

## 🚨 Vấn đề đã được giải quyết

### 1. **Lỗi hệ thống bị stuck/đơ máy**
- **Nguyên nhân**: Model embedding được load mỗi lần gọi mà không có timeout và error handling
- **Giải pháp**: 
  - Thêm timeout cho tất cả embedding operations (30-60 giây)
  - Thêm loading lock để tránh load model đồng thời
  - Thêm error handling và fallback mechanisms

### 2. **Vector embeddings không được lưu persistent**
- **Nguyên nhân**: Chỉ lưu embeddings trong memory, mất khi restart
- **Giải pháp**: 
  - Tạo `PersistentVectorStore` sử dụng MongoDB
  - Lưu embeddings với base64 encoding
  - Cache trong memory để tăng tốc độ truy vấn

## 🔧 Các thay đổi chính

### 1. **File: `embeddings.py`**
```python
# Thêm timeout và error handling
def _ensure_model(self):
    if self.model is None and not self._loading_lock:
        self._loading_lock = True
        try:
            # Set timeout for model loading (60 seconds)
            signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(60)
            # ... load model with timeout
        except TimeoutError:
            raise RuntimeError("Model loading timeout")
        finally:
            self._loading_lock = False

# Thêm timeout cho embedding operations
def embed(self, texts: List[str]) -> List[List[float]]:
    signal.alarm(30)  # 30 second timeout
    try:
        # ... embedding logic
    except TimeoutError:
        raise RuntimeError("Embedding timeout")
    finally:
        signal.alarm(0)
```

### 2. **File: `persistent_vectorstore.py`** (MỚI)
```python
class PersistentVectorStore:
    """Persistent vector store using MongoDB for storage"""
    
    async def add_embeddings(self, texts, embeddings, metadatas):
        """Add new embeddings to the persistent store"""
        # Encode vectors to base64 for MongoDB storage
        # Store in MongoDB collection
        # Update memory cache for fast retrieval
    
    def dense_search(self, query_vec, top_k=5):
        """Search using dense similarity from memory cache"""
        return self.memory_store.dense_search(query_vec, top_k)
```

### 3. **File: `retrievers.py`**
```python
# Thêm support cho persistent store
class Retriever:
    def __init__(self, name, store, embedder, persistent_store=None):
        self.persistent_store = persistent_store
    
    def retrieve(self, question, top_k=5, image=None):
        # Use persistent store if available, otherwise fall back to memory store
        search_store = self.persistent_store.get_memory_store() if self.persistent_store else self.store
        # ... search logic
```

### 4. **File: `pipeline.py`**
```python
class QAPipeline:
    async def _ensure_persistent_store(self):
        """Initialize persistent store if not already done"""
        if self.persistent_store is None:
            corpus = build_corpus(self.artifacts.chunks)
            self.persistent_store = await build_persistent_store(corpus, self.embedder)
    
    async def answer(self, question, ...):
        # Ensure persistent store is initialized
        await self._ensure_persistent_store()
        # ... rest of answer logic
```

### 5. **File: `chat_embedding_service.py`**
```python
class ChatEmbeddingService:
    def __init__(self):
        self.persistent_store = PersistentVectorStore(collection_name=self.embedding_collection_name)
    
    async def embed_message(self, message_data):
        # Store in persistent vector store
        await self.persistent_store.add_embeddings(texts=[content], embeddings=[embedding], metadatas=[chunk["metadata"]])
        
        # Also store in MongoDB for backup
        await embedding_collection.insert_one({...})
```

## 🎯 Lợi ích của các thay đổi

### 1. **Không còn bị stuck**
- ✅ Timeout cho tất cả operations
- ✅ Error handling và fallback
- ✅ Loading lock tránh conflict

### 2. **Persistent storage**
- ✅ Embeddings được lưu vào MongoDB
- ✅ Không mất dữ liệu khi restart
- ✅ Cache trong memory để tăng tốc độ

### 3. **Performance tốt hơn**
- ✅ Lazy loading model
- ✅ Memory cache cho truy vấn nhanh
- ✅ Batch processing embeddings

### 4. **Reliability cao hơn**
- ✅ Fallback mechanisms
- ✅ Error recovery
- ✅ Timeout protection

## 🧪 Cách test hệ thống

### 1. **Chạy test script**
```bash
cd backend
python test_system_fixes.py
```

### 2. **Test manual**
```python
# Test embedding với timeout
from paperreader.services.qa.embeddings import get_embedder
embedder = get_embedder()
embeddings = embedder.embed(["test document"])

# Test persistent store
from paperreader.services.qa.persistent_vectorstore import PersistentVectorStore
store = PersistentVectorStore()
await store.initialize()
await store.add_embeddings(["text"], [[0.1]*768], [{"source": "test"}])
```

## 📝 Lưu ý quan trọng

### 1. **MongoDB Connection**
- Đảm bảo MongoDB đang chạy
- Kiểm tra connection string trong settings
- Collection `vector_embeddings` sẽ được tạo tự động

### 2. **Memory Usage**
- Persistent store cache embeddings trong memory
- Monitor memory usage nếu có nhiều embeddings
- Có thể clear cache nếu cần: `await store.clear_all_embeddings()`

### 3. **Performance**
- First load sẽ chậm hơn (load model + load embeddings từ DB)
- Subsequent operations sẽ nhanh hơn (cached)
- Timeout được set để tránh hang

## 🚀 Kết luận

Hệ thống đã được sửa chữa hoàn toàn:
- ❌ **Trước**: Bị stuck, không lưu embeddings, không có timeout
- ✅ **Sau**: Stable, persistent storage, timeout protection, error handling

Bây giờ hệ thống sẽ hoạt động ổn định và không còn bị đơ máy nữa!
