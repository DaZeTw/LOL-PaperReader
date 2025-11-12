# Data Flow & State Dependencies

## Overview

This document visualizes the complete data flow and state management architecture for authentication and corpus management in LOL-PaperReader.

---

## Global State Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Application Root                          │
│                   (app/layout.tsx)                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Wraps entire app
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    AuthProvider                              │
│  State:                                                      │
│    - user: User | null                                       │
│    - isAuthenticated: boolean                                │
│    - isLoading: boolean                                      │
│                                                              │
│  Actions:                                                    │
│    - login(email, password)                                  │
│    - signup(name, email, password)                           │
│    - logout()                                                │
│    - refreshToken()                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Nested provider
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  CorpusProvider                              │
│  State:                                                      │
│    - corpora: Corpus[]                                       │
│    - activeCorpus: Corpus | null                             │
│    - activeCorpusDocuments: Document[]                       │
│    - isLoading: boolean                                      │
│                                                              │
│  Actions:                                                    │
│    - fetchCorpora()                                          │
│    - selectCorpus(corpusId)                                  │
│    - createCorpus(data)                                      │
│    - updateCorpus(corpusId, data)                            │
│    - deleteCorpus(corpusId)                                  │
│    - fetchDocuments(corpusId)                                │
│                                                              │
│  Dependencies: useAuth()                                     │
│    - Clears state when user logs out                         │
│    - Fetches corpora when user logs in                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Provides context to
                            ↓
                    ┌───────────────┐
                    │  Page Routes  │
                    └───────────────┘
```

---

## Authentication Flow

### 1. Login Flow

```
┌──────────────┐
│  User enters │
│ credentials  │
└──────┬───────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  LoginForm Component                                         │
│  1. Validate input (email format, password not empty)        │
│  2. Call useAuth().login(email, password)                    │
└─────────────────────────────────────────────────────────────┘
       │
       │ Async call
       ↓
┌─────────────────────────────────────────────────────────────┐
│  AuthContext.login()                                         │
│  1. setIsLoading(true)                                       │
│  2. POST /api/auth/login                                     │
│  3. Store access_token in memory (context state)             │
│  4. Cookie with refresh_token set automatically              │
│  5. setUser(userData)                                        │
│  6. setIsAuthenticated(true)                                 │
│  7. setIsLoading(false)                                      │
│  8. router.push('/corpus')                                   │
└─────────────────────────────────────────────────────────────┘
       │
       │ Success
       ↓
┌─────────────────────────────────────────────────────────────┐
│  CorpusProvider useEffect                                    │
│  Detects: isAuthenticated changed to true                    │
│  Action: Calls fetchCorpora()                                │
└─────────────────────────────────────────────────────────────┘
       │
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Redirect to /corpus                                         │
│  - User is authenticated                                     │
│  - Corpora loaded                                            │
│  - Ready to select corpus                                    │
└─────────────────────────────────────────────────────────────┘
```

### 2. Session Persistence Flow

```
┌─────────────────────────────────────────────────────────────┐
│  User visits app (page refresh or new session)               │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  AuthProvider useEffect (mount)                              │
│  1. setIsLoading(true)                                       │
│  2. GET /api/auth/me (includes httpOnly cookie)              │
│  3. If 200 OK:                                               │
│       - setUser(userData)                                    │
│       - setIsAuthenticated(true)                             │
│     If 401 Unauthorized:                                     │
│       - Try POST /api/auth/refresh                           │
│       - If success: retry GET /api/auth/me                   │
│       - If fail: setUser(null), redirect to /login           │
│  4. setIsLoading(false)                                      │
└─────────────────────────────────────────────────────────────┘
       │
       ├─── Authenticated ────→ Load app normally
       │
       └─── Not Authenticated → Redirect to /login
```

### 3. Token Refresh Flow

```
┌─────────────────────────────────────────────────────────────┐
│  API Request (e.g., GET /api/corpus/list)                    │
│  Authorization: Bearer <access_token>                        │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Response: 401 Unauthorized                                  │
│  { error_code: "TOKEN_EXPIRED" }                             │
└─────────────────────────────────────────────────────────────┘
       │
       │ Intercepted by AuthContext
       ↓
┌─────────────────────────────────────────────────────────────┐
│  AuthContext.refreshToken()                                  │
│  1. POST /api/auth/refresh (sends httpOnly cookie)           │
│  2. Backend validates refresh_token                          │
│  3. Returns new access_token                                 │
│  4. Update access_token in context state                     │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Retry original request with new access_token                │
│  GET /api/corpus/list                                        │
│  Authorization: Bearer <new_access_token>                    │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Success: Return data to component                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Corpus Management Flow

### 1. Corpus List Loading

```
┌─────────────────────────────────────────────────────────────┐
│  User navigates to /corpus                                   │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  CorpusPage Component                                        │
│  1. useProtectedRoute() - ensures auth                       │
│  2. const { corpora, isLoading } = useCorpus()               │
│  3. Render loading state or corpus grid                      │
└─────────────────────────────────────────────────────────────┘
       │
       │ useCorpus hook
       ↓
┌─────────────────────────────────────────────────────────────┐
│  CorpusProvider state                                        │
│  - corpora: [] (initially empty)                             │
│  - isLoading: true                                           │
│                                                              │
│  useEffect triggered by isAuthenticated = true               │
│  Calls: fetchCorpora()                                       │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  fetchCorpora()                                              │
│  1. GET /api/corpus/list                                     │
│  2. Backend queries MongoDB:                                 │
│     db.corpus.find({ user_id: currentUser.id })              │
│  3. Returns corpus array                                     │
│  4. setCorpora(data.corpora)                                 │
│  5. setIsLoading(false)                                      │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Component re-renders with corpora data                      │
│  Displays: CorpusGrid with CorpusCard[] components           │
└─────────────────────────────────────────────────────────────┘
```

### 2. Corpus Creation Flow

```
┌─────────────────────────────────────────────────────────────┐
│  User clicks "New Corpus" button                             │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  NewCorpusDialog opens                                       │
│  User fills form:                                            │
│    - name: "AI Research Papers"                              │
│    - description: "Collection of AI/ML papers"               │
│    - tags: ["ai", "machine-learning"]                        │
└─────────────────────────────────────────────────────────────┘
       │
       │ Submit
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Form validation                                             │
│  - name: required, 1-100 chars                               │
│  - description: max 500 chars                                │
│  - tags: max 10 items                                        │
└─────────────────────────────────────────────────────────────┘
       │
       │ Valid
       ↓
┌─────────────────────────────────────────────────────────────┐
│  const { createCorpus } = useCorpus()                        │
│  await createCorpus({ name, description, tags })             │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  CorpusContext.createCorpus()                                │
│  1. setIsLoading(true)                                       │
│  2. POST /api/corpus/create                                  │
│  3. Backend creates MongoDB document                         │
│  4. Returns new corpus                                       │
│  5. setCorpora([...corpora, newCorpus])                      │
│  6. setActiveCorpus(newCorpus)                               │
│  7. localStorage.setItem('active_corpus_id', newCorpus.id)   │
│  8. setIsLoading(false)                                      │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  UI updates                                                  │
│  1. Dialog closes                                            │
│  2. New corpus card appears in grid                          │
│  3. Toast notification: "Corpus created successfully"        │
└─────────────────────────────────────────────────────────────┘
```

### 3. Corpus Selection Flow

```
┌─────────────────────────────────────────────────────────────┐
│  User clicks "Open" on CorpusCard                            │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  onClick handler                                             │
│  const { selectCorpus } = useCorpus()                        │
│  await selectCorpus(corpus.id)                               │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  CorpusContext.selectCorpus(corpusId)                        │
│  1. setIsLoading(true)                                       │
│  2. GET /api/corpus/{corpusId}                               │
│  3. setActiveCorpus(corpusData)                              │
│  4. localStorage.setItem('active_corpus_id', corpusId)       │
│  5. Call fetchDocuments(corpusId)                            │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  fetchDocuments(corpusId)                                    │
│  1. GET /api/corpus/{corpusId}/documents                     │
│  2. Backend queries:                                         │
│     db.documents.find({ corpus_id: corpusId })               │
│  3. setActiveCorpusDocuments(documents)                      │
│  4. setIsLoading(false)                                      │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Navigate to corpus detail or reader                         │
│  router.push('/reader')                                      │
└─────────────────────────────────────────────────────────────┘
```

### 4. Document Upload Flow

```
┌─────────────────────────────────────────────────────────────┐
│  User selects PDF file in upload dialog                      │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  File validation                                             │
│  - Type: must be application/pdf                             │
│  - Size: max 50MB                                            │
└─────────────────────────────────────────────────────────────┘
       │
       │ Valid
       ↓
┌─────────────────────────────────────────────────────────────┐
│  const { upload, uploadProgress } = useDocumentUpload()      │
│  await upload(file)                                          │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Upload with progress tracking                               │
│  1. Create FormData with file                                │
│  2. XMLHttpRequest with progress events                      │
│  3. POST /api/corpus/{corpusId}/upload                       │
│                                                              │
│  Progress updates:                                           │
│    0%  → "Uploading..."                                      │
│    50% → "Uploading: 50%"                                    │
│    100%→ "Processing document..."                            │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Backend processing                                          │
│  1. Save file to storage                                     │
│  2. Create document record in MongoDB                        │
│     status: "processing"                                     │
│  3. Background job:                                          │
│     - Parse PDF (text, images, metadata)                     │
│     - Generate embeddings                                    │
│     - Update status: "ready"                                 │
│  4. Return 201 Created                                       │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Frontend updates                                            │
│  1. Call fetchDocuments(activeCorpus.id)                     │
│  2. Document list refreshes                                  │
│  3. New document appears with status "processing"            │
│  4. Toast: "Document uploaded successfully"                  │
│  5. Reset upload dialog                                      │
└─────────────────────────────────────────────────────────────┘
       │
       │ Background (polling or WebSocket)
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Document processing completes                               │
│  1. Status updates to "ready"                                │
│  2. Frontend polls or receives WebSocket event               │
│  3. Document card updates to show "ready" status             │
│  4. User can now open document in reader                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Chat Session Flow (Enhanced)

### Session Creation with Corpus Context

```
┌─────────────────────────────────────────────────────────────┐
│  User opens PDFReader with corpus context                    │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  QAInterface Component                                       │
│  const { session } = useSession({ documentName })            │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  useSession hook (mount)                                     │
│  1. Check localStorage for session_id                        │
│     key: chat_session_{corpusId}_{documentName}              │
│  2. If found:                                                │
│     - verifySession(sessionId)                               │
│     - GET /api/chat/sessions?session_id={id}                 │
│     - If valid: setSession(data)                             │
│     - If invalid: createSession()                            │
│  3. If not found:                                            │
│     - createSession()                                        │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  createSession()                                             │
│  1. POST /api/chat/sessions                                  │
│     {                                                        │
│       user_id: user.id,                                      │
│       corpus_id: activeCorpus.id,                            │
│       title: "Session for {documentName}"                    │
│     }                                                        │
│  2. Backend creates MongoDB document                         │
│  3. setSession(newSession)                                   │
│  4. localStorage.setItem(storageKey, session_id)             │
└─────────────────────────────────────────────────────────────┘
```

### Q&A Query with Corpus Scoping

```
┌─────────────────────────────────────────────────────────────┐
│  User types question and clicks "Ask"                        │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  QAInterface handler                                         │
│  const { ask } = useCorpusQuery()                            │
│  await ask(question)                                         │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  useCorpusQuery.ask()                                        │
│  1. addMessage({ role: 'user', content: question })          │
│     (optimistic update - shows immediately)                  │
│  2. POST /api/chat/ask                                       │
│     {                                                        │
│       session_id,                                            │
│       corpus_id: activeCorpus.id,                            │
│       question,                                              │
│       retriever: "hybrid",                                   │
│       top_k: 5                                               │
│     }                                                        │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Backend RAG Pipeline                                        │
│  1. Query embeddings for corpus documents only               │
│     db.embeddings.find({ corpus_id: corpusId })              │
│  2. Hybrid retrieval (dense + sparse)                        │
│  3. Retrieve top_k relevant sections                         │
│  4. Generate answer with LLM                                 │
│  5. Save message to session                                  │
│     db.chat_sessions.updateOne(                              │
│       { session_id },                                        │
│       { $push: { messages: [userMsg, assistantMsg] } }       │
│     )                                                        │
│  6. Return answer + cited_sections                           │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Frontend receives response                                  │
│  1. addMessage({                                             │
│      role: 'assistant',                                      │
│      content: answer,                                        │
│      cited_sections                                          │
│    })                                                        │
│  2. UI updates with answer and citations                     │
│  3. Citations link to specific documents in corpus           │
└─────────────────────────────────────────────────────────────┘
```

---

## State Dependencies Graph

```
AuthProvider (independent)
  │
  ├─→ user
  │   └─→ Used by: CorpusProvider, useSession, all protected pages
  │
  └─→ isAuthenticated
      └─→ Triggers: CorpusProvider.fetchCorpora(), route guards

CorpusProvider (depends on AuthProvider)
  │
  ├─→ corpora
  │   └─→ Used by: CorpusPage, CorpusGrid, CorpusSelector
  │
  ├─→ activeCorpus
  │   ├─→ Used by: PDFReader, QAInterface, useSession
  │   └─→ Triggers: fetchDocuments(), session creation
  │
  └─→ activeCorpusDocuments
      └─→ Used by: CorpusDocumentList, DocumentSelector

useSession (depends on AuthProvider + CorpusProvider)
  │
  ├─→ session
  │   └─→ Used by: QAInterface, useCorpusQuery
  │
  └─→ messages
      └─→ Used by: MessageList, ChatHistory

useCorpusQuery (depends on useSession + CorpusProvider)
  │
  └─→ ask()
      └─→ Sends: session_id, corpus_id to backend
```

---

## LocalStorage Strategy

### Stored Data

```typescript
// Auth
localStorage.getItem('access_token')  // ❌ NO - stored in memory only
localStorage.getItem('refresh_token') // ❌ NO - httpOnly cookie only

// Corpus
localStorage.getItem('active_corpus_id')  // ✅ YES - restore active corpus
localStorage.getItem('corpus_view_mode')  // ✅ YES - grid/list preference

// Session
localStorage.getItem('chat_session_{corpusId}_{documentName}')  // ✅ YES
localStorage.getItem('chat_messages_{corpusId}_{documentName}') // ✅ YES - cache messages

// UI Preferences
localStorage.getItem('theme')              // ✅ YES - dark/light mode
localStorage.getItem('sidebar_collapsed')  // ✅ YES - UI state
```

### Storage Limits

- Max size: 5MB per domain
- Clear on logout: session-specific data
- Preserve on logout: UI preferences

---

## Data Synchronization

### Optimistic Updates

```typescript
// Example: Creating corpus
const createCorpus = async (data) => {
  // 1. Optimistic update (immediate UI feedback)
  const tempCorpus = { id: 'temp', ...data, status: 'creating' }
  setCorpora([...corpora, tempCorpus])

  try {
    // 2. API call
    const response = await fetch('/api/corpus/create', {...})
    const newCorpus = await response.json()

    // 3. Replace temp with real data
    setCorpora(corpora.map(c =>
      c.id === 'temp' ? newCorpus : c
    ))
  } catch (err) {
    // 4. Rollback on error
    setCorpora(corpora.filter(c => c.id !== 'temp'))
    throw err
  }
}
```

### Real-time Updates (Future)

```typescript
// WebSocket connection for real-time updates
const ws = new WebSocket('ws://backend/updates')

ws.onmessage = (event) => {
  const update = JSON.parse(event.data)

  switch (update.type) {
    case 'document_processed':
      // Update document status in real-time
      updateDocument(update.document_id, { status: 'ready' })
      break

    case 'corpus_shared':
      // Add shared corpus to list
      addCorpus(update.corpus)
      break
  }
}
```

---

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────┐
│  API call fails (network error, 500, etc.)                   │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Context/Hook catch block                                    │
│  1. setError(errorMessage)                                   │
│  2. setIsLoading(false)                                      │
│  3. Rollback optimistic updates (if any)                     │
└─────────────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Component error handling                                    │
│  1. Display error via toast notification                     │
│  2. Show inline error message                                │
│  3. Retry button (for transient errors)                      │
└─────────────────────────────────────────────────────────────┘
       │
       │ Special case: 401 Unauthorized
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Auto-refresh token                                          │
│  1. Attempt POST /api/auth/refresh                           │
│  2. If success: retry original request                       │
│  3. If fail: logout user, redirect to /login                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Performance Optimizations

### 1. Lazy Loading

```typescript
// Load documents only when corpus is selected
const selectCorpus = async (corpusId) => {
  setActiveCorpus(corpora.find(c => c.id === corpusId))

  // Lazy load documents (not loaded until needed)
  if (!documentsCache.has(corpusId)) {
    const docs = await fetchDocuments(corpusId)
    documentsCache.set(corpusId, docs)
  }
}
```

### 2. Debouncing

```typescript
// Debounce search queries
const searchDocuments = useMemo(
  () => debounce((query: string) => {
    setSearchQuery(query)
    // Triggers re-filter of documents
  }, 300),
  []
)
```

### 3. Memoization

```typescript
// Memoize expensive computations
const sortedDocuments = useMemo(() => {
  return documents.sort((a, b) =>
    b.uploaded_at.localeCompare(a.uploaded_at)
  )
}, [documents])
```

### 4. Code Splitting

```typescript
// Lazy load heavy components
const PDFReader = dynamic(() => import('@/components/pdf-reader'), {
  loading: () => <PDFReaderSkeleton />,
  ssr: false
})
```

---

## Security Considerations in Data Flow

### 1. Token Security
- Access tokens: Stored in memory (React context) only
- Refresh tokens: httpOnly cookies (not accessible to JS)
- Never store tokens in localStorage

### 2. CSRF Protection
```typescript
// Include CSRF token in state-changing requests
fetch('/api/corpus/create', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': getCsrfToken(),
    'Content-Type': 'application/json'
  }
})
```

### 3. Authorization Checks
- Frontend: Check user permissions before showing UI
- Backend: Always validate ownership on server

---

**Document Version:** 1.0
**Last Updated:** 2025-11-08
**Status:** Ready for Implementation
