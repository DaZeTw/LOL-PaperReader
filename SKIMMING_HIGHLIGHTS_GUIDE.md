# Skimming Mode - Visual Highlighting System

## 🎯 Overview

This system adds **CiteRead-style visual highlighting** directly onto PDF pages, allowing users to see important sentences highlighted with different colors based on their category (novelty, method, result).

## ✨ Features

- **Visual Highlights**: Colored rectangles overlaid on PDF using bounding box coordinates
- **Category Filtering**: Toggle novelty/method/result highlights independently
- **Interactive Tooltips**: Hover over highlights to see full text and metadata
- **Score-Based Importance**: Highlights include importance scores
- **Smooth Animations**: Hover effects and category toggles with transitions

## 📁 New Components

### 1. `components/pdf-highlight-overlay.tsx`
Renders colored highlight rectangles on a PDF page using bounding box coordinates.

**Features:**
- Converts relative coordinates (0-1) to pixel positions
- Different colors for each category (yellow/blue/green)
- Hover effects with scale animation
- Interactive tooltips showing highlight text, score, and section

**Props:**
```typescript
{
  pageNumber: number        // Current page (1-indexed)
  pageWidth: number         // Page width in pixels
  pageHeight: number        // Page height in pixels
  highlights: SkimmingHighlight[]  // Array of highlights
  visibleCategories: Set<string>   // Which categories to show
  onHighlightClick?: (highlight: SkimmingHighlight) => void
}
```

### 2. `components/skimming-controls.tsx`
Control panel for toggling highlight categories.

**Features:**
- Toggle buttons for novelty/method/result
- Highlight counts per category
- Show/hide all button
- Tooltips with descriptions
- Color-coded UI matching highlight colors

### 3. `hooks/usePDFHighlightPlugin.tsx`
Custom @react-pdf-viewer plugin to inject highlight overlays into rendered pages.

**How it works:**
- Listens to `onTextLayerRender` events
- Creates React portals in PDF page layers
- Renders highlight overlays for each page
- Manages React roots for cleanup

### 4. `hooks/useSkimmingHighlights.ts`
Fetches and manages skimming highlight data.

**Features:**
- Loads highlights from API
- Calculates category counts
- Loading/error states
- Type-safe highlight interface

### 5. `app/api/pdf/skimming-data/route.ts`
API endpoint serving skimming highlight data.

**Current implementation:**
- Serves `skimm/CiteRead.json` example data
- Returns empty state if no data available
- TODO: Generate from backend PDF analysis

## 🎨 Color Scheme

| Category | Background | Border | Icon |
|----------|-----------|--------|------|
| Novelty | `rgba(254, 240, 138, 0.4)` (yellow) | `rgba(234, 179, 8, 0.6)` | ⭐ Sparkles |
| Method | `rgba(147, 197, 253, 0.4)` (blue) | `rgba(59, 130, 246, 0.6)` | 🧪 FlaskConical |
| Result | `rgba(134, 239, 172, 0.4)` (green) | `rgba(34, 197, 94, 0.6)` | 📈 TrendingUp |

## 📊 Data Format

The system uses CiteRead-style JSON with this structure:

```json
[
  {
    "id": 6,
    "text": "In this work, we introduce a novel paper reading experience...",
    "section": "ABSTRACT",
    "label": "novelty",
    "score": 4,
    "boxes": [
      {
        "left": 0.44097,    // Relative to page width (0-1)
        "top": 0.40069,     // Relative to page height (0-1)
        "width": 0.03949,   // Relative width
        "height": 0.01132,  // Relative height
        "page": 0           // Page number (0-indexed)
      }
    ],
    "block_id": "f1d0f2b4-b714-47bf-a50e-05ceb0ef1c07"
  }
]
```

**Key Fields:**
- `boxes[]`: Multiple boxes for multi-line highlights
- `page`: 0-indexed page number
- `label`: "novelty" | "method" | "result"
- `score`: Importance score (0-5)

## 🔌 Integration

### Step 1: Add to pdf-viewer.tsx

```tsx
import { useSkimmingHighlights } from "@/hooks/useSkimmingHighlights"
import { usePDFHighlightPlugin } from "@/hooks/usePDFHighlightPlugin"
import { SkimmingControls } from "@/components/skimming-controls"

export function PDFViewer({ file, ... }: PDFViewerProps) {
  // Add skimming state
  const [skimmingMode, setSkimmingMode] = useState(false)
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    new Set(["novelty", "method", "result"])
  )

  // Fetch highlights
  const { highlights, loading, error, highlightCounts } = useSkimmingHighlights()

  // Create highlight plugin
  const highlightPluginInstance = usePDFHighlightPlugin({
    highlights: skimmingMode ? highlights : [],
    visibleCategories,
    onHighlightClick: (h) => console.log("Clicked:", h.text),
  })

  // Add to plugins array
  const plugins = [
    pageNavigationPluginInstance,
    zoomPluginInstance,
    thumbnailPluginInstance,
    bookmarkPluginInstance,
    citationPluginInstance,
    highlightPluginInstance, // ← Add this
  ]

  return (
    <div>
      {/* Add skimming controls above PDF */}
      {skimmingMode && (
        <SkimmingControls
          visibleCategories={visibleCategories}
          onToggleCategory={(cat) => {
            setVisibleCategories(prev => {
              const next = new Set(prev)
              next.has(cat) ? next.delete(cat) : next.add(cat)
              return next
            })
          }}
          onToggleAll={() => {
            setVisibleCategories(prev =>
              prev.size === 3 ? new Set() : new Set(["novelty", "method", "result"])
            )
          }}
          highlightCounts={highlightCounts}
        />
      )}

      {/* Render PDF with plugins */}
      <Viewer
        fileUrl={pdfUrl}
        plugins={plugins}
        {...otherProps}
      />
    </div>
  )
}
```

### Step 2: Add Toggle Button

Add a button to toggle skimming mode:

```tsx
<Button
  variant={skimmingMode ? "default" : "ghost"}
  onClick={() => setSkimmingMode(!skimmingMode)}
>
  <Eye className="h-4 w-4" />
  {skimmingMode ? "Disable Highlights" : "Enable Highlights"}
</Button>
```

## 🧪 Testing

### Test with CiteRead.json

1. **Load the PDF**
   ```bash
   # Ensure skimm/CiteRead.json exists
   # and matches the PDF you're viewing
   ```

2. **Toggle Skimming Mode**
   - Click "Enable Highlights" button
   - Should see colored rectangles on PDF pages

3. **Test Category Filters**
   - Click "Novelty" → yellow highlights disappear
   - Click again → yellow highlights reappear
   - Try all three categories

4. **Test Interactions**
   - Hover over highlight → tooltip appears
   - Tooltip shows text, score, section
   - Hover effects (scale animation) work

5. **Test Page Navigation**
   - Highlights should appear on correct pages
   - Navigate between pages → highlights update
   - Zoom in/out → highlights scale correctly

### Verify Coordinate Accuracy

The bounding boxes in CiteRead.json use relative coordinates (0-1 range). To verify they're correct:

1. Open CiteRead_skimming.pdf
2. Enable highlights
3. Check if yellow/blue/green boxes align with text
4. Adjust if needed (recalculate bounding boxes)

## 🐛 Troubleshooting

### Highlights not appearing

**Check:**
- Is `skimmingMode` enabled?
- Are there highlights for the current page?
- Is at least one category visible?
- Open console → check for errors in `usePDFHighlightPlugin`

### Highlights in wrong position

**Possible causes:**
- Bounding box coordinates may be for different PDF
- Page dimensions not calculated correctly
- Need to recalculate boxes for your specific PDF

**Fix:**
Check page dimensions in plugin:
```tsx
console.log("Page dimensions:", pageWidth, pageHeight)
console.log("Box coords:", box)
```

### Performance issues

**Solutions:**
- Limit number of highlights per page
- Use `React.memo` on overlay component
- Debounce hover events
- Only render highlights for visible pages

## 📝 TODO: Generate Highlights from Backend

Currently using static CiteRead.json. To generate highlights from your PDFs:

### Backend Implementation Needed

```python
# backend/src/paperreader/services/skimming/highlight_extractor.py

class HighlightExtractor:
    def extract_highlights(self, pdf_path: str) -> List[Highlight]:
        """
        1. Parse PDF with PyMuPDF
        2. Extract sentences
        3. Classify by importance (novelty/method/result)
        4. Score each sentence (0-5)
        5. Get bounding boxes for each sentence
        6. Return highlight data
        """
        pass

# Example output:
[
    {
        "id": 1,
        "text": "We propose a novel approach...",
        "section": "Introduction",
        "label": "novelty",
        "score": 4.2,
        "boxes": [
            {
                "left": 0.1,
                "top": 0.2,
                "width": 0.8,
                "height": 0.02,
                "page": 0
            }
        ]
    }
]
```

### API Endpoint

```python
# backend/src/paperreader/api/pdf_routes.py

@router.get("/skimming-highlights")
async def get_skimming_highlights():
    """Generate or retrieve skimming highlights for current PDF"""
    pipeline = await get_pipeline()
    pdf_path = pipeline.config.data_dir + "/document.pdf"

    extractor = HighlightExtractor()
    highlights = extractor.extract_highlights(pdf_path)

    return {"status": "ok", "highlights": highlights}
```

### Techniques for Classification

**Sentence Classification:**
- Use SciBERT or similar model
- Train on labeled academic sentences
- Classify: novelty / method / result / background

**Importance Scoring:**
- Position in paper (intro/conclusion = higher)
- Presence of key terms ("propose", "show that", "results")
- Citation patterns
- Sentence length and complexity

**Bounding Box Extraction:**
- Use PyMuPDF `page.get_text("dict")`
- Get `bbox` for each word/sentence
- Merge adjacent boxes for multi-line text
- Convert to relative coordinates (0-1)

## 🎓 References

Based on:
- **CiteRead** paper (IUI '22)
- **SCIM** (Skimming Interface for Microcontent)
- Academic paper skimming research

## 📦 Dependencies

```json
{
  "@react-pdf-viewer/core": "^3.12.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "lucide-react": "^0.263.1"
}
```

## ✅ Summary

This implementation provides:

✅ **Visual highlighting** on PDF pages
✅ **Category-based filtering** (novelty/method/result)
✅ **Interactive tooltips** with metadata
✅ **Smooth animations** and hover effects
✅ **Scalable architecture** for adding new features
✅ **CiteRead-compatible** data format

Next steps:
- [ ] Generate highlights from backend
- [ ] Train classifier for label prediction
- [ ] Add importance scoring algorithm
- [ ] Cache highlights in database
- [ ] Support custom highlight colors
- [ ] Export highlighted PDFs

---

**Status**: ✅ Frontend Complete
**TODO**: Backend highlight generation
**Date**: 2025-01-20
