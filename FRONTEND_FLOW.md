# Frontend Architecture & Flow Documentation

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Application Entry Point](#application-entry-point)
3. [Component Hierarchy](#component-hierarchy)
4. [State Management](#state-management)
5. [User Flows](#user-flows)
6. [Backend Integration](#backend-integration)
7. [Custom Hooks & Utilities](#custom-hooks--utilities)
8. [Styling & Theming](#styling--theming)

---

## Architecture Overview

### Technology Stack
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 with `@tailwindcss/postcss`
- **UI Components**: shadcn/ui (Radix UI primitives)
- **PDF Rendering**: `@react-pdf-viewer` library
- **State**: React hooks (useState, useEffect, useCallback)
- **API Communication**: Fetch API with Next.js API routes as proxies

### Project Structure
```
├── app/
│   ├── api/                    # Next.js API routes (backend proxies)
│   │   ├── chat/
│   │   │   └── ask/
│   │   ├── citations/
│   │   └── pdf/
│   │       └── upload/
│   ├── layout.tsx              # Root layout with providers
│   └── page.tsx                # Home page
├── components/
│   ├── pdf-reader.tsx          # Main orchestrator component
│   ├── pdf-upload.tsx          # File upload interface
│   ├── pdf-viewer.tsx          # PDF rendering engine
│   ├── pdf-sidebar.tsx         # Document outline navigation
│   ├── citation-sidebar.tsx    # Extracted citations display
│   ├── citation-popup.tsx      # Inline citation preview
│   ├── qa-interface.tsx        # Q&A chat interface
│   ├── annotation-toolbar.tsx  # PDF annotation tools
│   └── ui/                     # shadcn/ui components
├── hooks/
│   ├── useCitationPlugin.tsx   # Custom PDF citation plugin
│   ├── useExtractCitations.ts  # Citation extraction hook
│   └── useCitationMetadata.ts  # Citation metadata fetching
├── lib/
│   └── utils.ts                # Utility functions
└── types/
    └── index.ts                # TypeScript type definitions
```

---

## Application Entry Point

### Root Layout (`app/layout.tsx`)

The application starts with the root layout that provides global context:

```typescript
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

**Key Features**:
- Theme provider for light/dark mode support
- Geist font integration
- Global styles and Tailwind CSS

### Home Page (`app/page.tsx`)

```typescript
export default function Home() {
  return (
    <main className="min-h-screen">
      <PDFReader />
    </main>
  )
}
```

The home page renders the main `PDFReader` component, which orchestrates the entire application.

---

## Component Hierarchy

### Component Tree
```
PDFReader (Main Orchestrator)
├── PDFUpload
│   └── File input + drag-and-drop
├── Tabs (Multi-document support)
│   └── For each tab:
│       ├── PDFViewer
│       │   ├── @react-pdf-viewer core
│       │   ├── CitationPlugin (useCitationPlugin)
│       │   ├── BookmarkPlugin
│       │   ├── ThumbnailPlugin
│       │   └── ZoomPlugin
│       ├── PDFSidebar
│       │   ├── Bookmarks/Outline
│       │   └── Section navigation
│       ├── CitationSidebar
│       │   ├── Extracted citations list
│       │   └── CitationPopup (on click)
│       ├── QAInterface
│       │   ├── Question input
│       │   ├── Chat history
│       │   └── Answer display with citations
│       └── AnnotationToolbar
│           ├── Highlight tools
│           ├── Color picker
│           └── Annotation controls
```

---

## State Management

### PDFReader State Structure

The `PDFReader` component manages all application state:

```typescript
// Tab-based state for multi-document support
interface PDFTab {
  id: string                              // Unique tab identifier
  file: File                              // PDF file object
  selectedSection: string | null          // Current section in outline
  bookmarks: BookmarkItem[]               // Document outline/TOC
  qaHistory: Array<{                      // Q&A conversation history
    question: string
    answer: string
    timestamp: number
    citedSections?: any[]
  }>
  extractedCitations?: ExtractedCitation[] // Backend-extracted citations
  pdfId?: string                          // Backend session/document ID
  parsedOutputs?: {                       // Backend parsing results
    text: string
    metadata: {
      title?: string
      author?: string
      pages?: number
    }
    sections: any[]
    citations: any[]
  }
}

// Main state
const [tabs, setTabs] = useState<PDFTab[]>([])
const [activeTab, setActiveTab] = useState<string>("")
const [isUploading, setIsUploading] = useState(false)
const [uploadError, setUploadError] = useState<string | null>(null)
```

### State Update Patterns

**Adding a new PDF**:
```typescript
const handleFileUpload = async (file: File) => {
  setIsUploading(true)

  try {
    // 1. Upload to backend via API route
    const formData = new FormData()
    formData.append("file", file)
    const response = await fetch("/api/pdf/upload", {
      method: "POST",
      body: formData
    })

    const data = await response.json()

    // 2. Create new tab with backend data
    const newTab: PDFTab = {
      id: uuidv4(),
      file,
      selectedSection: null,
      bookmarks: [],
      qaHistory: [],
      pdfId: data.pdfId,
      parsedOutputs: data.backendResult?.results?.[0]?.outputs
    }

    // 3. Update state
    setTabs(prev => [...prev, newTab])
    setActiveTab(newTab.id)
  } catch (error) {
    setUploadError(error.message)
  } finally {
    setIsUploading(false)
  }
}
```

**Updating tab-specific data**:
```typescript
const updateTabData = (tabId: string, updates: Partial<PDFTab>) => {
  setTabs(prev => prev.map(tab =>
    tab.id === tabId ? { ...tab, ...updates } : tab
  ))
}

// Example: Adding Q&A history
const addQAToHistory = (tabId: string, qa: QAEntry) => {
  updateTabData(tabId, {
    qaHistory: [...getCurrentTab(tabId).qaHistory, qa]
  })
}
```

---

## User Flows

### Flow 1: PDF Upload & Parsing

```
User Action → Frontend → Backend → State Update
```

**Step-by-Step**:

1. **User uploads PDF** (`PDFUpload` component)
   - File selection via input or drag-and-drop
   - Validates file type (PDF only)
   - Shows upload progress indicator

2. **Frontend sends to API route** (`app/api/pdf/upload/route.ts`)
   ```typescript
   // Next.js API route acts as proxy
   export async function POST(request: Request) {
     const formData = await request.formData()

     // Forward to Python backend
     const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
     const response = await fetch(`${backendUrl}/api/pdf/save-and-parse/`, {
       method: 'POST',
       body: formData
     })

     return Response.json(await response.json())
   }
   ```

3. **Backend processes PDF** (Python FastAPI)
   - Extracts text using PyMuPDF
   - Parses sections, metadata, figures
   - Extracts citations from references
   - Stores in MongoDB with `pdfId`
   - Generates vector embeddings for RAG

4. **Frontend receives response**
   ```typescript
   {
     message: "PDF uploaded and parsed successfully",
     pdfId: "507f1f77bcf86cd799439011",
     backendResult: {
       results: [{
         filename: "paper.pdf",
         outputs: {
           text: "...",
           metadata: {
             title: "Research Paper Title",
             author: "John Doe et al.",
             pages: 12
           },
           sections: [
             { title: "Abstract", page: 1 },
             { title: "Introduction", page: 2 }
           ],
           citations: [...]
         }
       }]
     }
   }
   ```

5. **State update** (`PDFReader`)
   - Creates new tab with parsed data
   - Switches to new tab
   - Renders PDF with `PDFViewer`

### Flow 2: PDF Viewing & Navigation

**Components Involved**: `PDFViewer`, `PDFSidebar`, `useCitationPlugin`

1. **PDF Rendering**
   ```typescript
   // PDFViewer component
   import { Worker, Viewer } from '@react-pdf-viewer/core'
   import { bookmarkPlugin } from '@react-pdf-viewer/bookmark'
   import { thumbnailPlugin } from '@react-pdf-viewer/thumbnail'

   const bookmarkPluginInstance = bookmarkPlugin()
   const citationPluginInstance = useCitationPlugin(extractedCitations)

   <Worker workerUrl="/pdf.worker.min.js">
     <Viewer
       fileUrl={fileUrl}
       plugins={[
         bookmarkPluginInstance,
         citationPluginInstance,
         thumbnailPluginInstance
       ]}
     />
   </Worker>
   ```

2. **Bookmark Navigation** (`PDFSidebar`)
   - Extracts document outline from PDF
   - Displays hierarchical TOC
   - Click → scrolls viewer to section
   ```typescript
   const { Bookmarks } = bookmarkPluginInstance

   <Bookmarks>
     {(props) => (
       <div className="sidebar">
         {props.bookmarks.map(bookmark => (
           <button onClick={() => props.onJumpToBookmark(bookmark)}>
             {bookmark.title}
           </button>
         ))}
       </div>
     )}
   </Bookmarks>
   ```

3. **Citation Detection** (`useCitationPlugin`)
   - Custom plugin scans rendered text for `[N]` patterns
   - Matches with backend-extracted citations
   - Renders clickable citation markers
   ```typescript
   const useCitationPlugin = (citations: ExtractedCitation[]) => {
     const renderPageLayer = (props: RenderPageLayerProps) => {
       const textContent = props.textLayer.textContentItems

       // Find citation patterns [1], [2], [3]...
       const citationMatches = textContent.filter(item =>
         /\[\d+\]/.test(item.str)
       )

       return citationMatches.map(match => (
         <CitationMarker
           position={match.position}
           citation={citations[parseInt(match.str)]}
           onHover={showCitationPopup}
         />
       ))
     }

     return { renderPageLayer }
   }
   ```

### Flow 3: Citation Extraction & Display

**Flow Diagram**:
```
PDF Loaded → Extract Citations → Fetch Metadata → Display in Sidebar
```

**Step-by-Step**:

1. **Trigger extraction** (after PDF loads)
   ```typescript
   // useExtractCitations hook
   const extractCitations = async (pdfId: string) => {
     const response = await fetch('/api/citations/extract', {
       method: 'POST',
       body: JSON.stringify({ pdfId })
     })

     const data = await response.json()
     return data.citations
   }

   useEffect(() => {
     if (currentTab.pdfId) {
       extractCitations(currentTab.pdfId).then(citations => {
         updateTabData(currentTab.id, { extractedCitations: citations })
       })
     }
   }, [currentTab.pdfId])
   ```

2. **Backend extraction** (`/api/citations/extract`)
   - Parses References section from PDF
   - Extracts structured citation data
   - Returns array of citations with confidence scores

3. **Enrich with metadata** (`useCitationMetadata`)
   ```typescript
   // Fetch metadata from external APIs (Crossref, Semantic Scholar)
   const enrichCitation = async (citation: ExtractedCitation) => {
     const response = await fetch('/api/citations/metadata', {
       method: 'POST',
       body: JSON.stringify({
         title: citation.title,
         authors: citation.authors
       })
     })

     return response.json() // { doi, abstract, year, venue, ... }
   }
   ```

4. **Display in sidebar** (`CitationSidebar`)
   ```typescript
   <div className="citation-list">
     {extractedCitations.map((citation, index) => (
       <div key={index} className="citation-item">
         <span className="citation-number">[{index + 1}]</span>
         <div className="citation-text">{citation.text}</div>
         {citation.metadata && (
           <div className="citation-metadata">
             <p>{citation.metadata.title}</p>
             <p>{citation.metadata.authors?.join(', ')}</p>
             <p>{citation.metadata.year}</p>
           </div>
         )}
       </div>
     ))}
   </div>
   ```

5. **Inline citation popup** (`CitationPopup`)
   - Shows on hover/click of `[N]` marker in PDF
   - Displays citation title, authors, year
   - Link to DOI/source if available

### Flow 4: Q&A with RAG

**Flow Diagram**:
```
User Question → Backend RAG Pipeline → Answer with Citations → Display
```

**Step-by-Step**:

1. **User enters question** (`QAInterface`)
   ```typescript
   const handleAskQuestion = async (question: string) => {
     setIsProcessing(true)

     const requestBody = {
       session_id: currentTab.pdfId || uuidv4(),
       question: question,
       retriever: "hybrid",     // hybrid | dense | sparse
       generator: "openai",
       top_k: 5,
       max_tokens: 1024
     }

     const response = await fetch('/api/chat/ask', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(requestBody)
     })

     const data = await response.json()
     displayAnswer(data)
   }
   ```

2. **Backend RAG pipeline** (`/api/chat/ask`)
   - **Retrieval**:
     - Dense retrieval using Visualized_BGE embeddings
     - Sparse retrieval using BM25
     - Hybrid fusion of results
     - Reranking with cross-encoder
   - **Generation**:
     - LLM (OpenAI GPT-4) generates answer
     - Grounds answer in retrieved passages
     - Returns cited sections

3. **Response structure**
   ```typescript
   {
     answer: "The paper demonstrates that...",
     cited_sections: [
       {
         text: "Our experiments show a 15% improvement...",
         page: 5,
         section: "Results",
         confidence: 0.92
       },
       {
         text: "The proposed method achieves...",
         page: 7,
         section: "Discussion",
         confidence: 0.87
       }
     ],
     session_id: "session-uuid",
     confidence: 0.89
   }
   ```

4. **Display answer** (`QAInterface`)
   ```typescript
   <div className="qa-history">
     {qaHistory.map((entry, index) => (
       <div key={index}>
         {/* Question */}
         <div className="question-bubble">
           {entry.question}
         </div>

         {/* Answer */}
         <div className="answer-bubble">
           <p>{entry.answer}</p>

           {/* Cited sections */}
           {entry.citedSections && (
             <div className="citations">
               <h4>Sources:</h4>
               {entry.citedSections.map((section, idx) => (
                 <div
                   key={idx}
                   className="citation-source"
                   onClick={() => jumpToPDFPage(section.page)}
                 >
                   <span>Page {section.page}</span>
                   <p>{section.text}</p>
                   <span className="confidence">
                     {(section.confidence * 100).toFixed(0)}%
                   </span>
                 </div>
               ))}
             </div>
           )}
         </div>
       </div>
     ))}
   </div>
   ```

5. **Jump to source**
   - Click on cited section → scroll PDF to page
   - Highlight relevant text (if coordinates available)

### Flow 5: Multi-Tab Document Management

**Features**:
- Open multiple PDFs simultaneously
- Each tab maintains independent state
- Switch between tabs seamlessly

**Implementation**:
```typescript
// Tab management in PDFReader
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    {tabs.map(tab => (
      <TabsTrigger key={tab.id} value={tab.id}>
        {tab.file.name}
        <button onClick={() => closeTab(tab.id)}>×</button>
      </TabsTrigger>
    ))}
  </TabsList>

  {tabs.map(tab => (
    <TabsContent key={tab.id} value={tab.id}>
      <div className="pdf-workspace">
        <PDFViewer file={tab.file} />
        <CitationSidebar citations={tab.extractedCitations} />
        <QAInterface
          history={tab.qaHistory}
          pdfId={tab.pdfId}
        />
      </div>
    </TabsContent>
  ))}
</Tabs>
```

---

## Backend Integration

### API Route Architecture

All frontend API calls go through Next.js API routes, which proxy to the Python backend:

```
Frontend Component
    ↓ fetch('/api/...')
Next.js API Route (app/api/.../route.ts)
    ↓ fetch('http://backend:8000/api/...')
Python FastAPI Backend
    ↓ MongoDB / Processing
Response flows back up the chain
```

### Environment Variables

**Server-side** (`process.env`):
```typescript
BACKEND_URL = "http://backend:8000"  // Docker service name
// or "http://localhost:8000" in development
```

**Client-side** (`process.env.NEXT_PUBLIC_*`):
```typescript
NEXT_PUBLIC_BACKEND_URL = "http://localhost:8000"  // Fallback
```

### Key API Routes

#### 1. PDF Upload (`app/api/pdf/upload/route.ts`)

```typescript
export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    // Forward to backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    const backendResponse = await fetch(
      `${backendUrl}/api/pdf/save-and-parse/`,
      {
        method: 'POST',
        body: formData
      }
    )

    if (!backendResponse.ok) {
      throw new Error('Backend upload failed')
    }

    const data = await backendResponse.json()
    return Response.json(data)

  } catch (error) {
    console.error('Upload error:', error)
    return Response.json(
      { error: 'Failed to upload PDF' },
      { status: 500 }
    )
  }
}
```

#### 2. Chat/Q&A (`app/api/chat/ask/route.ts`)

```typescript
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      session_id,
      question,
      retriever = 'hybrid',
      generator = 'openai',
      top_k = 5,
      max_tokens = 1024
    } = body

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    const backendResponse = await fetch(
      `${backendUrl}/api/chat/ask`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id,
          question,
          retriever,
          generator,
          top_k,
          max_tokens
        })
      }
    )

    const data = await backendResponse.json()
    return Response.json(data)

  } catch (error) {
    return Response.json(
      { error: 'Failed to process question' },
      { status: 500 }
    )
  }
}
```

#### 3. Citation Extraction (`app/api/citations/extract/route.ts`)

```typescript
export async function POST(request: Request) {
  try {
    const { pdfId } = await request.json()

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    const backendResponse = await fetch(
      `${backendUrl}/api/citations/extract`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfId })
      }
    )

    const data = await backendResponse.json()
    return Response.json(data)

  } catch (error) {
    return Response.json(
      { error: 'Failed to extract citations' },
      { status: 500 }
    )
  }
}
```

### Error Handling Pattern

```typescript
// Consistent error handling across all API routes
try {
  // API call logic
} catch (error) {
  console.error('Error context:', error)

  return Response.json(
    {
      error: 'Human-readable error message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    },
    { status: 500 }
  )
}
```

---

## Custom Hooks & Utilities

### 1. `useCitationPlugin` (hooks/useCitationPlugin.tsx)

Custom plugin for `@react-pdf-viewer` that detects and enriches citations:

```typescript
interface CitationPluginProps {
  citations: ExtractedCitation[]
  onCitationClick?: (citation: ExtractedCitation) => void
}

export const useCitationPlugin = (props: CitationPluginProps): Plugin => {
  const { citations, onCitationClick } = props

  // Store citation positions after text layer renders
  const [citationPositions, setCitationPositions] = useState<Map<number, DOMRect>>(new Map())

  const renderPageLayer = (renderProps: RenderPageLayerProps) => {
    const { pageIndex, textLayer } = renderProps

    useEffect(() => {
      if (textLayer) {
        // Scan for citation patterns [1], [2], etc.
        const textItems = textLayer.textContentItems
        const matches: CitationMatch[] = []

        textItems.forEach((item, index) => {
          const regex = /\[(\d+)\]/g
          let match

          while ((match = regex.exec(item.str)) !== null) {
            const citationNumber = parseInt(match[1])
            matches.push({
              number: citationNumber,
              position: item.position,
              pageIndex
            })
          }
        })

        // Render citation markers
        return matches.map(match => (
          <CitationMarker
            key={`${pageIndex}-${match.number}`}
            citation={citations[match.number - 1]}
            position={match.position}
            onClick={() => onCitationClick?.(citations[match.number - 1])}
          />
        ))
      }

      return null
    }, [textLayer, pageIndex])
  }

  return {
    renderPageLayer
  }
}
```

### 2. `useExtractCitations` (hooks/useExtractCitations.ts)

Hook for extracting citations from uploaded PDFs:

```typescript
interface UseExtractCitationsResult {
  extractCitations: (pdfId: string) => Promise<ExtractedCitation[]>
  isExtracting: boolean
  error: Error | null
}

export const useExtractCitations = (): UseExtractCitationsResult => {
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const extractCitations = async (pdfId: string) => {
    setIsExtracting(true)
    setError(null)

    try {
      const response = await fetch('/api/citations/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfId })
      })

      if (!response.ok) {
        throw new Error('Citation extraction failed')
      }

      const data = await response.json()
      return data.citations || []

    } catch (err) {
      setError(err as Error)
      throw err
    } finally {
      setIsExtracting(false)
    }
  }

  return { extractCitations, isExtracting, error }
}
```

### 3. `useCitationMetadata` (hooks/useCitationMetadata.ts)

Hook for enriching citations with external metadata:

```typescript
interface CitationMetadata {
  doi?: string
  title: string
  authors: string[]
  year?: number
  venue?: string
  abstract?: string
  url?: string
}

export const useCitationMetadata = () => {
  const [isLoading, setIsLoading] = useState(false)

  const fetchMetadata = async (citation: ExtractedCitation): Promise<CitationMetadata> => {
    setIsLoading(true)

    try {
      const response = await fetch('/api/citations/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: citation.title,
          authors: citation.authors
        })
      })

      const data = await response.json()
      return data

    } finally {
      setIsLoading(false)
    }
  }

  return { fetchMetadata, isLoading }
}
```

### 4. Utility Functions (`lib/utils.ts`)

```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Merge Tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generate unique IDs
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }

    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}
```

---

## Styling & Theming

### Tailwind Configuration

**tailwind.config.ts**:
```typescript
import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ... more color tokens
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

### Theme System

**Dark/Light mode implementation**:

```typescript
// app/layout.tsx
import { ThemeProvider } from "next-themes"

<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  {children}
</ThemeProvider>

// Component usage
import { useTheme } from "next-themes"

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme()

  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? '🌞' : '🌙'}
    </button>
  )
}
```

### CSS Variables (`app/globals.css`)

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    /* ... more tokens */
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    /* ... more tokens */
  }
}
```

### Component Styling Patterns

**Using `cn()` utility for conditional styles**:
```typescript
import { cn } from "@/lib/utils"

<div className={cn(
  "base-styles",
  isActive && "active-styles",
  isDisabled && "disabled-styles"
)}>
  Content
</div>
```

---

## Performance Optimizations

### 1. React Memoization

```typescript
// Memoize expensive components
const PDFViewer = React.memo(({ file, plugins }) => {
  // ... component logic
})

// Memoize callbacks
const handleCitationClick = useCallback((citation: ExtractedCitation) => {
  setCitationPopup({ open: true, citation })
}, [])
```

### 2. Lazy Loading

```typescript
// Lazy load heavy components
const QAInterface = dynamic(() => import('./qa-interface'), {
  loading: () => <div>Loading Q&A interface...</div>,
  ssr: false
})
```

### 3. Virtualization

For large citation lists:
```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

const CitationList = ({ citations }) => {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: citations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
  })

  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <CitationItem citation={citations[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Type Definitions

### Key TypeScript Interfaces

```typescript
// types/index.ts

export interface PDFTab {
  id: string
  file: File
  selectedSection: string | null
  bookmarks: BookmarkItem[]
  qaHistory: QAEntry[]
  extractedCitations?: ExtractedCitation[]
  pdfId?: string
  parsedOutputs?: ParsedPDFOutput
}

export interface BookmarkItem {
  id: string
  title: string
  page: number
  children?: BookmarkItem[]
}

export interface QAEntry {
  question: string
  answer: string
  timestamp: number
  citedSections?: CitedSection[]
  confidence?: number
}

export interface CitedSection {
  text: string
  page: number
  section?: string
  confidence: number
}

export interface ExtractedCitation {
  number: number
  text: string
  title?: string
  authors?: string[]
  year?: number
  venue?: string
  doi?: string
  confidence: number
}

export interface ParsedPDFOutput {
  text: string
  metadata: {
    title?: string
    author?: string
    pages?: number
    keywords?: string[]
  }
  sections: PDFSection[]
  citations: ExtractedCitation[]
  figures?: PDFFigure[]
}

export interface PDFSection {
  title: string
  page: number
  level: number
  content?: string
}

export interface PDFFigure {
  caption: string
  page: number
  imageUrl?: string
}
```

---

## Error Handling & Loading States

### Global Error Boundary

```typescript
// app/error.tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="error-container">
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

### Loading States

```typescript
// Component-level loading
const [isLoading, setIsLoading] = useState(false)

{isLoading ? (
  <div className="loading-spinner">
    <Spinner />
    <p>Processing PDF...</p>
  </div>
) : (
  <PDFViewer />
)}
```

### Toast Notifications

```typescript
import { toast } from "sonner"

// Success
toast.success("PDF uploaded successfully")

// Error
toast.error("Failed to extract citations", {
  description: error.message
})

// Loading
const toastId = toast.loading("Processing...")
// Later:
toast.success("Done!", { id: toastId })
```

---

## Testing Considerations

### Component Testing Pattern

```typescript
// __tests__/pdf-viewer.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { PDFViewer } from '@/components/pdf-viewer'

describe('PDFViewer', () => {
  it('renders PDF when file is provided', async () => {
    const mockFile = new File(['mock content'], 'test.pdf', {
      type: 'application/pdf'
    })

    render(<PDFViewer file={mockFile} />)

    await waitFor(() => {
      expect(screen.getByText('Page 1')).toBeInTheDocument()
    })
  })
})
```

### API Route Testing

```typescript
// __tests__/api/pdf-upload.test.ts
import { POST } from '@/app/api/pdf/upload/route'

describe('PDF Upload API', () => {
  it('uploads PDF successfully', async () => {
    const formData = new FormData()
    formData.append('file', mockPDFFile)

    const request = new Request('http://localhost:3000/api/pdf/upload', {
      method: 'POST',
      body: formData
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.pdfId).toBeDefined()
  })
})
```

---

## Deployment Considerations

### Environment Variables

**Development** (`.env.local`):
```bash
BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

**Production Docker** (`docker-compose.yml`):
```yaml
environment:
  - BACKEND_URL=http://python-backend:8000
  - NEXT_PUBLIC_BACKEND_URL=https://api.yourapp.com
```

### Build Process

```bash
# Development
npm run dev

# Production build
npm run build
npm start

# Docker build
docker compose build nextjs-app
docker compose up -d
```

---

## Future Enhancements

### Planned Features
1. **Real-time collaboration** - Multiple users viewing/annotating same PDF
2. **Advanced annotations** - Drawings, stamps, signatures
3. **Export capabilities** - Export annotations, Q&A sessions
4. **Cloud storage integration** - Google Drive, Dropbox sync
5. **Mobile responsive design** - Touch-optimized PDF viewer
6. **Offline mode** - Service worker for offline PDF viewing
7. **Full-text search** - Search across all uploaded PDFs
8. **Citation graph visualization** - Show citation relationships

---

## Troubleshooting

### Common Issues

**PDF not rendering**:
- Check PDF.js worker is loaded (`/pdf.worker.min.js`)
- Verify file is valid PDF format
- Check browser console for errors

**Citations not extracting**:
- Ensure backend is running and accessible
- Check `pdfId` is valid
- Verify backend logs for parsing errors

**Q&A not working**:
- Verify `OPENAI_API_KEY` is set in backend
- Check MongoDB connection
- Ensure PDF has been parsed and embedded

**Styling issues**:
- Clear `.next` cache and rebuild
- Verify Tailwind config is correct
- Check CSS variable definitions

---

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [React PDF Viewer](https://react-pdf-viewer.dev/)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TypeScript](https://www.typescriptlang.org/)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-03
**Maintained By**: LOL-PaperReader Team
