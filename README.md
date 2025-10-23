# PDF Reader - Document Analysis Tool

A minimal web interface for visualizing PDF parsing and QA results. Upload PDFs, view pages, explore structured data, and interact with AI-powered question answering.

## Features

- **PDF Upload**: Drag-and-drop or click to upload PDF documents
- **Sample Paper**: Try the interface with a pre-loaded research paper
- **PDF Viewer**: Navigate pages with zoom controls and smooth scrolling
- **Parsed Sections Sidebar**: Browse document structure similar to Google Scholar Reader
- **AI-Powered Q&A**: Ask questions about the document and get contextual answers
- **Context Highlighting**: Highlight relevant passages from QA retrieved context
- **Toggle Navigation**: Show/hide sections sidebar and QA interface
- **Light/Dark Mode**: Toggle between light and dark themes
- **Responsive Design**: Clean, academic aesthetic with monospace typography

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS v4 with custom design tokens
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Fonts**: Geist Sans & Geist Mono
- **TypeScript**: Full type safety

## Getting Started

### Prerequisites

- Node.js 18+ (for frontend)
- Python 3.9+ (for backend)
- OpenAI API Key (for QA functionality)
- MongoDB (optional, for chat history)

### Installation

#### Frontend Setup

\`\`\`bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local and set BACKEND_API_URL (default: http://localhost:8000)
\`\`\`

#### Backend Setup

\`\`\`bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
# Create a .env file in backend directory with:
# OPENAI_API_KEY=your_openai_api_key_here
# MONGODB_URL=mongodb://localhost:27017/paperreader

# Start the FastAPI backend server
cd src
uvicorn paperreader.main:app --reload --host 0.0.0.0 --port 8000
\`\`\`

#### Start Development

\`\`\`bash
# In the root directory (frontend)
npm run dev
\`\`\`

The frontend will be available at `http://localhost:3000`
The backend API will be available at `http://localhost:8000`

### Quick Start

1. **Try Sample Paper**: Click "Try with Sample Paper" to load a pre-configured research paper
2. **Upload Your PDF**: Drag and drop or click to upload your own PDF
3. **Browse Sections**: Use the sidebar to navigate through document sections
4. **Ask Questions**: Click "Ask Questions" button and type your query
5. **View Answers**: See AI-generated answers with retrieved context

### Environment Variables

#### Frontend (.env.local)
\`\`\`bash
# Backend API URL
BACKEND_API_URL=http://localhost:8000
\`\`\`

#### Backend (.env in backend directory)
\`\`\`bash
# Required: OpenAI API Key for QA functionality
OPENAI_API_KEY=your_openai_api_key_here

# Optional: MongoDB URL for chat history
MONGODB_URL=mongodb://localhost:27017/paperreader
\`\`\`

### API Endpoints

The application integrates with the FastAPI backend service:

#### 1. PDF Upload & Parsing
**Frontend**: `POST /api/pdf/upload` (Next.js API Route)
**Backend**: `POST http://localhost:8000/api/pdf/upload` (FastAPI)

**Request**: FormData with PDF file

**Response**:
\`\`\`json
{
  "title": "Document Title",
  "sections": [
    {
      "id": "section-id",
      "title": "Section Title",
      "content": "Section content preview...",
      "page": 1
    }
  ],
  "metadata": {
    "pages": 10,
    "author": "Author Name",
    "date": "2024"
  }
}
\`\`\`

#### 2. Question Answering (✅ INTEGRATED)
**Frontend**: `POST /api/qa/ask` (Next.js API Route - proxies to backend)
**Backend**: `POST http://localhost:8000/api/qa/ask` (FastAPI)

The frontend now seamlessly integrates with the backend QA pipeline featuring:
- **Multiple Retrieval Strategies**: keyword, dense, or hybrid retrieval
- **Multiple Generators**: OpenAI, Ollama, or extractive
- **Image Support**: Upload images with questions for visual context
- **RAG Pipeline**: Full retrieval-augmented generation with citations
- **Chat History**: Contextual conversations with session management

**Request**:
\`\`\`json
{
  "question": "What is the main conclusion?",
  "filename": "document.pdf",
  "retriever": "hybrid",
  "generator": "openai",
  "image_policy": "auto",
  "top_k": 5,
  "max_tokens": 512,
  "user_images": null
}
\`\`\`

**Response**:
\`\`\`json
{
  "answer": "The main conclusion is...",
  "context": "Retrieved paragraph from document...",
  "confidence": 0.85,
  "cited_sections": [
    {
      "doc_id": "doc123",
      "title": "Section Title",
      "page": 5,
      "excerpt": "Relevant text from the document..."
    }
  ],
  "retriever_scores": [
    {
      "index": 0,
      "score": 0.92
    }
  ]
}
\`\`\`

#### 3. Chat Sessions (Backend Only)
**Endpoint**: `POST http://localhost:8000/api/chat/sessions`
Create and manage chat sessions with conversation history.

**Endpoint**: `POST http://localhost:8000/api/chat/ask`
Ask questions within a chat session with full context.

## Project Structure

\`\`\`
├── app/
│   ├── api/
│   │   ├── pdf/upload/route.ts    # PDF upload handler
│   │   └── qa/ask/route.ts        # Q&A endpoint
│   ├── layout.tsx                  # Root layout with theme
│   ├── page.tsx                    # Main page
│   └── globals.css                 # Theme tokens & styles
├── components/
│   ├── pdf-reader.tsx              # Main reader component
│   ├── pdf-upload.tsx              # Upload interface with sample
│   ├── pdf-viewer.tsx              # PDF display with highlighting
│   ├── parsed-sidebar.tsx          # Document structure sidebar
│   ├── qa-interface.tsx            # Q&A input & overlay
│   ├── theme-toggle.tsx            # Light/dark mode toggle
│   └── ui/                         # shadcn/ui components
└── README.md
\`\`\`

## New Features (Latest Update)

### ✨ Backend QA Integration (NEW)
- **RAG Pipeline**: Full integration with backend QA service using retrieval-augmented generation
- **Citation Support**: Display individual cited sections with document titles and page numbers
- **Confidence Scores**: Visual confidence meter showing answer reliability
- **Advanced Retrieval**: Support for hybrid, dense, and keyword-based retrieval strategies
- **Multiple Generators**: Choose between OpenAI, Ollama, or extractive generation
- **Error Handling**: Graceful fallbacks and informative error messages
- **Image Support**: Ready for visual question answering with image uploads

### Enhanced Navigation
- **Header Navigation**: Toggle sections sidebar and QA interface from header buttons
- **File Info Display**: See current file name in header
- **Upload New**: Easily switch documents without page refresh

### Improved QA Interface
- **Prominent Design**: Gradient background with clear visual hierarchy
- **Answer Counter**: Badge showing number of Q&A interactions
- **Citation Cards**: Rich citation display with individual highlight buttons
- **Example Prompts**: Placeholder text with sample questions
- **Highlight Button**: Click to highlight context passages in PDF

### Sample Paper
- **Pre-loaded Content**: "Language Agents Achieve Superhuman Synthesis" research paper
- **Realistic Sections**: 8 sections with proper academic structure
- **Test Highlighting**: Try QA features with pre-configured content

## Implementation Notes

### PDF Rendering
The current implementation uses a placeholder for PDF rendering. For production, integrate one of these libraries:

- **react-pdf**: React wrapper for pdf.js
- **pdf.js**: Mozilla's PDF rendering library
- **pdfjs-dist**: npm package for pdf.js

Example with react-pdf:
\`\`\`bash
npm install react-pdf pdfjs-dist
\`\`\`

### Backend Integration Status

#### ✅ Completed
- **QA Service**: Fully integrated with FastAPI backend (`app/api/qa/ask/route.ts`)
  - Proxies requests to backend QA pipeline
  - Handles error scenarios gracefully
  - Transforms backend responses for frontend compatibility
  - Displays citations with confidence scores
  - Shows individual cited sections with highlighting support

#### 🔄 In Progress
- **PDF Upload**: Currently using mock data (`app/api/pdf/upload/route.ts`)
  - TODO: Connect to backend PDF parsing service at `http://localhost:8000/api/pdf/upload`
  - Backend route already exists at `backend/src/paperreader/api/pdf_routes.py`

### Highlighting Implementation
The current highlighting uses simple text matching. For production:
- Use PDF.js text layer for precise positioning
- Implement bounding box calculations
- Add scroll-to-highlight functionality

### Optional Enhancements
- **Advanced Highlighting**: Multi-color highlights for different contexts
- **Page Jump**: Navigate to specific pages from sidebar sections
- **Export Q&A**: Download Q&A history as markdown/PDF
- **Multi-file Support**: Upload and compare multiple documents
- **Annotation Tools**: Add notes and bookmarks

## Design System

### Colors
- **Light Mode**: Cream background (#F9F8F5) with navy accents (#1E2A4A)
- **Dark Mode**: Deep navy background (#1E2A4A) with light text
- **Accent**: Coral (#E67E50) for interactive elements
- **Primary**: Adaptive based on theme

### Typography
- **Headings**: Geist Sans (medium weight)
- **Body**: Geist Mono for academic feel
- **Line Height**: 1.5-1.6 for optimal readability

### UI Patterns
- **Toggle Buttons**: Outline when inactive, filled when active
- **Gradient Accents**: Subtle gradients for QA interface
- **Badges**: Rounded pills for counts and status
- **Cards**: Elevated with subtle shadows

## Usage Tips

1. **Navigation**: Use header buttons to show/hide sections and QA interface for focused reading
2. **QA Workflow**: Ask questions → View answers → Click "Highlight in PDF" to see source
3. **Section Navigation**: Click sections in sidebar to jump to relevant pages
4. **Theme Switching**: Use theme toggle for comfortable reading in any lighting
5. **Sample Paper**: Start with sample to understand features before uploading your own

## Screenshots

*Screenshots will be added after deployment*

## License

MIT
