# API Endpoints Specification

## Overview

This document specifies all API endpoints for authentication and corpus management in LOL-PaperReader, including request/response formats, authentication requirements, and error handling.

---

## API Structure

```
/api/
├── auth/              # Authentication endpoints
│   ├── login
│   ├── signup
│   ├── logout
│   ├── refresh
│   ├── me
│   └── update
│
├── corpus/            # Corpus management
│   ├── list
│   ├── create
│   ├── [id]
│   ├── [id]/documents
│   └── [id]/upload
│
└── chat/              # Enhanced chat (existing, updated)
    ├── sessions
    └── ask
```

---

## Authentication Endpoints

### 1. POST /api/auth/login

**Purpose:** Authenticate user and establish session.

**Request:**
```typescript
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (Success):**
```typescript
HTTP 200 OK
Set-Cookie: refresh_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Max-Age=604800

{
  "success": true,
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "profile_picture": "https://...",
    "created_at": "2025-01-15T10:30:00Z"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (Error):**
```typescript
HTTP 401 Unauthorized

{
  "success": false,
  "message": "Invalid email or password",
  "error_code": "INVALID_CREDENTIALS"
}
```

**Implementation:**
```typescript
// app/api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    // Forward to FastAPI backend
    const response = await fetch(`${process.env.BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    if (!response.ok) {
      const error = await response.json()
      return NextResponse.json(error, { status: response.status })
    }

    const data = await response.json()

    // Set httpOnly cookie for refresh token
    cookies().set('refresh_token', data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    })

    // Return user data and access token
    return NextResponse.json({
      success: true,
      user: data.user,
      access_token: data.access_token
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

**FastAPI Backend:**
```python
# backend/src/paperreader/api/auth_routes.py

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from passlib.hash import bcrypt
import jwt
from datetime import datetime, timedelta

router = APIRouter()

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class LoginResponse(BaseModel):
    user: dict
    access_token: str
    refresh_token: str

@router.post("/api/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest, db = Depends(get_database)):
    # Find user by email
    user = await db.users.find_one({"email": request.email})

    if not user or not bcrypt.verify(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Generate tokens
    access_token = generate_access_token(user["_id"])
    refresh_token = generate_refresh_token(user["_id"])

    return {
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user["name"],
            "profile_picture": user.get("profile_picture"),
            "created_at": user["created_at"]
        },
        "access_token": access_token,
        "refresh_token": refresh_token
    }

def generate_access_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.utcnow() + timedelta(minutes=15),
        "type": "access"
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def generate_refresh_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.utcnow() + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")
```

**Rate Limiting:**
- 10 requests per minute per IP address
- Implement exponential backoff after 3 failed attempts

---

### 2. POST /api/auth/signup

**Purpose:** Create new user account.

**Request:**
```typescript
POST /api/auth/signup
Content-Type: application/json

{
  "name": "John Doe",
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Validation Rules:**
- Name: 1-100 characters
- Email: Valid email format, unique in database
- Password: Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 number

**Response (Success):**
```typescript
HTTP 201 Created
Set-Cookie: refresh_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Max-Age=604800

{
  "success": true,
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "created_at": "2025-01-15T10:30:00Z"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (Error):**
```typescript
HTTP 400 Bad Request

{
  "success": false,
  "message": "Email already exists",
  "error_code": "EMAIL_EXISTS"
}
```

**Backend Implementation:**
```python
class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

@router.post("/api/auth/signup")
async def signup(request: SignupRequest, db = Depends(get_database)):
    # Validate password strength
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password too short")

    # Check if email exists
    existing_user = await db.users.find_one({"email": request.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already exists")

    # Hash password
    password_hash = bcrypt.hash(request.password)

    # Create user
    user = {
        "email": request.email,
        "name": request.name,
        "password_hash": password_hash,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "is_active": True
    }

    result = await db.users.insert_one(user)
    user["_id"] = result.inserted_id

    # Generate tokens
    access_token = generate_access_token(str(result.inserted_id))
    refresh_token = generate_refresh_token(str(result.inserted_id))

    return {
        "user": {
            "id": str(result.inserted_id),
            "email": user["email"],
            "name": user["name"],
            "created_at": user["created_at"]
        },
        "access_token": access_token,
        "refresh_token": refresh_token
    }
```

---

### 3. POST /api/auth/logout

**Purpose:** Invalidate user session.

**Request:**
```typescript
POST /api/auth/logout
Cookie: refresh_token=<jwt>
```

**Response:**
```typescript
HTTP 200 OK
Set-Cookie: refresh_token=; HttpOnly; Secure; Max-Age=0

{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 4. POST /api/auth/refresh

**Purpose:** Refresh access token using refresh token.

**Request:**
```typescript
POST /api/auth/refresh
Cookie: refresh_token=<jwt>
```

**Response (Success):**
```typescript
HTTP 200 OK

{
  "success": true,
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (Error):**
```typescript
HTTP 401 Unauthorized

{
  "success": false,
  "message": "Invalid or expired refresh token",
  "error_code": "INVALID_TOKEN"
}
```

---

### 5. GET /api/auth/me

**Purpose:** Get current user information.

**Request:**
```typescript
GET /api/auth/me
Authorization: Bearer <access_token>
```

**Response:**
```typescript
HTTP 200 OK

{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "profile_picture": "https://...",
    "created_at": "2025-01-15T10:30:00Z"
  }
}
```

---

### 6. PATCH /api/auth/update

**Purpose:** Update user profile.

**Request:**
```typescript
PATCH /api/auth/update
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Jane Doe",
  "profile_picture": "https://..."
}
```

**Response:**
```typescript
HTTP 200 OK

{
  "success": true,
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "Jane Doe",
    "profile_picture": "https://...",
    "updated_at": "2025-01-15T11:00:00Z"
  }
}
```

---

## Corpus Management Endpoints

### 7. GET /api/corpus/list

**Purpose:** Get all corpora for authenticated user.

**Request:**
```typescript
GET /api/corpus/list
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 100)
- `sort` (optional): Sort field (created_at, updated_at, name)
- `order` (optional): Sort order (asc, desc)

**Response:**
```typescript
HTTP 200 OK

{
  "success": true,
  "corpora": [
    {
      "id": "corpus_123",
      "user_id": "user_123",
      "name": "AI Research Papers",
      "description": "Collection of AI/ML papers",
      "document_count": 24,
      "total_size_bytes": 157286400,
      "created_at": "2025-01-10T08:00:00Z",
      "updated_at": "2025-01-15T10:30:00Z",
      "tags": ["ai", "machine-learning"]
    },
    // ... more corpora
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 3,
    "total_pages": 1
  }
}
```

**Backend Implementation:**
```python
@router.get("/api/corpus/list")
async def list_corpora(
    page: int = 1,
    limit: int = 50,
    sort: str = "updated_at",
    order: str = "desc",
    current_user = Depends(get_current_user),
    db = Depends(get_database)
):
    # Validate pagination
    limit = min(limit, 100)
    skip = (page - 1) * limit

    # Build query
    query = {"user_id": ObjectId(current_user["id"])}

    # Get total count
    total = await db.corpus.count_documents(query)

    # Get corpora
    sort_order = DESCENDING if order == "desc" else ASCENDING
    corpora = await db.corpus.find(query) \
        .sort(sort, sort_order) \
        .skip(skip) \
        .limit(limit) \
        .to_list(length=limit)

    # Format response
    formatted_corpora = [
        {
            "id": str(c["_id"]),
            "user_id": str(c["user_id"]),
            "name": c["name"],
            "description": c.get("description"),
            "document_count": c.get("document_count", 0),
            "total_size_bytes": c.get("total_size_bytes", 0),
            "created_at": c["created_at"],
            "updated_at": c["updated_at"],
            "tags": c.get("tags", [])
        }
        for c in corpora
    ]

    return {
        "success": True,
        "corpora": formatted_corpora,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit
        }
    }
```

---

### 8. POST /api/corpus/create

**Purpose:** Create new corpus.

**Request:**
```typescript
POST /api/corpus/create
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "AI Research Papers",
  "description": "Collection of AI/ML papers",
  "tags": ["ai", "machine-learning"]
}
```

**Validation:**
- Name: Required, 1-100 characters, unique per user
- Description: Optional, max 500 characters
- Tags: Optional, array of strings, max 10 tags

**Response:**
```typescript
HTTP 201 Created

{
  "success": true,
  "corpus": {
    "id": "corpus_123",
    "user_id": "user_123",
    "name": "AI Research Papers",
    "description": "Collection of AI/ML papers",
    "document_count": 0,
    "total_size_bytes": 0,
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:30:00Z",
    "tags": ["ai", "machine-learning"]
  }
}
```

---

### 9. GET /api/corpus/[id]

**Purpose:** Get corpus details.

**Request:**
```typescript
GET /api/corpus/corpus_123
Authorization: Bearer <access_token>
```

**Response:**
```typescript
HTTP 200 OK

{
  "success": true,
  "corpus": {
    "id": "corpus_123",
    "user_id": "user_123",
    "name": "AI Research Papers",
    "description": "Collection of AI/ML papers",
    "document_count": 24,
    "total_size_bytes": 157286400,
    "created_at": "2025-01-10T08:00:00Z",
    "updated_at": "2025-01-15T10:30:00Z",
    "tags": ["ai", "machine-learning"]
  }
}
```

**Authorization:**
- User must own the corpus (user_id match)
- Returns 403 Forbidden if not owner

---

### 10. PATCH /api/corpus/[id]

**Purpose:** Update corpus metadata.

**Request:**
```typescript
PATCH /api/corpus/corpus_123
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description",
  "tags": ["ai", "deep-learning"]
}
```

**Response:**
```typescript
HTTP 200 OK

{
  "success": true,
  "corpus": {
    "id": "corpus_123",
    "name": "Updated Name",
    // ... updated fields
    "updated_at": "2025-01-15T11:00:00Z"
  }
}
```

---

### 11. DELETE /api/corpus/[id]

**Purpose:** Delete corpus and all associated documents.

**Request:**
```typescript
DELETE /api/corpus/corpus_123
Authorization: Bearer <access_token>
```

**Response:**
```typescript
HTTP 200 OK

{
  "success": true,
  "message": "Corpus deleted successfully",
  "deleted_documents": 24
}
```

**Side Effects:**
- Deletes all documents in corpus
- Deletes all chat sessions associated with corpus
- Deletes all embeddings for corpus documents
- Cannot be undone

---

### 12. GET /api/corpus/[id]/documents

**Purpose:** Get all documents in corpus.

**Request:**
```typescript
GET /api/corpus/corpus_123/documents?page=1&limit=50
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)
- `status`: Filter by status (uploading, processing, ready, failed)

**Response:**
```typescript
HTTP 200 OK

{
  "success": true,
  "documents": [
    {
      "id": "doc_456",
      "corpus_id": "corpus_123",
      "file_name": "attention-is-all-you-need.pdf",
      "file_size": 1245678,
      "uploaded_at": "2025-01-14T14:20:00Z",
      "status": "ready",
      "parsed_data": {
        "num_pages": 15,
        "metadata": {
          "title": "Attention Is All You Need",
          "authors": ["Vaswani et al."]
        }
      }
    },
    // ... more documents
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 24,
    "total_pages": 1
  }
}
```

---

### 13. POST /api/corpus/[id]/upload

**Purpose:** Upload document to corpus.

**Request:**
```typescript
POST /api/corpus/corpus_123/upload
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

{
  file: <PDF file binary>
}
```

**File Validation:**
- Type: application/pdf only
- Size: Max 50MB per file
- Virus scan (future)

**Response:**
```typescript
HTTP 201 Created

{
  "success": true,
  "document": {
    "id": "doc_789",
    "corpus_id": "corpus_123",
    "file_name": "new-paper.pdf",
    "file_size": 2345678,
    "uploaded_at": "2025-01-15T10:35:00Z",
    "status": "processing"
  },
  "message": "Document uploaded successfully. Processing in background."
}
```

**Background Processing:**
1. Save file to storage
2. Parse PDF (text, images, metadata)
3. Generate embeddings
4. Update document status to "ready"
5. Update corpus document_count and total_size_bytes

---

### 14. DELETE /api/corpus/[corpus_id]/documents/[document_id]

**Purpose:** Remove document from corpus.

**Request:**
```typescript
DELETE /api/corpus/corpus_123/documents/doc_456
Authorization: Bearer <access_token>
```

**Response:**
```typescript
HTTP 200 OK

{
  "success": true,
  "message": "Document removed from corpus"
}
```

---

## Enhanced Chat Endpoints

### 15. POST /api/chat/sessions (Updated)

**Purpose:** Create or retrieve chat session (now with corpus context).

**Request:**
```typescript
POST /api/chat/sessions
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "corpus_id": "corpus_123",
  "title": "Session for Paper X",
  "initial_message": "What is this paper about?"
}
```

**Response:**
```typescript
HTTP 201 Created

{
  "success": true,
  "session": {
    "session_id": "session_abc",
    "user_id": "user_123",
    "corpus_id": "corpus_123",
    "title": "Session for Paper X",
    "messages": [],
    "created_at": "2025-01-15T10:40:00Z",
    "updated_at": "2025-01-15T10:40:00Z",
    "message_count": 0
  }
}
```

**Changes from existing:**
- Added `user_id` field (required)
- Added `corpus_id` field (required)
- Sessions now scoped to user + corpus

---

### 16. POST /api/chat/ask (Updated)

**Purpose:** Ask question within corpus context.

**Request:**
```typescript
POST /api/chat/ask
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "session_id": "session_abc",
  "corpus_id": "corpus_123",
  "question": "What is attention mechanism?",
  "retriever": "hybrid",
  "top_k": 5
}
```

**Response:**
```typescript
HTTP 200 OK

{
  "success": true,
  "answer": "The attention mechanism is...",
  "cited_sections": [
    {
      "document_id": "doc_456",
      "document_name": "attention-is-all-you-need.pdf",
      "page": 3,
      "text": "...",
      "confidence": 0.92
    }
  ],
  "session_id": "session_abc",
  "confidence": 0.89
}
```

**Changes from existing:**
- Added `corpus_id` parameter to scope retrieval
- Citations now include `document_id` and `document_name`
- Retrieval scoped to corpus documents only

---

## Error Handling

### Standard Error Response

```typescript
{
  "success": false,
  "message": "Human-readable error message",
  "error_code": "ERROR_CODE",
  "details": {
    // Additional error context
  }
}
```

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PATCH, DELETE |
| 201 | Created | Successful POST (resource created) |
| 400 | Bad Request | Invalid input, validation error |
| 401 | Unauthorized | Missing/invalid authentication |
| 403 | Forbidden | Authenticated but no access |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource already exists (e.g., duplicate email) |
| 413 | Payload Too Large | File size exceeds limit |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_CREDENTIALS` | Wrong email/password |
| `EMAIL_EXISTS` | Email already registered |
| `INVALID_TOKEN` | Expired/malformed JWT |
| `CORPUS_NOT_FOUND` | Corpus doesn't exist |
| `UNAUTHORIZED_ACCESS` | User doesn't own resource |
| `FILE_TOO_LARGE` | Upload exceeds size limit |
| `INVALID_FILE_TYPE` | File is not PDF |
| `RATE_LIMIT_EXCEEDED` | Too many requests |

---

## Authentication Flow

### 1. Initial Authentication
```
Client                    Next.js API              FastAPI Backend
  |                            |                          |
  |-- POST /api/auth/login --->|                          |
  |    { email, password }     |                          |
  |                            |-- POST /api/auth/login -->|
  |                            |                          |
  |                            |<-- { user, tokens } -----|
  |                            |                          |
  |<- Set-Cookie: refresh_token|                          |
  |<- { user, access_token } --|                          |
  |                            |                          |
```

### 2. Authenticated Request
```
Client                    Next.js API              FastAPI Backend
  |                            |                          |
  |-- GET /api/corpus/list --->|                          |
  |   Authorization: Bearer... |                          |
  |                            |-- GET /api/corpus/list ->|
  |                            |   Authorization: Bearer  |
  |                            |                          |
  |                            |<-- { corpora } ----------|
  |<-- { corpora } ------------|                          |
  |                            |                          |
```

### 3. Token Refresh
```
Client                    Next.js API              FastAPI Backend
  |                            |                          |
  |-- POST /api/auth/refresh ->|                          |
  |   Cookie: refresh_token    |                          |
  |                            |-- POST /api/auth/refresh>|
  |                            |   { refresh_token }      |
  |                            |                          |
  |                            |<-- { access_token } -----|
  |<-- { access_token } -------|                          |
  |                            |                          |
```

---

## Rate Limiting

### Implementation

```typescript
// middleware/rate-limit.ts

import { NextRequest } from 'next/server'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(request: NextRequest, limit: number, windowMs: number) {
  const ip = request.ip || 'unknown'
  const now = Date.now()

  const rateLimitInfo = rateLimitMap.get(ip)

  if (!rateLimitInfo || now > rateLimitInfo.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  if (rateLimitInfo.count >= limit) {
    return { allowed: false, retryAfter: rateLimitInfo.resetAt - now }
  }

  rateLimitInfo.count++
  return { allowed: true }
}
```

### Rate Limits by Endpoint

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /api/auth/login | 10 | 1 minute |
| POST /api/auth/signup | 5 | 1 hour |
| POST /api/corpus/create | 20 | 1 hour |
| POST /api/corpus/[id]/upload | 50 | 1 hour |
| POST /api/chat/ask | 100 | 1 hour |
| GET * | 1000 | 1 hour |

---

## Caching Strategy

### Client-Side (Frontend)

```typescript
// Use SWR or React Query for caching

import useSWR from 'swr'

function useCorpora() {
  const { data, error, mutate } = useSWR(
    '/api/corpus/list',
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60000, // 1 minute
    }
  )

  return {
    corpora: data?.corpora,
    isLoading: !error && !data,
    isError: error,
    refresh: mutate
  }
}
```

### Server-Side (Backend)

```python
# Use Redis for caching

from redis import Redis
import json

redis_client = Redis(host='localhost', port=6379, db=0)

@router.get("/api/corpus/list")
async def list_corpora(current_user = Depends(get_current_user)):
    cache_key = f"corpus_list:{current_user['id']}"

    # Try cache first
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # Fetch from database
    corpora = await db.corpus.find({"user_id": current_user["id"]}).to_list()

    # Cache for 5 minutes
    redis_client.setex(cache_key, 300, json.dumps(corpora))

    return {"corpora": corpora}
```

---

## WebSocket Support (Future)

For real-time document processing updates:

```typescript
// WebSocket endpoint for upload progress

WS /api/corpus/upload-progress?document_id=doc_123

// Messages:
{
  "type": "progress",
  "document_id": "doc_123",
  "status": "processing",
  "progress": 45,
  "message": "Extracting text from page 5/10"
}
```

---

**Document Version:** 1.0
**Last Updated:** 2025-11-08
**Status:** Ready for Implementation
