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

### Installation

\`\`\`bash
# Install dependencies
npm install

# Run development server
npm run dev
\`\`\`

The app will be available at `http://localhost:3000`

### Quick Start

1. **Try Sample Paper**: Click "Try with Sample Paper" to load a pre-configured research paper
2. **Upload Your PDF**: Drag and drop or click to upload your own PDF
3. **Browse Sections**: Use the sidebar to navigate through document sections
4. **Ask Questions**: Click "Ask Questions" button and type your query
5. **View Answers**: See AI-generated answers with retrieved context

### API Endpoints

The application includes two API routes that need to be connected to your backend:

#### 1. PDF Upload & Parsing
**Endpoint**: `POST /api/pdf/upload`

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

#### 2. Question Answering
**Endpoint**: `POST /api/qa/ask`

**Request**:
\`\`\`json
{
  "question": "What is the main conclusion?",
  "filename": "document.pdf"
}
\`\`\`

**Response**:
\`\`\`json
{
  "answer": "The main conclusion is...",
  "context": "Retrieved paragraph from document...",
  "confidence": 0.85
}
\`\`\`

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

### Enhanced Navigation
- **Header Navigation**: Toggle sections sidebar and QA interface from header buttons
- **File Info Display**: See current file name in header
- **Upload New**: Easily switch documents without page refresh

### Improved QA Interface
- **Prominent Design**: Gradient background with clear visual hierarchy
- **Answer Counter**: Badge showing number of Q&A interactions
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

### Backend Integration
Replace the mock API responses in:
- `app/api/pdf/upload/route.ts` - Connect to your PDF parsing service
- `app/api/qa/ask/route.ts` - Connect to your RAG/QA system

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
