# Authentication & Corpus Management Design

## Overview

This document outlines the architecture for adding user authentication and corpus management features to the LOL-PaperReader application. The design integrates seamlessly with the existing Next.js 15.2.4 + FastAPI + MongoDB stack.

## Executive Summary

**Goals:**
- Implement secure user authentication (login/signup)
- Add multi-user support with session management
- Create a document corpus library for users
- Enable corpus selection and switching
- Maintain backward compatibility with existing PDF reading features

**Technology Stack:**
- **Frontend:** Next.js 15.2.4 App Router, TypeScript, shadcn/ui
- **Backend:** FastAPI (Python), MongoDB
- **Authentication:** JWT tokens + httpOnly cookies
- **State Management:** React Context API (new) + existing hooks pattern

---

## Design Principles

1. **Security First:** JWT tokens with refresh mechanism, httpOnly cookies, CORS protection
2. **User Experience:** Seamless login flow, persistent sessions, minimal friction
3. **Backward Compatibility:** Existing PDFReader components work unchanged
4. **Scalability:** Multi-tenant architecture with user-scoped data
5. **Modularity:** Auth and corpus features are separate, composable modules

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│                                                               │
│  ┌───────────────┐      ┌──────────────────┐                │
│  │  Auth Pages   │      │  Main App Pages  │                │
│  │  /login       │ ───> │  /                │                │
│  │  /signup      │      │  /corpus         │                │
│  └───────────────┘      └──────────────────┘                │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │          Auth Context Provider (Global State)           │ │
│  │  - user: User | null                                    │ │
│  │  - isAuthenticated: boolean                             │ │
│  │  - login(), logout(), refreshToken()                    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │        Corpus Context Provider (Document State)         │ │
│  │  - corpus: Corpus[]                                     │ │
│  │  - activeCorpusId: string | null                        │ │
│  │  - selectCorpus(), fetchCorpora()                       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ API Calls
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Next.js API Routes (Proxy)                  │
│                                                               │
│  /api/auth/login          /api/auth/signup                   │
│  /api/auth/logout         /api/auth/refresh                  │
│  /api/auth/me                                                │
│                                                               │
│  /api/corpus/list         /api/corpus/create                 │
│  /api/corpus/[id]         /api/corpus/[id]/documents         │
│  /api/corpus/[id]/upload                                     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Forward to Backend
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
│                                                               │
│  /api/auth/*              /api/corpus/*                      │
│  - JWT generation         - Document management              │
│  - Password hashing       - Corpus CRUD operations           │
│  - Token validation       - User-scoped queries              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Database Operations
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       MongoDB Atlas                          │
│                                                               │
│  Collections:                                                │
│  - users              (email, password_hash, created_at)     │
│  - corpus             (user_id, name, description, docs[])   │
│  - documents          (corpus_id, file_name, parsed_data)    │
│  - chat_sessions      (user_id, corpus_id, messages)         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## User Flow

### 1. First-Time User
```
1. Land on app → Check auth status → Redirect to /login
2. Click "Sign up" → /signup page
3. Fill form (email, password, name) → Submit
4. Backend creates user → Auto-login → JWT cookie set
5. Redirect to /corpus (corpus management)
6. Create first corpus → Upload documents
7. Select corpus → Navigate to /reader (main app)
```

### 2. Returning User
```
1. Land on app → Check JWT cookie → Valid?
   - Yes: Load user data → /corpus or last viewed page
   - No: Redirect to /login

2. Login → Backend validates → JWT cookie set → /corpus

3. Select corpus from list → Load documents → /reader

4. PDF Reader opens with corpus context
   - Q&A scoped to active corpus
   - Chat sessions linked to user + corpus
```

---

## Authentication Flow Detail

### Login Sequence
```
User submits credentials
  ↓
POST /api/auth/login
  ↓
Next.js → FastAPI /api/auth/login
  ↓
1. Validate email + password
2. Generate access_token (JWT, 15min expiry)
3. Generate refresh_token (JWT, 7 days expiry)
4. Return tokens + user data
  ↓
Next.js sets httpOnly cookie (refresh_token)
  ↓
Frontend stores access_token in memory (AuthContext)
  ↓
Redirect to /corpus
```

### Token Refresh Mechanism
```
API request fails with 401 Unauthorized
  ↓
AuthContext intercepts
  ↓
POST /api/auth/refresh (sends httpOnly cookie)
  ↓
Backend validates refresh_token
  ↓
Return new access_token
  ↓
Retry original request with new token
  ↓
If refresh fails → Logout → Redirect to /login
```

---

## Corpus Management Flow

### Corpus Creation
```
User clicks "New Corpus"
  ↓
Modal opens (name, description)
  ↓
POST /api/corpus/create
  {
    user_id: "current_user_id",
    name: "Research Papers 2024",
    description: "AI/ML papers",
    documents: []
  }
  ↓
Backend creates MongoDB document
  ↓
Frontend updates CorpusContext state
  ↓
Corpus appears in list
```

### Document Upload to Corpus
```
User selects corpus → Clicks "Upload PDF"
  ↓
POST /api/corpus/{corpus_id}/upload
  FormData: { file: PDF }
  ↓
Backend:
  1. Parse PDF (existing pipeline)
  2. Create document record
  3. Link to corpus
  4. Generate embeddings
  5. Store in vector DB
  ↓
Frontend:
  1. Update corpus document list
  2. Show success notification
```

### Corpus Selection
```
User clicks corpus from list
  ↓
CorpusContext.selectCorpus(corpus_id)
  ↓
Fetch documents: GET /api/corpus/{corpus_id}/documents
  ↓
Update state:
  - activeCorpusId = corpus_id
  - documents = fetched documents
  ↓
Navigate to /reader
  ↓
PDFReader loads with corpus context
  - Q&A queries scoped to corpus documents
  - Chat history filtered by corpus_id
```

---

## Data Model

### MongoDB Collections

#### users
```typescript
{
  _id: ObjectId,
  email: string (unique, indexed),
  password_hash: string,
  name: string,
  created_at: DateTime,
  updated_at: DateTime,
  is_active: boolean,
  profile_picture?: string
}
```

#### corpus
```typescript
{
  _id: ObjectId,
  user_id: ObjectId (indexed),
  name: string,
  description?: string,
  created_at: DateTime,
  updated_at: DateTime,
  document_count: number,
  total_size_bytes: number,
  tags?: string[]
}
```

#### documents
```typescript
{
  _id: ObjectId,
  corpus_id: ObjectId (indexed),
  user_id: ObjectId (indexed),
  file_name: string,
  file_size: number,
  file_hash: string (for deduplication),
  uploaded_at: DateTime,
  parsed_data: {
    num_pages: number,
    text_content: string,
    images: Image[],
    metadata: object
  },
  embeddings_generated: boolean,
  status: "uploading" | "processing" | "ready" | "failed"
}
```

#### chat_sessions (updated)
```typescript
{
  _id: ObjectId,
  session_id: string (unique, indexed),
  user_id: ObjectId (indexed) // NEW
  corpus_id: ObjectId (indexed) // NEW
  title?: string,
  messages: Message[],
  created_at: DateTime,
  updated_at: DateTime,
  message_count: number
}
```

---

## Security Considerations

### 1. Authentication Security
- Passwords hashed with bcrypt (cost factor 12)
- JWT access tokens: Short-lived (15 minutes)
- JWT refresh tokens: Long-lived (7 days), httpOnly cookie
- CORS enabled for specific origins only
- Rate limiting on auth endpoints (10 req/min per IP)

### 2. Authorization
- All corpus/document APIs require valid JWT
- User can only access their own corpus/documents
- MongoDB queries include user_id filter
- Backend validates corpus ownership before operations

### 3. Data Protection
- httpOnly cookies prevent XSS token theft
- CSRF tokens on state-changing operations
- SQL injection prevented by MongoDB driver
- File upload validation (file type, size limits)
- Virus scanning on uploaded PDFs (future)

---

## Migration Strategy

### Phase 1: Backend Auth Infrastructure
1. Add user model + auth routes to FastAPI
2. Implement JWT generation/validation
3. Add user_id to existing collections
4. Create migration script for existing data

### Phase 2: Frontend Auth UI
1. Create login/signup pages
2. Implement AuthContext provider
3. Add protected route middleware
4. Update API calls to include auth headers

### Phase 3: Corpus Management Backend
1. Create corpus + documents collections
2. Add corpus CRUD endpoints
3. Link embeddings to corpus
4. Update chat sessions with corpus_id

### Phase 4: Corpus Management Frontend
1. Build corpus list UI
2. Add corpus creation flow
3. Implement document upload to corpus
4. Update PDFReader to use corpus context

### Phase 5: Integration & Testing
1. Connect auth + corpus flows
2. End-to-end testing
3. Performance optimization
4. User acceptance testing

---

## Backward Compatibility

### Handling Existing Data
- Anonymous sessions: Migrate to "guest" user account
- Existing PDFs: Create default "Imported Documents" corpus
- LocalStorage sessions: Preserve with user_id = null until login

### Graceful Degradation
- Guest mode: Allow limited usage without login (optional)
- Offline mode: Cache corpus metadata for offline access
- Legacy API: Keep existing endpoints for gradual migration

---

## Performance Considerations

### Optimization Strategies
1. **Lazy Loading:** Fetch corpus documents only when selected
2. **Pagination:** Limit document lists to 50 items per page
3. **Caching:** Client-side cache for corpus metadata (5 min TTL)
4. **Debouncing:** Search/filter operations debounced (300ms)
5. **Indexing:** MongoDB indexes on user_id, corpus_id, file_hash

### Expected Load
- Users: 1,000 concurrent users (initial)
- Corpus per user: Average 5, max 50
- Documents per corpus: Average 20, max 200
- Chat sessions: Average 10 per corpus

---

## Next Steps

1. Review this design document with team
2. Create detailed API specifications
3. Design database schema migrations
4. Prototype key UI components
5. Set up development environment with auth

---

## Related Documents

- [Component Hierarchy](./component-hierarchy.md)
- [Hooks Architecture](./hooks-architecture.md)
- [API Endpoints Specification](./api-endpoints.md)
- [Data Flow Diagrams](./data-flow-diagram.md)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-08
**Authors:** AI Architecture Team
**Status:** Draft for Review
