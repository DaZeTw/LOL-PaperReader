# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LOL-PaperReader is a full-stack academic PDF analysis platform that combines a Next.js 15 frontend with a FastAPI backend for intelligent document processing and AI-powered Q&A over research papers.

## Development Commands

### Frontend (Next.js)
```bash
npm run dev           # Start dev server on http://localhost:3000
npm run build         # Production build
npm run lint          # Run ESLint
npm start             # Start production server
```

### Backend (Python/FastAPI)
```bash
cd backend
python -m uvicorn src.paperreader.main:app --reload --host 0.0.0.0 --port 8000
```

### Docker (Full Stack)
```bash
docker compose build                    # Build all containers
docker compose up -d                    # Start services in detached mode
docker compose logs python-backend      # View backend logs
docker compose down                     # Stop all services
```

**Important:** Wait for "✅ Model preloading completed!" message in backend logs before uploading PDFs.

## Architecture Overview

### Frontend Architecture (Next.js 15 + React 18)

**Multi-tab PDF Management Flow:**
- `components/pdf-workspace.tsx` - Main shell managing multiple PDF tabs with stable counter-based IDs (`tab-${++counter}`)
- `components/pdf-reader.tsx` - Single PDF session with page navigation and annotation state
- `components/qa-interface.tsx` - Chat sidebar with citation references and real-time embedding progress
- `components/pdf-upload.tsx` - Drag-and-drop interface with fire-and-forget processing

**Authentication:**
- `auth.ts` - NextAuth with Google OAuth provider
- Session callbacks add user ID to JWT tokens
- Frontend guards file upload functionality behind authentication

**Custom React Hooks:**
- `hooks/useQASession.tsx` - Session lifecycle with localStorage persistence and exponential backoff retry
- `hooks/useQAMessages.tsx` - Message history management
- `hooks/usePipelineStatus.ts` - Polls `/api/qa/status` every 2s for embedding progress
- `hooks/useQAActions.tsx` - Submits questions to `/api/chat/message`

### Backend Architecture (FastAPI + Python)

**Entry Point:**
- `backend/src/paperreader/main.py` - FastAPI factory with CORS middleware, startup model preloading, and route registration

**API Routes:**
- `api/pdf_routes.py` - PDF upload (`/api/pdf/save-and-parse/`) and status endpoints
- `api/routes.py` - QA endpoints (`/api/qa/ask`, `/api/qa/benchmark`) with retriever/generator options
- `api/chat_routes.py` - Session CRUD and chat message handling (1088 lines)

**Core Services:**
- `services/parser/pdf_parser_pymupdf.py` - PyMuPDF extraction to markdown with image references
- `services/qa/embeddings.py` - VisualizedBGEEmbedder singleton (BAAI/bge-m3 with optional visual weights)
- `services/qa/pipeline.py` - Orchestrates: Load → Chunk → Embed → Retrieve → Generate
- `services/qa/chunking.py` - Semantic text chunking (~500 tokens) with section metadata preservation
- `services/qa/retrievers.py` - Keyword (BM25), Dense (vectors), Hybrid (RRF fusion)
- `services/qa/generators.py` - OpenAI integration with citation extraction

### Frontend-Backend Communication

**Next.js API Routes (Proxy Layer):**
- `app/api/pdf/upload/route.ts` - Forwards PDFs to backend `/api/pdf/save-and-parse/`
- `app/api/qa/status/route.ts` - Polls backend for pipeline status (building/ready/percent)

**Environment Variables:**
- Frontend: `BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL` (defaults to http://backend:8000 in Docker)
- Backend: `OPENAI_API_KEY` (required), `VISUAL_BGE_WEIGHTS` (optional path to Visualized_m3.pth)

## Critical Data Flows

### PDF Upload & Embedding (Fire-and-Forget Pattern)
1. User selects PDF → `PDFUpload` creates tab and shows viewer immediately
2. Background: `fetch("/api/pdf/upload")` → Backend parses PDF (PyMuPDF) → Extracts markdown/images
3. Pipeline auto-builds: Chunk → Embed (takes ~500s for 20-page PDF) → Vector store
4. `usePipelineStatus` polls every 2s, displays progress bar in sidebar
5. When `ready=true`, QA input is enabled

**Important:** Do NOT reload page or re-upload during 500s embedding process. It runs in background and will complete.

### Question Answering Flow
1. User submits question → `QAInterface` POSTs to `/api/chat/message`
2. Backend adds message to session, calls `/api/qa/ask`
3. QA Pipeline: Hybrid retrieval (BM25 + dense vectors via RRF) → OpenAI generation → Citation extraction
4. Frontend stores in localStorage, displays with formatted citations and page references

### Session Management (localStorage + Backend Persistence)
- Storage keys: `chat_session_{fileName}_{tabId}`, `chat_messages_{fileName}_{tabId}`
- On tab creation: Check localStorage → If no session ID, POST `/api/chat/sessions` to create
- Load existing messages from backend on mount
- On clear: DELETE session from backend, clear localStorage

## Key Architectural Patterns

**Stable Tab IDs:** Counter-based generation ensures IDs are immutable across re-renders, preventing state loss.

**MD5 Caching:** Pipeline caches embeddings by MD5 hash of parsed data in `.pipeline_cache/` to prevent re-embedding identical PDFs.

**State Reset Logic:** PDF reader state only resets on actual file change (not visibility toggles). Check `file` prop change, not component mount.

**Error Handling:** Session creation uses exponential backoff for 504/503 errors (max 2 retries, 5s delay cap).

**Unique Sessions:** Each PDF+tab combination gets unique session to prevent cross-contamination of chat history.

## Environment Configuration

### Frontend (.env)
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_URL=http://localhost:3000
AUTH_SECRET=change-this-secret-key-in-production
```

### Backend (.env)
```
OPENAI_API_KEY=sk-...
VISUAL_BGE_WEIGHTS=backend/src/Visualized_m3.pth  # Optional for visual embeddings
```

### Default Pipeline Configuration
Located in `backend/src/paperreader/services/qa/config.py`:
- `data_dir`: "./parsed_data"
- `retriever`: "hybrid" (keyword+dense)
- `generator`: "openai"
- `top_k`: 5
- `max_tokens`: 512

## Performance Characteristics

- PDF embedding: ~500 seconds for 20-page document (one-time per PDF)
- Vector search: ~100-500ms per query
- OpenAI generation: 2-5 seconds per response
- Caching: MD5-based prevents duplicate embedding work

## Security Notes

**Current State:**
- Frontend: Google OAuth via NextAuth
- Backend: No authentication (trusts frontend)
- Storage: localStorage for session persistence

**Production Recommendations:**
- Add backend authentication/authorization
- Implement rate limiting on QA endpoints
- Restrict CORS to specific frontend origin
- Add session isolation and encryption
- Validate all file uploads for malicious content

## Key Dependencies

**Frontend:** next 15.2.4, react 18.2.0, next-auth 5.0.0, @react-pdf-viewer, @radix-ui components, tailwindcss, zod, sonner

**Backend:** fastapi, torch, pymupdf, openai, sentence-transformers, numpy

## Visual Embeddings Setup

1. Download BGE-Visualized model: https://huggingface.co/BAAI/bge-visualized/resolve/main/Visualized_m3.pth
2. Place at `backend/src/Visualized_m3.pth`
3. Backend will auto-detect and use for enhanced visual understanding of PDFs
