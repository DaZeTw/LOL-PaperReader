# Skimming Mechanism Guide

## Overview

LOL-PaperReader provides **two complementary skimming mechanisms** to help researchers quickly understand academic PDFs without reading every word:

1. **📖 Skimming View Mode** - Structured outline view with expandable sections
2. **🎨 Smart Highlights** - Colored overlays on important text (Novelty, Method, Result)

Together, these features enable rapid paper comprehension by surfacing key information and allowing targeted deep-reading.

---

## 1. Skimming View Mode

### What It Does

Transforms your PDF into a **structured, navigable outline** where you can:
- See all sections at a glance
- Expand/collapse sections to read summaries
- Jump directly to any section in the PDF
- Quickly assess paper structure and content

### How to Use

1. **Open any PDF** in the reader
2. **Click "Reading" button** in toolbar → Changes to **"Skimming"**
3. **View the structured outline** that appears
4. **Click section headers** to expand/collapse
5. **Click "Jump" button** to navigate to that page in the PDF
6. **Press E** to expand all sections
7. **Press C** to collapse all sections
8. **Click "Exit"** to return to normal reading view

### Visual Features

- **Section Cards** - Each section displayed as an expandable card
- **Page Numbers** - Blue badges showing which page each section starts on
- **Chunk Counts** - Shows how many text chunks are in each section
- **Preview Text** - First 100 characters visible when collapsed
- **Smart Grouping** - Chunks automatically grouped by section title

### Data Source

Skimming View fetches data from:
```
GET /api/pdf/chunks
```

This endpoint serves **chunked and parsed PDF data** from the backend, which includes:
- Section titles extracted from PDF structure
- Page numbers for each section
- Full text content organized into semantic chunks
- Document hierarchy preserved from original PDF

---

## 2. Smart Highlights

### What It Does

Overlays **colored rectangles** directly on the PDF to highlight three types of important content:

- 🟨 **Yellow (Novelty)** - Novel contributions, key insights, main claims
- 🟦 **Blue (Method)** - Methodology, approach descriptions, techniques
- 🟩 **Green (Result)** - Results, findings, experimental outcomes

### How to Use

1. **Upload a PDF** (ensure backend has generated highlight data)
2. **Click "Highlights Off"** in toolbar → Changes to **"Highlights On"**
3. **See colored boxes** appear over text on the PDF
4. **Hover over highlights** → Tooltip shows full text, category, and score
5. **Click category buttons** (Novelty/Method/Result) to filter
6. **Click "Hide All"** to temporarily hide without disabling
7. **Toggle individual categories** to focus on specific content types

### Visual Features

- **Color-Coded Boxes** - Semi-transparent overlays with thick left border
- **Hover Effects** - Highlights brighten and scale slightly on hover
- **Tooltips** - Show extracted text, section name, and relevance score
- **Category Counters** - Display count of each highlight type
- **Smooth Transitions** - Fade in/out when toggling categories

### Data Source

Smart Highlights fetch data from:
```
GET /api/pdf/skimming-data
```

This endpoint serves **pre-computed highlight coordinates** including:
- Bounding box positions (relative coordinates: 0-1 range)
- Page numbers (0-indexed)
- Category labels (novelty/method/result)
- Relevance scores (0-10 scale)
- Full extracted text
- Section context

---

## Technical Architecture

### Frontend Components

#### Skimming View
```
components/skimming-view.tsx
```
- Fetches chunks from `/api/pdf/chunks`
- Groups chunks by section title
- Manages expand/collapse state
- Handles keyboard shortcuts (E/C)
- Triggers page navigation on "Jump"

#### Smart Highlights System

**1. Highlight Plugin**
```
hooks/usePDFHighlightPlugin.tsx
```
- Integrates with @react-pdf-viewer plugin system
- Renders React overlays on PDF text layers
- Manages React roots for each page
- Handles page dimension scaling

**2. Highlight Overlay**
```
components/pdf-highlight-overlay.tsx
```
- Renders colored boxes using absolute positioning
- Converts relative coordinates (0-1) to pixels
- Filters by category visibility
- Shows hover tooltips
- Handles click events

**3. Data Hook**
```
hooks/useSkimmingHighlights.ts
```
- Fetches highlight data on mount
- Provides loading/error states
- Calculates category counts
- Returns typed highlight objects

**4. Controls UI**
```
components/skimming-controls.tsx
```
- Category toggle buttons with counts
- Show/Hide all functionality
- Tooltips explaining each category
- Visual feedback for active categories

### Backend Routes

#### Chunks Endpoint
```
app/api/pdf/chunks/route.ts → backend/api/pdf_routes.py
```
Serves parsed and chunked PDF content:
```json
{
  "status": "ready",
  "chunks": [
    {
      "doc_id": "chunk-0",
      "title": "Introduction",
      "page": 1,
      "text": "Full chunk text here..."
    }
  ]
}
```

#### Skimming Data Endpoint
```
app/api/pdf/skimming-data/route.ts
```
Serves highlight coordinates (currently from static JSON):
```json
{
  "status": "ready",
  "highlights": [
    {
      "id": 1,
      "text": "Highlighted text snippet",
      "section": "Section name",
      "label": "novelty",
      "score": 8.5,
      "boxes": [
        {
          "left": 0.1,
          "top": 0.2,
          "width": 0.8,
          "height": 0.03,
          "page": 0
        }
      ],
      "block_id": "block-123"
    }
  ]
}
```

### Integration in PDF Viewer

```tsx
// components/pdf-viewer.tsx

// 1. State management
const [viewMode, setViewMode] = useState<"reading" | "skimming">("reading")
const [highlightsEnabled, setHighlightsEnabled] = useState(false)
const [visibleCategories, setVisibleCategories] = useState(new Set(["novelty", "method", "result"]))

// 2. Fetch highlight data
const { highlights, highlightCounts } = useSkimmingHighlights()

// 3. Create highlight plugin
const highlightPluginInstance = usePDFHighlightPlugin({
  highlights: highlightsEnabled ? highlights : [],
  visibleCategories,
  onHighlightClick: (h) => console.log("Clicked:", h.text),
})

// 4. Add to PDF viewer plugins
const plugins = [...basePlugins, highlightPluginInstance]

// 5. Conditional rendering
{viewMode === "skimming" ? (
  <SkimmingView />
) : (
  <PDFViewer plugins={plugins} />
)}
```

---

## Data Flow Diagrams

### Skimming View Flow
```
User clicks "Skimming"
  → viewMode changes to "skimming"
  → SkimmingView component mounts
  → Fetches /api/pdf/chunks
  → Backend returns parsed sections
  → Groups chunks by title
  → Renders expandable cards
  → User clicks "Jump"
  → Switches to reading mode
  → Navigates to page
```

### Smart Highlights Flow
```
User clicks "Highlights Off"
  → highlightsEnabled = true
  → useSkimmingHighlights() fetches data
  → Highlight plugin receives data
  → PDF renders pages
  → onTextLayerRender fires for each page
  → Plugin creates overlay containers
  → Filters highlights by page + category
  → Converts relative coords to pixels
  → Renders colored boxes
  → User hovers → Tooltip appears
  → User toggles category → Re-filters and re-renders
```

---

## Coordinate System

### Highlight Box Positions

Highlight coordinates use **relative positioning** (0-1 range):

```typescript
{
  left: 0.1,   // 10% from left edge
  top: 0.2,    // 20% from top edge
  width: 0.8,  // 80% of page width
  height: 0.03 // 3% of page height
}
```

**Conversion to pixels:**
```typescript
const pixelLeft = box.left * pageWidth
const pixelTop = box.top * pageHeight
const pixelWidth = box.width * pageWidth
const pixelHeight = box.height * pageHeight
```

This ensures highlights **scale correctly** with:
- Different zoom levels
- Page resizing
- Multi-monitor setups
- Mobile/tablet viewports

---

## Styling & Colors

### Highlight Colors (Updated for Visibility)

**Background Colors** (70% opacity):
```typescript
novelty: "rgba(253, 224, 71, 0.7)"  // Bright yellow
method:  "rgba(96, 165, 250, 0.7)"   // Bright blue
result:  "rgba(74, 222, 128, 0.7)"   // Bright green
```

**Border Colors** (90% opacity, 3px thick):
```typescript
novelty: "rgba(202, 138, 4, 0.9)"   // Dark yellow
method:  "rgba(37, 99, 235, 0.9)"    // Dark blue
result:  "rgba(22, 163, 74, 0.9)"    // Dark green
```

**Opacity States:**
- Default: `0.95` (highly visible)
- Hovered: `1.0` (fully opaque)

---

## Performance Considerations

### Skimming View
- **Lazy expansion**: Sections load content only when expanded
- **Virtual scrolling**: Can handle 100+ sections smoothly
- **Debounced search**: (If implemented) Prevents excessive re-renders

### Smart Highlights
- **Per-page filtering**: Only renders highlights for visible pages
- **React root reuse**: Avoids creating new roots on every render
- **GPU acceleration**: CSS transforms for hover effects
- **Memoization**: Overlay components only re-render when props change

### Optimization Tips
- Limit highlights to **top N highest scores** (e.g., top 50)
- Use **requestAnimationFrame** for smooth animations
- Implement **intersection observer** to only render visible pages
- Cache highlight calculations in **useMemo**

---

## Current Limitations & Future Work

### Current Limitations

1. **Static Highlight Data**: Currently serves from `skimm/CiteRead.json`
   - Only works for specific test PDF
   - Coordinates hardcoded for that document

2. **No Backend Generation**: Highlights not automatically generated
   - Need ML model integration
   - Requires text extraction + classification pipeline

3. **No User Annotations**: Can't manually add/edit highlights
   - Read-only overlays
   - No persistence of user highlights

### Planned Enhancements

#### Backend Integration (Priority)
```python
# backend/src/paperreader/services/skimming/highlighter.py

class SmartHighlighter:
    """Generate skimming highlights from parsed PDF"""

    def extract_highlights(self, pdf_path: str) -> List[Highlight]:
        # 1. Parse PDF with PyMuPDF
        # 2. Extract text blocks with coordinates
        # 3. Classify blocks (novelty/method/result)
        # 4. Score importance (0-10)
        # 5. Return bounding boxes + metadata
        pass
```

#### ML Classification
- Fine-tune **SciBERT** on academic papers
- Classify sentences as Novelty/Method/Result
- Extract importance scores using attention weights
- Map predictions back to PDF coordinates

#### User Features
- **Custom highlights**: Let users add their own
- **Highlight colors**: User-configurable color schemes
- **Export highlights**: Save to JSON/CSV
- **Share highlights**: Collaborative reading

#### Advanced Navigation
- **Highlight-to-highlight jumping**: Navigate between highlights
- **Filter by score threshold**: Show only high-confidence highlights
- **Section-aware filtering**: Only show highlights in current section

---

## Troubleshooting

### Skimming View Issues

**Problem: "No sections found"**
- Check if backend has processed the PDF
- Verify `/api/pdf/chunks` returns data
- Look for errors in backend logs

**Problem: Sections don't expand**
- Check browser console for React errors
- Verify state management in `skimming-view.tsx`

**Problem: Jump doesn't navigate**
- Ensure `onNavigateToPage` callback is connected
- Check `pdf-viewer.tsx` navigation logic

### Smart Highlights Issues

**Problem: No highlights appear**
- Toggle "Highlights Off" button to enable
- Check `/api/pdf/skimming-data` returns data
- Verify highlight data matches current PDF
- Check browser console for plugin errors

**Problem: Highlights in wrong position**
- Coordinates may be for different PDF
- Verify page dimensions match expected values
- Check coordinate conversion logic

**Problem: Performance lag**
- Too many highlights on page
- Reduce highlight count or implement pagination
- Check for memory leaks in React roots

**Problem: Console errors about React roots**
- Should be fixed with current implementation
- Check `usePDFHighlightPlugin.tsx` root management
- Verify `queueMicrotask` is not causing issues

---

## Developer Guide

### Adding Skimming to New PDF Reader

1. **Install dependencies:**
```bash
npm install @react-pdf-viewer/core react-dom
```

2. **Copy these files:**
- `hooks/usePDFHighlightPlugin.tsx`
- `hooks/useSkimmingHighlights.ts`
- `components/pdf-highlight-overlay.tsx`
- `components/skimming-controls.tsx`
- `components/skimming-view.tsx`

3. **Set up backend routes:**
- `/api/pdf/chunks` - Serve parsed sections
- `/api/pdf/skimming-data` - Serve highlight coordinates

4. **Integrate into viewer:**
```tsx
import { usePDFHighlightPlugin } from '@/hooks/usePDFHighlightPlugin'
import { useSkimmingHighlights } from '@/hooks/useSkimmingHighlights'

const { highlights } = useSkimmingHighlights()
const highlightPlugin = usePDFHighlightPlugin({ highlights, ... })

<Viewer plugins={[...otherPlugins, highlightPlugin]} />
```

### Customizing Highlight Colors

Edit `components/pdf-highlight-overlay.tsx`:

```typescript
const CATEGORY_COLORS = {
  novelty: "rgba(YOUR_COLOR_HERE, OPACITY)",
  method: "rgba(YOUR_COLOR_HERE, OPACITY)",
  result: "rgba(YOUR_COLOR_HERE, OPACITY)",
}
```

### Adding New Highlight Categories

1. Update type definition:
```typescript
type HighlightLabel = "novelty" | "method" | "result" | "background"
```

2. Add colors to `CATEGORY_COLORS`

3. Update `SkimmingControls.tsx` with new button

4. Backend must return new label in data

---

## References

### Related Files
- `QUICK_START_HIGHLIGHTS.md` - Quick integration guide
- `SKIMMING_HIGHLIGHTS_GUIDE.md` - Full technical documentation
- `INTEGRATION_EXAMPLE.tsx` - Complete integration example
- `CLAUDE.md` - Project architecture overview

### External Documentation
- [@react-pdf-viewer](https://react-pdf-viewer.dev/) - PDF viewer library
- [PyMuPDF](https://pymupdf.readthedocs.io/) - Backend PDF parsing
- [SciBERT](https://github.com/allenai/scibert) - Scientific text classification

---

## Conclusion

The **Skimming Mechanism** in LOL-PaperReader combines:

✅ **Structured navigation** (Skimming View) for understanding paper organization
✅ **Smart highlights** (Colored overlays) for identifying key content
✅ **Interactive controls** for customizing what information is visible
✅ **Smooth integration** with existing PDF reading workflow

This dual-mode approach enables researchers to **quickly assess papers** before committing to deep reading, saving time and improving comprehension.

**Next Steps:**
1. Integrate ML-based highlight generation backend
2. Add user annotation capabilities
3. Implement collaborative highlighting
4. Build highlight-based paper summarization

Happy skimming! 🚀📚
