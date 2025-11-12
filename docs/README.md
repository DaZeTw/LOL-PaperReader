# Authentication & Corpus Management Design Documentation

## Overview

This directory contains comprehensive design documentation for implementing user authentication and corpus management features in LOL-PaperReader.

---

## Document Index

### 1. [Auth & Corpus Design Overview](./auth-corpus-design.md)
**Purpose:** High-level architecture and design principles

**Contents:**
- Executive summary
- System architecture diagram
- User flows (login, signup, corpus management)
- Data models (MongoDB schemas)
- Security considerations
- Migration strategy
- Performance considerations

**Start here for:** Understanding the overall architecture and design decisions.

---

### 2. [Component Hierarchy](./component-hierarchy.md)
**Purpose:** Detailed React component structure and organization

**Contents:**
- Application layout structure
- Authentication components (LoginPage, SignupPage)
- Corpus management components (CorpusPage, CorpusCard, etc.)
- Navigation components (AppHeader, UserMenu)
- Enhanced PDFReader components
- Component file structure
- Responsive design breakpoints
- Accessibility requirements
- Testing strategy

**Start here for:** Building the UI components and understanding component relationships.

---

### 3. [Hooks Architecture](./hooks-architecture.md)
**Purpose:** Custom React hooks specification

**Contents:**
- `useAuth()` - Authentication state and operations
- `useCorpus()` - Corpus management and selection
- `useProtectedRoute()` - Route protection
- `useSession()` - Enhanced session management
- `useDocumentUpload()` - Document upload with progress
- `useCorpusQuery()` - Q&A scoped to corpus
- Hook dependencies diagram
- Testing hooks
- Performance optimization

**Start here for:** Implementing state management and business logic.

---

### 4. [API Endpoints Specification](./api-endpoints.md)
**Purpose:** Complete API contract for frontend-backend communication

**Contents:**
- Authentication endpoints (login, signup, logout, refresh, etc.)
- Corpus management endpoints (list, create, update, delete)
- Document management endpoints (upload, list, delete)
- Enhanced chat endpoints (sessions, ask)
- Request/response formats
- Error handling
- Rate limiting
- Caching strategy
- WebSocket support (future)

**Start here for:** Implementing API routes and backend services.

---

### 5. [Data Flow & State Dependencies](./data-flow-diagram.md)
**Purpose:** Data flow diagrams and state management architecture

**Contents:**
- Global state architecture
- Authentication flow (login, session persistence, token refresh)
- Corpus management flow (list, create, select, upload)
- Chat session flow (enhanced with corpus context)
- State dependencies graph
- LocalStorage strategy
- Data synchronization
- Error handling flow
- Security considerations

**Start here for:** Understanding how data flows through the application and state dependencies.

---

## Quick Start

### For Developers Implementing Features

1. **Authentication Features:**
   - Read: [Auth & Corpus Design](./auth-corpus-design.md) (Section: Authentication Flow)
   - Read: [Component Hierarchy](./component-hierarchy.md) (Section: Authentication Components)
   - Read: [Hooks Architecture](./hooks-architecture.md) (Section: useAuth Hook)
   - Read: [API Endpoints](./api-endpoints.md) (Section: Authentication Endpoints)
   - Read: [Data Flow](./data-flow-diagram.md) (Section: Authentication Flow)

2. **Corpus Management Features:**
   - Read: [Auth & Corpus Design](./auth-corpus-design.md) (Section: Corpus Management Flow)
   - Read: [Component Hierarchy](./component-hierarchy.md) (Section: Corpus Management Components)
   - Read: [Hooks Architecture](./hooks-architecture.md) (Section: useCorpus Hook)
   - Read: [API Endpoints](./api-endpoints.md) (Section: Corpus Management Endpoints)
   - Read: [Data Flow](./data-flow-diagram.md) (Section: Corpus Management Flow)

3. **Document Upload Features:**
   - Read: [Component Hierarchy](./component-hierarchy.md) (Section: CorpusDocumentList)
   - Read: [Hooks Architecture](./hooks-architecture.md) (Section: useDocumentUpload Hook)
   - Read: [API Endpoints](./api-endpoints.md) (Endpoint: POST /api/corpus/[id]/upload)
   - Read: [Data Flow](./data-flow-diagram.md) (Section: Document Upload Flow)

4. **Enhanced Q&A Features:**
   - Read: [Hooks Architecture](./hooks-architecture.md) (Section: useSession, useCorpusQuery)
   - Read: [API Endpoints](./api-endpoints.md) (Section: Enhanced Chat Endpoints)
   - Read: [Data Flow](./data-flow-diagram.md) (Section: Chat Session Flow)

---

## Implementation Phases

### Phase 1: Backend Auth Infrastructure (Week 1-2)
**Deliverables:**
- User model and authentication routes in FastAPI
- JWT generation and validation middleware
- Password hashing with bcrypt
- MongoDB user collection setup
- Basic auth endpoints (login, signup, logout, refresh, me)

**Documents to reference:**
- [Auth & Corpus Design](./auth-corpus-design.md) - Data Model section
- [API Endpoints](./api-endpoints.md) - Authentication Endpoints section

---

### Phase 2: Frontend Auth UI (Week 2-3)
**Deliverables:**
- Login and signup pages
- AuthProvider context implementation
- Protected route middleware
- User menu component
- Token refresh logic

**Documents to reference:**
- [Component Hierarchy](./component-hierarchy.md) - Authentication Components
- [Hooks Architecture](./hooks-architecture.md) - useAuth, useProtectedRoute
- [Data Flow](./data-flow-diagram.md) - Authentication Flow

---

### Phase 3: Corpus Management Backend (Week 3-4)
**Deliverables:**
- Corpus and documents collections in MongoDB
- Corpus CRUD endpoints
- Document upload endpoint
- File storage integration
- User-scoped queries

**Documents to reference:**
- [Auth & Corpus Design](./auth-corpus-design.md) - Data Model section
- [API Endpoints](./api-endpoints.md) - Corpus Management Endpoints

---

### Phase 4: Corpus Management Frontend (Week 4-5)
**Deliverables:**
- Corpus list page
- Corpus creation dialog
- Corpus card component
- Document upload UI
- Corpus selection logic

**Documents to reference:**
- [Component Hierarchy](./component-hierarchy.md) - Corpus Management Components
- [Hooks Architecture](./hooks-architecture.md) - useCorpus, useDocumentUpload
- [Data Flow](./data-flow-diagram.md) - Corpus Management Flow

---

### Phase 5: Integration & Testing (Week 5-6)
**Deliverables:**
- Connect auth + corpus flows
- Update existing PDFReader to use corpus context
- Update chat sessions to include user_id and corpus_id
- End-to-end testing
- Performance optimization
- Security audit

**Documents to reference:**
- All documents for comprehensive testing
- [Data Flow](./data-flow-diagram.md) - Complete flow verification

---

## Technology Stack

### Frontend
- **Framework:** Next.js 15.2.4 (App Router)
- **Language:** TypeScript 5.9.3
- **Styling:** Tailwind CSS v4.1.9
- **UI Library:** shadcn/ui (Radix UI components)
- **State Management:** React Context API
- **HTTP Client:** Fetch API
- **Form Handling:** react-hook-form (recommended)
- **Validation:** Zod (recommended)

### Backend
- **Framework:** FastAPI (Python)
- **Database:** MongoDB Atlas
- **Authentication:** JWT tokens
- **Password Hashing:** bcrypt
- **File Storage:** Local filesystem (configurable to S3/GCS)
- **Embeddings:** Visualized BGE
- **LLM:** OpenAI GPT-4

### Infrastructure
- **Deployment:** Docker Compose
- **Reverse Proxy:** Nginx (optional)
- **Monitoring:** (TBD)
- **Logging:** (TBD)

---

## Key Design Decisions

### 1. Why React Context API instead of Redux/Zustand?
- **Reasoning:** Existing codebase uses hooks pattern without external state libraries
- **Benefits:** Less dependency overhead, simpler learning curve, sufficient for current scope
- **Trade-off:** May need refactoring if app becomes very complex

### 2. Why JWT + httpOnly cookies?
- **Reasoning:** Balance between security and convenience
- **Benefits:**
  - Access tokens in memory (XSS protection)
  - Refresh tokens in httpOnly cookies (CSRF protection)
  - Automatic cookie sending
- **Trade-off:** Requires CSRF protection

### 3. Why separate Corpus concept?
- **Reasoning:** Enable users to organize documents into collections
- **Benefits:**
  - Better organization for users with many documents
  - Scoped Q&A (only search within corpus)
  - Future sharing/collaboration features
- **Trade-off:** Additional complexity in data model

### 4. Why MongoDB over PostgreSQL?
- **Reasoning:** Existing backend already uses MongoDB
- **Benefits:**
  - Consistent with current architecture
  - Flexible schema for documents
  - Easy nested structures (messages array in sessions)
- **Trade-off:** No ACID guarantees for complex transactions

---

## Security Best Practices

### Authentication
- ✅ Passwords hashed with bcrypt (cost factor 12)
- ✅ JWT access tokens: Short-lived (15 minutes)
- ✅ JWT refresh tokens: Long-lived (7 days), httpOnly cookie
- ✅ CORS enabled for specific origins only
- ✅ Rate limiting on auth endpoints

### Authorization
- ✅ All corpus/document APIs require valid JWT
- ✅ User can only access their own data
- ✅ Backend validates ownership before operations
- ✅ MongoDB queries include user_id filter

### Data Protection
- ✅ httpOnly cookies prevent XSS token theft
- ✅ CSRF tokens on state-changing operations
- ✅ File upload validation (type, size)
- ✅ Input sanitization
- 🔲 Virus scanning (future enhancement)

---

## Testing Strategy

### Unit Tests
- **Components:** Jest + React Testing Library
- **Hooks:** renderHook + act
- **API Routes:** Next.js API mocking
- **Backend:** pytest

### Integration Tests
- **User flows:** Cypress or Playwright
- **API integration:** Supertest or httpx
- **Database:** MongoDB in-memory server

### E2E Tests
- Login flow
- Corpus creation flow
- Document upload flow
- Q&A with corpus context

---

## Performance Targets

### Frontend
- **Initial Load:** < 2 seconds
- **Corpus List Load:** < 500ms
- **Document Upload:** Progress feedback within 100ms
- **Q&A Response:** < 5 seconds (first query), < 3 seconds (subsequent)

### Backend
- **Auth Endpoints:** < 200ms
- **Corpus CRUD:** < 300ms
- **Document Upload:** < 1 second (file save), background processing
- **Q&A Retrieval:** < 2 seconds (hybrid search)

---

## Migration from Current System

### Existing Data
- **Anonymous Sessions:**
  - Create a "guest" user account
  - Migrate sessions to guest user
  - Option to claim sessions on signup/login

- **Existing PDFs:**
  - Create default "Imported Documents" corpus per user
  - Move PDFs to this corpus
  - Preserve all metadata and chat history

### Backward Compatibility
- Keep existing API endpoints operational during migration
- Gradual rollout: Auth optional → Auth encouraged → Auth required
- Data migration script with rollback capability

---

## Future Enhancements

### Short-term (3-6 months)
- [ ] Password reset flow
- [ ] Email verification
- [ ] Profile picture upload
- [ ] Corpus sharing (read-only)
- [ ] Document tagging and search
- [ ] Export chat history

### Medium-term (6-12 months)
- [ ] Multi-user collaboration
- [ ] Real-time document processing status (WebSocket)
- [ ] Advanced search across corpus
- [ ] Document versioning
- [ ] OAuth providers (Google, GitHub)

### Long-term (12+ months)
- [ ] Team workspaces
- [ ] Role-based access control (RBAC)
- [ ] API rate limiting per user tier
- [ ] Usage analytics dashboard
- [ ] Mobile apps (React Native)

---

## Contributing to This Documentation

### Adding New Documents
1. Create markdown file in `docs/` directory
2. Follow existing format and structure
3. Add entry to this README index
4. Update related documents with cross-references

### Updating Existing Documents
1. Increment version number in document footer
2. Update "Last Updated" date
3. Add changelog entry if significant changes
4. Review cross-references in other documents

---

## Questions & Support

### For Design Questions
- Review all documents in this directory
- Check [Existing Codebase Documentation](../README.md)
- Contact: Architecture team

### For Implementation Questions
- Reference specific document sections
- Check code comments in implementation
- Open discussion in team chat

---

## Changelog

### Version 1.0 (2025-11-08)
- Initial design documentation
- Complete architecture specification
- Component hierarchy defined
- Hooks architecture documented
- API endpoints specified
- Data flow diagrams created

---

**Documentation Version:** 1.0
**Last Updated:** 2025-11-08
**Status:** Ready for Review & Implementation
**Authors:** AI Architecture Team
