#!/usr/bin/env python3
"""
Test script để kiểm tra hệ thống sau khi sửa lỗi stuck
"""
import asyncio
import sys
import os
from pathlib import Path

# Add the backend src directory to Python path
backend_src = Path(__file__).parent / "backend" / "src"
sys.path.insert(0, str(backend_src))

from paperreader.services.qa.embeddings import get_embedder
from paperreader.services.qa.persistent_vectorstore import PersistentVectorStore
from paperreader.services.chat.chat_embedding_service import chat_embedding_service


async def test_embedding_timeout():
    """Test embedding với timeout"""
    print("🧪 Testing embedding with timeout...")
    
    try:
        embedder = get_embedder()
        
        # Test text embedding
        texts = ["This is a test document", "Another test document"]
        print(f"📝 Embedding {len(texts)} texts...")
        
        embeddings = embedder.embed(texts)
        print(f"✅ Successfully embedded {len(embeddings)} texts")
        print(f"📊 Embedding dimension: {len(embeddings[0]) if embeddings else 0}")
        
        return True
    except Exception as e:
        print(f"❌ Embedding test failed: {e}")
        return False


async def test_persistent_vector_store():
    """Test persistent vector store"""
    print("🧪 Testing persistent vector store...")
    
    try:
        # Initialize persistent store
        store = PersistentVectorStore()
        await store.initialize()
        
        # Test adding embeddings
        texts = ["Test document 1", "Test document 2"]
        embeddings = [[0.1] * 768, [0.2] * 768]  # Mock embeddings
        metadatas = [
            {"text": "Test document 1", "source": "test"},
            {"text": "Test document 2", "source": "test"}
        ]
        
        print(f"💾 Adding {len(texts)} embeddings to persistent store...")
        await store.add_embeddings(texts, embeddings, metadatas)
        
        # Test search
        print("🔍 Testing search...")
        query_vec = [0.15] * 768
        hits = store.dense_search(query_vec, top_k=2)
        print(f"✅ Found {len(hits)} hits")
        
        # Test count
        count = await store.get_embedding_count()
        print(f"📊 Total embeddings in store: {count}")
        
        return True
    except Exception as e:
        print(f"❌ Persistent vector store test failed: {e}")
        return False


async def test_chat_embedding_service():
    """Test chat embedding service"""
    print("🧪 Testing chat embedding service...")
    
    try:
        # Test getting unembedded messages
        unembedded = await chat_embedding_service.get_unembedded_messages(limit=5)
        print(f"📝 Found {len(unembedded)} unembedded messages")
        
        # Test search (should work even with empty store)
        results = await chat_embedding_service.search_chat_history("test query", top_k=3)
        print(f"🔍 Search returned {len(results)} results")
        
        return True
    except Exception as e:
        print(f"❌ Chat embedding service test failed: {e}")
        return False


async def test_system_performance():
    """Test system performance và timeout"""
    print("🧪 Testing system performance...")
    
    try:
        import time
        
        # Test embedding performance
        start_time = time.time()
        embedder = get_embedder()
        
        # Test with larger batch
        texts = [f"Test document {i}" for i in range(10)]
        embeddings = embedder.embed(texts)
        
        end_time = time.time()
        duration = end_time - start_time
        
        print(f"⏱️  Embedded {len(texts)} texts in {duration:.2f} seconds")
        print(f"📊 Average time per text: {duration/len(texts):.3f} seconds")
        
        if duration > 30:  # Should not take more than 30 seconds
            print("⚠️  Warning: Embedding took longer than expected")
            return False
        
        return True
    except Exception as e:
        print(f"❌ Performance test failed: {e}")
        return False


async def main():
    """Main test function"""
    print("🚀 Starting system tests after fixes...")
    print("=" * 50)
    
    tests = [
        ("Embedding Timeout", test_embedding_timeout),
        ("Persistent Vector Store", test_persistent_vector_store),
        ("Chat Embedding Service", test_chat_embedding_service),
        ("System Performance", test_system_performance),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n🔬 Running {test_name} test...")
        try:
            result = await test_func()
            results.append((test_name, result))
            if result:
                print(f"✅ {test_name} test passed")
            else:
                print(f"❌ {test_name} test failed")
        except Exception as e:
            print(f"💥 {test_name} test crashed: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 50)
    print("📊 Test Results Summary:")
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\n🎯 Overall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! System should be working correctly.")
    else:
        print("⚠️  Some tests failed. Please check the issues above.")
    
    return passed == total


if __name__ == "__main__":
    # Set up environment
    os.environ.setdefault("OPENAI_API_KEY", "test-key")
    
    # Run tests
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
