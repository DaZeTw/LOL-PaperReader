## LOL PaperReader API — Remaining Endpoints (v0.1.0)

FastAPI backend for parsing and querying academic PDFs and QA RAG features.

### System

- GET `/health`
  - Purpose: Simple health check.
  - Response: `{ status: "ok" }`

- GET `/`
  - Purpose: Root endpoint.
  - Response: `{ message: "Welcome to LOL PaperReader Backend 🚀" }`

---

### PDF

- POST `/api/pdf/upload-and-parse/`
  - Purpose: Upload one PDF, parse, copy outputs (markdown/images) into `data_dir`, then attempt to build the QA pipeline immediately.
  - Request: `multipart/form-data` with `file` (PDF)
  - Response example:
    - `{ status: "ok", outputs: { markdown_embedded: string, page_images: string[], figures: string[] } }`

- GET `/api/pdf/status`
  - Purpose: Check QA pipeline readiness and progress.
  - Request: none
  - Response example:
    - `{ building: boolean, ready: boolean, has_cache?: boolean, chunks?: number, error?: string }`

- POST `/api/pdf/save-and-parse/`
  - Purpose: Upload multiple PDFs, persist to `data_dir/uploads`, parse, copy outputs into `data_dir`, and build pipeline.
  - Request: `multipart/form-data` with `files` (array of PDFs)
  - Response example:
    - `{ status: "ok", count: number, results: [{ pdf: string, outputs: { ... } }] }`

- POST `/api/pdf/parse-uploads-folder/`
  - Purpose: Parse all PDFs already present in `data_dir/uploads` and (re)build the pipeline.
  - Request: none
  - Response example:
    - `{ status: "ok", count: number, results: [{ pdf: string, outputs: { ... } }] }`

---

### QA

- POST `/api/qa/ask`
  - Purpose: Ask a question using the QA pipeline (retriever + generator), optionally with user images.
  - Request (JSON):
    - `{ question: string, retriever?: "keyword"|"dense"|"hybrid", generator?: "openai"|"ollama"|"extractive", image_policy?: "none"|"auto"|"all", top_k?: number, max_tokens?: number, user_images?: string[] }`
  - Response (JSON):
    - `{ question: string, answer: string, cited_sections: any[], retriever_scores: any[] }`

- POST `/api/qa/ask-with-upload`
  - Purpose: Ask a question with image uploads (multipart/form-data).
  - Request: `question`, `retriever?`, `generator?`, `image_policy?`, `top_k?`, `max_tokens?`, `images?` (files)
  - Response: Same shape as `/api/qa/ask`

- POST `/api/qa/benchmark`
  - Purpose: Run a benchmark over a set of questions using a specified retriever/generator.
  - Request (JSON):
    - `{ questions: string[], retriever?: "keyword"|"dense"|"hybrid", generator?: "openai"|"ollama"|"extractive", top_k?: number }`
  - Response: Benchmark report (JSON)

---

### Chat

- POST `/api/chat/sessions`
  - Purpose: Create a new chat session (or return an existing one by title).
  - Request (JSON): `{ user_id?: string|null, title?: string, initial_message?: string|null }`
  - Response: `ChatSessionResponse` — `{ session_id, title, messages, created_at, updated_at, message_count }`

- GET `/api/chat/sessions`
  - Purpose: List chat sessions for a user.
  - Query: `user_id` (required), `limit?`
  - Response: `{ sessions: ChatSessionResponse[] }`

- GET `/api/chat/sessions/{session_id}`
  - Purpose: Retrieve a specific chat session by id.
  - Response: `ChatSessionResponse`

- DELETE `/api/chat/sessions/{session_id}`
  - Purpose: Delete a chat session by id.
  - Response: `{ message: "Session deleted successfully" }`

- PUT `/api/chat/sessions/{session_id}/title`
  - Purpose: Update the title of a chat session.
  - Request: `title` (simple param/body depending on client)
  - Response: `{ message: "Title updated successfully" }`

- POST `/api/chat/ask`
  - Purpose: Ask a question within a session; persists conversation; returns answer with citations and confidence.
  - Request (JSON):
    - `{ session_id: string, question: string, retriever?: string, generator?: string, image_policy?: string, top_k?: number, max_tokens?: number, user_images?: string[] }`
  - Response (JSON):
    - `{ session_id, question, answer, cited_sections: any[], retriever_scores: any[], message_id: string, timestamp: string, confidence?: number }`

- POST `/api/chat/ask-with-upload`
  - Purpose: Ask with image uploads in a session.
  - Request: multipart/form-data (`session_id`, `question`, optional params, `images?`)
  - Response: Same shape as `/api/chat/ask`

---

### Notes

- OpenAPI: OAS 3.1 (`/openapi.json` served by FastAPI)
- PDF parsing outputs (markdown/images) are copied into the configured `data_dir` for downstream QA.
- The QA pipeline is built or warmed as needed; `/api/pdf/status` can be polled to monitor readiness.
- Unused/Debug endpoints (Chat Embedding and Chat Debug) have been removed from routing to reduce surface area.


