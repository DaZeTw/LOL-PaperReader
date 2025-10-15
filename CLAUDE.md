# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 web application for PDF document analysis with AI-powered question answering. It provides an academic reader interface similar to Google Scholar Reader, featuring PDF viewing, document structure navigation, citation management, and RAG-based Q&A capabilities.

## Development Commands

\`\`\`bash
# Start development server (runs on http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
\`\`\`

## Architecture

### Core Component Structure

The application follows a **single-page layout pattern** centered around `PDFReader` (components/pdf-reader.tsx), which orchestrates all main UI components:

- **PDFReader**: Main orchestrator managing state for PDF file, parsed data, section selection, citation selection, and annotation mode
- **PDFUpload**: Initial screen for file upload or loading sample paper
- **PDFViewer**: Center panel displaying PDF with zoom controls, page navigation, and citation click handlers
- **ParsedSidebar**: Left sidebar for document structure/sections navigation
- **CitationSidebar**: Right sidebar for viewing citation details
- **AnnotationToolbar**: Floating toolbar for highlight/erase tools with color picker
- **QAInterface**: Bottom panel for question input with overlay showing Q&A history

### State Flow

All major state is managed in `PDFReader` and flows down:
- `pdfFile` → PDFViewer, QAInterface
- `parsedData` → ParsedSidebar
- `selectedSection` → PDFViewer (for highlighting)
- `selectedCitation` → CitationSidebar
- `highlightColor` + `annotationMode` → PDFViewer

### API Routes

Two Next.js API routes handle backend integration (currently returning mock data):

1. **POST /api/pdf/upload** (app/api/pdf/upload/route.ts)
   - Input: FormData with PDF file
   - Output: `{ title, sections: [{ id, title, content, page }], metadata: { pages, author, date } }`
   - TODO: Connect to actual PDF parsing service

2. **POST /api/qa/ask** (app/api/qa/ask/route.ts)
   - Input: `{ question: string, filename: string }`
   - Output: `{ answer: string, context: string, confidence: number }`
   - TODO: Connect to RAG/vector search backend

### PDF Rendering

Current implementation uses **hardcoded mock content** in PDFViewer (pages 1-2 contain sample research paper text). For production:
- Integrate `react-pdf` or `pdf.js` for actual PDF rendering
- Implement text layer extraction for precise highlighting
- Add bounding box calculations for context highlighting from Q&A

### Styling & UI

- **Framework**: Tailwind CSS v4 with custom design tokens
- **Components**: shadcn/ui (Radix UI primitives)
- **Fonts**: Geist Sans & Geist Mono
- **Theme**: Light/dark mode via next-themes (ThemeProvider in app/layout.tsx)
- **Design System**: Academic aesthetic with monospace typography
  - Light: Cream background (#F9F8F5) with navy accents (#1E2A4A)
  - Dark: Deep navy background with light text
  - Accent: Coral (#E67E50)

### Path Aliases

TypeScript is configured with `@/*` pointing to root directory. All imports use this pattern:
\`\`\`typescript
import { Button } from "@/components/ui/button"
import { PDFReader } from "@/components/pdf-reader"
\`\`\`

## Key Implementation Details

### Sample Paper

The application includes a pre-loaded sample paper ("Language Agents Achieve Superhuman Synthesis of Scientific Knowledge") with:
- 8 structured sections (Abstract, Introduction, etc.)
- Hardcoded highlights for demo terms: "hallucinate", "PaperQA2", "retrieval-augmented generation", "LitQA2"
- Interactive citation buttons with mock metadata

### Highlighting System

Current implementation in PDFViewer:
- Uses simple text matching with `Array.find()` to check if text contains highlight terms
- Applies colors via inline `backgroundColor` style on `<mark>` elements
- Production needs: PDF.js text layer integration, scroll-to-highlight, multi-color support

### Build Configuration

`next.config.mjs` has relaxed settings for rapid development:
- `eslint.ignoreDuringBuilds: true`
- `typescript.ignoreBuildErrors: true`
- `images.unoptimized: true`

Consider tightening these for production builds.

## Common Development Patterns

### Adding New UI Components

This project uses shadcn/ui. Component definitions are in `components.json`. To add new components:
\`\`\`bash
npx shadcx@latest add [component-name]
\`\`\`

### Working with Citations

Citations are clickable inline buttons that trigger `onCitationClick` callback, which updates `selectedCitation` state in PDFReader. CitationSidebar displays the selected citation details.

### Q&A Flow

1. User types question in QAInterface
2. POST to `/api/qa/ask` with question + filename
3. Response includes answer, context, and confidence
4. New message added to local state array
5. Overlay shows Q&A history with "Highlight in PDF" button for each context

## Next Steps for Production

1. **PDF Rendering**: Replace mock content with pdf.js/react-pdf integration
2. **Backend Integration**: Connect both API routes to actual parsing/QA services
3. **Highlighting**: Implement PDF.js text layer for precise coordinate-based highlighting
4. **Testing**: Add type safety checks (current config ignores TypeScript errors)
5. **Build Optimization**: Re-enable ESLint and TypeScript checks for production
