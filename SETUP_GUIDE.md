# Backend QA Integration - Setup Guide

This guide will help you set up the complete integration between the Next.js frontend and FastAPI backend for the QA service.

## Overview

The frontend now integrates with the backend QA service to provide:
- **RAG-based Question Answering**: Full retrieval-augmented generation pipeline
- **Citation Support**: Individual cited sections with page numbers and excerpts
- **Confidence Scores**: Visual indicators of answer reliability
- **Multiple Retrieval Strategies**: Hybrid, dense, or keyword-based
- **Multiple Generators**: OpenAI, Ollama, or extractive

## Quick Start

### Step 1: Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment (first time only)
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies (first time only)
pip install -r requirements.txt

# Create .env file in backend directory
# Add your OpenAI API key:
echo "OPENAI_API_KEY=your_openai_api_key_here" > .env
# Optional: Add MongoDB URL for chat history
echo "MONGODB_URL=mongodb://localhost:27017/paperreader" >> .env

# Start the FastAPI server
cd src
uvicorn paperreader.main:app --reload --host 0.0.0.0 --port 8000
```

The backend API will be available at: http://localhost:8000

You can check the backend health at: http://localhost:8000/health
View API documentation at: http://localhost:8000/docs

### Step 2: Frontend Setup

```bash
# Navigate to project root (if in backend directory)
cd ..

# Install dependencies (first time only)
npm install

# Configure environment (first time only)
cp .env.example .env.local

# Edit .env.local to ensure BACKEND_API_URL is set:
# BACKEND_API_URL=http://localhost:8000

# Start the Next.js development server
npm run dev
```

The frontend will be available at: http://localhost:3000

### Step 3: Prepare Document Data

The backend QA service needs parsed PDF documents to work with. You have two options:

#### Option A: Use Sample Data
Place your parsed JSON files in: `backend/src/paperreader/services/parser/`

The QA pipeline will automatically load JSON files from this directory.

#### Option B: Upload and Parse PDFs
1. Upload PDFs through the backend API at `POST /api/pdf/upload`
2. The backend will parse and store the document data
3. The QA service will then be able to answer questions about those documents

## Testing the Integration

### Test 1: Health Check

```bash
# Check backend is running
curl http://localhost:8000/health

# Expected response:
# {"status":"ok"}
```

### Test 2: Direct Backend QA Query

```bash
# Test the backend QA endpoint directly
curl -X POST http://localhost:8000/api/qa/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the main finding?",
    "retriever": "hybrid",
    "generator": "openai",
    "top_k": 5
  }'
```

### Test 3: Frontend Integration

1. Open http://localhost:3000 in your browser
2. Load a sample paper or upload a PDF
3. Click "Ask Questions" button
4. Type a question and press Enter
5. Verify you see:
   - An answer from the backend
   - Citations with page numbers
   - A confidence score
   - Individual "Highlight" buttons for each citation

## Troubleshooting

### Backend Not Running
**Error**: "Cannot connect to backend service at http://localhost:8000"

**Solution**:
1. Check if backend is running: `curl http://localhost:8000/health`
2. Verify FastAPI server is started in terminal
3. Check for port conflicts (another service using port 8000)

### OpenAI API Key Missing
**Error**: "Missing OPENAI_API_KEY in environment!"

**Solution**:
1. Create `.env` file in `backend` directory
2. Add: `OPENAI_API_KEY=your_actual_api_key_here`
3. Restart the backend server

### No Document Data
**Error**: "Number of documents loaded: 0"

**Solution**:
1. Check that parsed JSON files exist in `backend/src/paperreader/services/parser/`
2. Or upload PDFs through the backend upload endpoint
3. Verify the QA pipeline configuration in `backend/src/paperreader/services/qa/config.py`

### CORS Issues
**Error**: "CORS policy blocked the request"

**Solution**:
The backend already has CORS configured to accept requests from anywhere. If you still see CORS errors:
1. Check `backend/src/paperreader/main.py` for CORS settings
2. Verify `allow_origins=["*"]` is present
3. For production, update to specific origin: `allow_origins=["http://localhost:3000"]`

### Frontend Build Issues
**Error**: TypeScript or ESLint errors during build

**Note**: The project has relaxed build settings in `next.config.mjs`:
- `typescript.ignoreBuildErrors: true`
- `eslint.ignoreDuringBuilds: true`

For development, these are intentionally relaxed. Tighten for production.

## Architecture

### Request Flow

```
User Question (Frontend)
    ↓
QAInterface Component
    ↓
POST /api/qa/ask (Next.js API Route)
    ↓
POST http://localhost:8000/api/qa/ask (FastAPI Backend)
    ↓
QAPipeline (RAG Processing)
    ├── Document Loading
    ├── Chunking
    ├── Embedding
    ├── Retrieval (Hybrid/Dense/Keyword)
    ├── Reranking
    └── Generation (OpenAI/Ollama/Extractive)
    ↓
Response with Citations
    ↓
Transform Response (Next.js API Route)
    ↓
Display Answer + Citations (QAInterface Component)
```

### Key Files

**Frontend**:
- `app/api/qa/ask/route.ts` - Next.js API route that proxies to backend
- `components/qa-interface.tsx` - UI component for Q&A interaction
- `.env.local` - Frontend environment configuration

**Backend**:
- `backend/src/paperreader/main.py` - FastAPI application entry point
- `backend/src/paperreader/api/routes.py` - QA API routes
- `backend/src/paperreader/services/qa/pipeline.py` - RAG pipeline implementation
- `backend/src/paperreader/services/qa/config.py` - Pipeline configuration
- `backend/.env` - Backend environment configuration

## Advanced Configuration

### Changing Retrieval Strategy

Edit the frontend request to use different retrievers:

```typescript
// In qa-interface.tsx or when calling the API
const response = await fetch("/api/qa/ask", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    question: currentQuestion,
    filename: pdfFile.name,
    retriever: "hybrid",  // Options: "keyword", "dense", "hybrid"
    generator: "openai",  // Options: "openai", "ollama", "extractive"
    top_k: 5,            // Number of chunks to retrieve
    max_tokens: 512,     // Max tokens in generated answer
  }),
});
```

### Using Ollama Instead of OpenAI

1. Install and start Ollama locally
2. Change generator to "ollama" in the request
3. Update backend config if needed in `backend/src/paperreader/services/qa/config.py`

### Adding Image Support

The backend already supports visual QA. To enable in frontend:

```typescript
// Upload image and convert to base64
const base64Image = "data:image/png;base64,...";

const response = await fetch("/api/qa/ask", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    question: "What does this figure show?",
    user_images: [base64Image],
    image_policy: "auto",  // Options: "none", "auto", "all"
  }),
});
```

## Production Considerations

### Security
1. **API Keys**: Store in secure environment variables, never commit to Git
2. **CORS**: Update backend to only allow your production domain
3. **Rate Limiting**: Add rate limiting to prevent API abuse
4. **Authentication**: Add user authentication for production use

### Performance
1. **Caching**: Implement caching for frequently asked questions
2. **Connection Pooling**: Use connection pooling for database and API calls
3. **CDN**: Serve frontend through CDN for faster loading
4. **Vector Store**: Use persistent vector store instead of building on each request

### Monitoring
1. **Logging**: Add structured logging for debugging
2. **Metrics**: Track response times, error rates, citation quality
3. **Alerts**: Set up alerts for service downtime or errors

## Next Steps

Now that the QA service is integrated, consider:

1. **PDF Upload Integration**: Connect frontend PDF upload to backend parsing service
2. **Chat Sessions**: Implement session management for conversation history
3. **User Accounts**: Add authentication and user-specific document storage
4. **Advanced UI**: Add more visualization for retrieval scores and confidence
5. **Export Features**: Allow exporting Q&A history as PDF or markdown

## Support

For issues or questions:
- Check the main README.md for general documentation
- Review backend logs for detailed error messages
- Check browser console for frontend errors
- Verify environment variables are correctly set

---

Last Updated: 2025-10-23
