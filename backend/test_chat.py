#!/usr/bin/env python3
"""
Test script for multi-turn chat functionality
"""
import asyncio
import os
import sys
from pathlib import Path

# Add the src directory to Python path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from paperreader.database.mongodb import mongodb
from paperreader.services.chat.chat_service import chat_service
from paperreader.models.chat import ChatSessionCreate, ChatMessageCreate

async def test_chat_functionality():
    """Test the chat functionality"""
    print("🧪 Testing Multi-turn Chat Functionality")
    print("=" * 50)
    
    try:
        # Connect to MongoDB
        print("1. Connecting to MongoDB...")
        await mongodb.connect()
        print("✅ Connected to MongoDB")
        
        # Test 1: Create a chat session
        print("\n2. Creating a chat session...")
        session_data = ChatSessionCreate(
            session_id="test-session-001",
            user_id="test-user",
            title="Test Chat Session",
            initial_message="Hello, I want to test the chat functionality"
        )
        
        session = await chat_service.create_session(session_data)
        print(f"✅ Created session: {session.session_id}")
        print(f"   Title: {session.title}")
        print(f"   Messages: {len(session.messages)}")
        
        # Test 2: Add messages to the session
        print("\n3. Adding messages to the session...")
        
        # Add user message
        user_msg = await chat_service.add_message(
            session.session_id,
            ChatMessageCreate(role="user", content="What is machine learning?")
        )
        print("✅ Added user message")
        
        # Add assistant message
        assistant_msg = await chat_service.add_message(
            session.session_id,
            ChatMessageCreate(
                role="assistant", 
                content="Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed."
            )
        )
        print("✅ Added assistant message")
        
        # Test 3: Get recent messages
        print("\n4. Getting recent messages...")
        recent_messages = await chat_service.get_recent_messages(session.session_id, limit=5)
        print(f"✅ Retrieved {len(recent_messages)} recent messages")
        
        for i, msg in enumerate(recent_messages):
            print(f"   Message {i+1}: {msg.role} - {msg.content[:50]}...")
        
        # Test 4: Get session response
        print("\n5. Getting session response...")
        session_response = await chat_service.get_session_response(session.session_id)
        if session_response:
            print(f"✅ Session response retrieved")
            print(f"   Message count: {session_response.message_count}")
            print(f"   Last updated: {session_response.updated_at}")
        
        # Test 5: List user sessions
        print("\n6. Listing user sessions...")
        user_sessions = await chat_service.list_user_sessions("test-user", limit=10)
        print(f"✅ Found {len(user_sessions)} sessions for user")
        
        for i, sess in enumerate(user_sessions):
            print(f"   Session {i+1}: {sess.session_id} - {sess.title}")
        
        # Test 6: Update session title
        print("\n7. Updating session title...")
        success = await chat_service.update_session_title(session.session_id, "Updated Test Session")
        if success:
            print("✅ Session title updated")
        
        # Test 7: Clean up - delete the test session
        print("\n8. Cleaning up...")
        deleted = await chat_service.delete_session(session.session_id)
        if deleted:
            print("✅ Test session deleted")
        
        print("\n🎉 All tests passed successfully!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Disconnect from MongoDB
        print("\n9. Disconnecting from MongoDB...")
        await mongodb.disconnect()
        print("✅ Disconnected from MongoDB")

if __name__ == "__main__":
    # Set environment variables for testing
    os.environ.setdefault("MONGODB_URL", "mongodb+srv://vanlethai12042002_db_user:zK7RXEY5ZBUWdD45@cluster0.4xnkms3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
    
    asyncio.run(test_chat_functionality())
