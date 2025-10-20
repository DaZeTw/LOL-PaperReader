# Multi-Turn Chat Functionality

This document describes the multi-turn chat functionality that has been added to the LOL PaperReader backend.

## Overview

The chat system allows users to have multi-turn conversations with the AI assistant while maintaining context from previous messages. All chat history is stored in MongoDB Atlas for persistence.

## Features

- **Multi-turn conversations**: Maintain context across multiple questions and answers
- **Chat session management**: Create, retrieve, update, and delete chat sessions
- **Message history**: Store and retrieve conversation history
- **MongoDB persistence**: All chat data is stored in MongoDB Atlas
- **Image support**: Upload images in chat conversations
- **User management**: Associate chat sessions with specific users

## API Endpoints

### Chat Sessions

#### Create a new chat session
```
POST /api/chat/sessions
```

**Request Body:**
```json
{
  "user_id": "optional-user-id",
  "title": "Optional session title",
  "initial_message": "Optional initial message"
}
```

**Response:**
```json
{
  "session_id": "unique-session-id",
  "title": "Session title",
  "messages": [],
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "message_count": 0
}
```

#### Get a chat session
```
GET /api/chat/sessions/{session_id}
```

#### List user sessions
```
GET /api/chat/sessions?user_id={user_id}&limit={limit}
```

#### Update session title
```
PUT /api/chat/sessions/{session_id}/title
```

**Request Body:**
```json
{
  "title": "New title"
}
```

#### Delete a chat session
```
DELETE /api/chat/sessions/{session_id}
```

### Chat Messages

#### Ask a question in a chat session
```
POST /api/chat/ask
```

**Request Body:**
```json
{
  "session_id": "session-id",
  "question": "What is machine learning?",
  "retriever": "hybrid",
  "generator": "openai",
  "image_policy": "auto",
  "top_k": 5,
  "max_tokens": 512,
  "user_images": ["data:image/png;base64,..."]
}
```

**Response:**
```json
{
  "session_id": "session-id",
  "question": "What is machine learning?",
  "answer": "Machine learning is...",
  "cited_sections": [...],
  "retriever_scores": [...],
  "message_id": "unique-message-id",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### Ask with image upload
```
POST /api/chat/ask-with-upload
```

**Form Data:**
- `session_id`: Chat session ID
- `question`: Question text
- `retriever`: Retriever type (default: "hybrid")
- `generator`: Generator type (default: "openai")
- `image_policy`: Image policy (default: "auto")
- `top_k`: Number of top results (default: 5)
- `max_tokens`: Maximum tokens (default: 512)
- `images`: Image files (optional)

## Database Schema

### ChatSession Collection

```json
{
  "_id": "ObjectId",
  "session_id": "unique-session-identifier",
  "user_id": "optional-user-identifier",
  "title": "session-title",
  "messages": [
    {
      "role": "user|assistant",
      "content": "message content",
      "timestamp": "2024-01-01T00:00:00Z",
      "metadata": {
        "citations": [...],
        "cited_sections": [...],
        "retriever_scores": [...]
      }
    }
  ],
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "metadata": {}
}
```

## Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
# Required
OPENAI_API_KEY=your_openai_api_key_here
MONGODB_URL=mongodb+srv://vanlethai12042002_db_user:zK7RXEY5ZBUWdD45@cluster0.4xnkms3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0

# Optional
RAG_GEN_IMAGE_MAX=4
RAG_GEN_IMAGE_MIN_SCORE=1.0
RAG_GEN_IMAGE_INCLUDE_ALL=false
```

### Dependencies

Install the required dependencies:

```bash
pip install -r requirements.txt
```

## Usage Example

### Python Client Example

```python
import requests
import json

# Base URL for the API
BASE_URL = "http://localhost:8000/api/chat"

# 1. Create a new chat session
session_response = requests.post(f"{BASE_URL}/sessions", json={
    "user_id": "user123",
    "title": "My Research Chat",
    "initial_message": "Hello, I need help with my research"
})

session_data = session_response.json()
session_id = session_data["session_id"]
print(f"Created session: {session_id}")

# 2. Ask a question
question_response = requests.post(f"{BASE_URL}/ask", json={
    "session_id": session_id,
    "question": "What is the transformer architecture?",
    "retriever": "hybrid",
    "generator": "openai"
})

answer_data = question_response.json()
print(f"Answer: {answer_data['answer']}")

# 3. Ask a follow-up question (maintains context)
followup_response = requests.post(f"{BASE_URL}/ask", json={
    "session_id": session_id,
    "question": "How does it differ from RNNs?",
    "retriever": "hybrid",
    "generator": "openai"
})

followup_data = followup_response.json()
print(f"Follow-up answer: {followup_data['answer']}")

# 4. Get session history
session_info = requests.get(f"{BASE_URL}/sessions/{session_id}")
session_data = session_info.json()
print(f"Total messages: {session_data['message_count']}")
```

### JavaScript/TypeScript Client Example

```typescript
const BASE_URL = "http://localhost:8000/api/chat";

// 1. Create a new chat session
const createSession = async () => {
  const response = await fetch(`${BASE_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: "user123",
      title: "My Research Chat"
    })
  });
  return response.json();
};

// 2. Ask a question
const askQuestion = async (sessionId: string, question: string) => {
  const response = await fetch(`${BASE_URL}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      question: question,
      retriever: "hybrid",
      generator: "openai"
    })
  });
  return response.json();
};

// Usage
const session = await createSession();
const answer = await askQuestion(session.session_id, "What is machine learning?");
console.log(answer.answer);
```

## Testing

Run the test script to verify the chat functionality:

```bash
cd backend
python test_chat.py
```

## Architecture

The chat system consists of several components:

1. **Database Layer** (`database/mongodb.py`): MongoDB connection management
2. **Models** (`models/chat.py`): Pydantic models for data validation
3. **Services** (`services/chat/chat_service.py`): Business logic for chat operations
4. **API Routes** (`api/chat_routes.py`): FastAPI endpoints for chat functionality
5. **Generator Updates** (`services/qa/generators.py`): Modified to support chat history

## Multi-turn Context

The system maintains context by:

1. Storing all messages in MongoDB with timestamps
2. Retrieving recent messages (last 10 by default) for context
3. Passing chat history to the AI generator
4. The generator uses this history to provide contextually relevant responses

## Error Handling

The API includes comprehensive error handling:

- 404 errors for non-existent sessions
- 400 errors for invalid requests
- 500 errors for server issues
- Graceful fallbacks for database connection issues

## Security Considerations

- Session IDs are UUIDs to prevent enumeration
- User IDs are optional and can be used for access control
- MongoDB connection uses authentication
- Input validation through Pydantic models

## Performance Considerations

- Chat history is limited to recent messages (configurable)
- MongoDB indexes on session_id and user_id for fast queries
- Async/await throughout for non-blocking operations
- Connection pooling for MongoDB
