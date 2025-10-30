#!/usr/bin/env python3
"""
Test script for simple chat embedding functionality
"""

import asyncio
import sys
import os
from pathlib import Path

# Add the src directory to Python path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from paperreader.services.chat.simple_chat_embedding_service import simple_chat_embedding_service
from paperreader.database.mongodb import mongodb


async def test_simple_chat_embedding():
    """Test the simple chat embedding functionality"""
    
    print("🚀 Testing Simple Chat Embedding System")
    print("=" * 50)
    
    try:
        # Connect to MongoDB
        await mongodb.connect()
        print("✅ Connected to MongoDB")
        
        # Test 1: Get unembedded messages
        print("\n📋 Getting unembedded messages...")
        unembedded = await simple_chat_embedding_service.get_unembedded_messages(limit=10)
        print(f"Found {len(unembedded)} unembedded messages")
        
        if unembedded:
            print("\nFirst few unembedded messages:")
            for i, msg in enumerate(unembedded[:3]):
                print(f"  {i+1}. {msg['role']}: {msg['content'][:100]}...")
                print(f"     Has images: {msg['has_images']}")
                print(f"     Session: {msg['session_id']}")
        
        # Test 2: Store messages for embedding
        if unembedded:
            print(f"\n🔄 Storing {len(unembedded)} messages for embedding...")
            result = await simple_chat_embedding_service.store_unembedded_messages(limit=5)
            print(f"✅ Storage result: {result}")
        
        # Test 3: Get embedding stats
        print("\n📊 Getting embedding statistics...")
        stats = await simple_chat_embedding_service.get_embedding_stats()
        print(f"Total chat messages: {stats.get('total_chat_messages', 0)}")
        print(f"Stored messages: {stats.get('stored_messages', 0)}")
        print(f"Needs embedding: {stats.get('needs_embedding', 0)}")
        print(f"Storage percentage: {stats.get('storage_percentage', 0):.1f}%")
        
        print("\n✅ All tests completed successfully!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Disconnect from MongoDB
        await mongodb.disconnect()
        print("\n🔌 Disconnected from MongoDB")


async def test_api_endpoints():
    """Test the API endpoints"""
    
    print("\n🌐 Testing API Endpoints")
    print("=" * 50)
    
    try:
        import httpx
        
        base_url = "http://localhost:8000"
        
        # Test embedding stats
        print("📊 Testing embedding stats endpoint...")
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base_url}/api/chat-embedding/embedding-stats")
            if response.status_code == 200:
                stats = response.json()
                print(f"✅ Stats: {stats}")
            else:
                print(f"❌ Stats failed: {response.status_code}")
        
        # Test unembedded messages
        print("\n📋 Testing unembedded messages endpoint...")
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base_url}/api/chat-embedding/unembedded-messages?limit=5")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Found {data['total_count']} unembedded messages")
            else:
                print(f"❌ Unembedded messages failed: {response.status_code}")
        
        # Test store messages
        print("\n💾 Testing store messages endpoint...")
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{base_url}/api/chat-embedding/embed-messages", json={
                "limit": 5
            })
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Stored {data['processed']} messages")
            else:
                print(f"❌ Store messages failed: {response.status_code}")
        
        print("\n✅ API endpoint tests completed!")
        
    except Exception as e:
        print(f"❌ API test failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    print("🧪 Simple Chat Embedding Test Suite")
    print("=" * 60)
    
    # Run the tests
    asyncio.run(test_simple_chat_embedding())
    
    # Note: API tests require the server to be running
    print("\n" + "=" * 60)
    print("💡 To test API endpoints, start the server with:")
    print("   cd backend && python -m uvicorn src.paperreader.main:app --reload")
    print("   Then run: python test_simple_chat_embedding.py --api")
    
    if "--api" in sys.argv:
        asyncio.run(test_api_endpoints())
