# Citation Detection System - Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PDF Reader Application                       │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      PDFViewer Component                      │   │
│  │                   (components/pdf-viewer.tsx)                │   │
│  │                                                                │   │
│  │  ┌──────────────────┐      ┌──────────────────────────┐     │   │
│  │  │  @react-pdf-     │      │  PDFCitationLink         │     │   │
│  │  │  viewer/core     │      │  Detector                │     │   │
│  │  │                  │      │  (NEW)                   │     │   │
│  │  │  - Renders PDF   │      │                          │     │   │
│  │  │  - Text layer    │      │  - Watches annotations   │     │   │
│  │  │  - Annotations   │      │  - Detects links         │     │   │
│  │  │  - Navigation    │      │  - Shows tooltips        │     │   │
│  │  └──────────────────┘      └──────────────────────────┘     │   │
│  │           │                            │                      │   │
│  │           │                            │                      │   │
│  │           ▼                            ▼                      │   │
│  │  ┌────────────────────────────────────────────────────┐     │   │
│  │  │        Annotation Layer (PDF.js renders)           │     │   │
│  │  │                                                     │     │   │
│  │  │   <a data-internal-link href="#dest1">1</a>       │     │   │
│  │  │   <a data-internal-link href="#dest2">2</a>       │     │   │
│  │  │   <a data-internal-link href="#dest3">3</a>       │     │   │
│  │  └────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

## Component Interaction Flow

```
┌─────────────┐
│   User      │
│   Action    │
└──────┬──────┘
       │
       │ 1. Hover over citation [1]
       ▼
┌─────────────────────────────────────────┐
│  PDFCitationLinkDetector                │
│  (components/pdf-citation-link-         │
│   detector.tsx)                         │
│                                         │
│  • Detects mouseenter event             │
│  • Extracts destination from link       │
│  • Sets tooltip position                │
└──────┬──────────────────────────────────┘
       │
       │ 2. Fetch reference text
       ▼
┌─────────────────────────────────────────┐
│  PDF.js Utilities                       │
│  (lib/pdf-citation-utils.ts)            │
│                                         │
│  • getReferenceAtDestination()          │
│  • Loads PDF page at destination        │
│  • Extracts text near Y-coordinate      │
│  • Returns ReferencePreview             │
└──────┬──────────────────────────────────┘
       │
       │ 3. Display preview
       ▼
┌─────────────────────────────────────────┐
│  CitationTooltip                        │
│  (components/citation-tooltip.tsx)      │
│                                         │
│  ┌───────────────────────────────┐     │
│  │ 📖 Reference • Page 15        │     │
│  │                               │     │
│  │ [1] Smith et al. "Title..."  │     │
│  │                               │     │
│  │ Click to jump to reference    │     │
│  └───────────────────────────────┘     │
└─────────────────────────────────────────┘

       User clicks citation
              │
              ▼
┌─────────────────────────────────────────┐
│  Smooth Scroll Handler                  │
│  (pdf-viewer.tsx)                       │
│                                         │
│  1. handleCitationLinkClick()           │
│  2. jumpToPage(pageNumber)              │
│  3. scrollIntoView({ smooth })          │
│  4. Flash highlight effect              │
└─────────────────────────────────────────┘
```

## Data Flow

```
PDF File
   │
   ▼
┌──────────────────┐
│  PDF.js Parser   │
│  (pdfjs-dist)    │
└────┬─────────────┘
     │
     ├─────────────────────────┐
     │                         │
     ▼                         ▼
┌─────────────┐     ┌──────────────────┐
│ Annotations │     │ Page Content     │
│ (Links)     │     │ (Text)           │
└─────┬───────┘     └────┬─────────────┘
      │                  │
      │                  │
      ▼                  ▼
┌──────────────────────────────────┐
│  Citation Link Detection         │
│                                  │
│  Link: [1] → dest: "ref-1"      │
│  Position: { x, y, w, h }        │
└────┬─────────────────────────────┘
     │
     ▼
┌──────────────────────────────────┐
│  Reference Text Extraction       │
│                                  │
│  dest: "ref-1"                   │
│  → Page 15, Y: 742               │
│  → Text: "Smith et al..."        │
└────┬─────────────────────────────┘
     │
     ▼
┌──────────────────────────────────┐
│  User Interface                  │
│  • Hover tooltip                 │
│  • Click navigation              │
│  • Smooth scroll                 │
└──────────────────────────────────┘
```

## File Structure

```
LOL-PaperReader/
├── components/
│   ├── pdf-viewer.tsx                    [Modified: Added detector]
│   ├── pdf-citation-link-detector.tsx    [New: Main detector]
│   ├── citation-tooltip.tsx              [New: Tooltip UI]
│   └── citation-link-overlay.tsx         [New: Alternative overlay]
│
├── lib/
│   ├── pdf-citation-utils.ts             [New: PDF.js utilities]
│   └── scroll-utils.ts                   [New: Scroll helpers]
│
└── Documentation/
    ├── CITATION_DETECTION.md             [New: Technical docs]
    ├── CITATION_FEATURE_SUMMARY.md       [New: Feature summary]
    ├── QUICK_START_CITATION_DETECTION.md [New: Quick start]
    └── ARCHITECTURE_DIAGRAM.md           [New: This file]
```

## Event Flow Diagram

```
User Interaction                Component Response
─────────────────              ──────────────────────

Hover over [1] ──────┐
                     │
                     ├──> mouseenter event
                     │
                     ├──> 300ms delay
                     │
                     ├──> Extract destination
                     │
                     ├──> Fetch reference text
                     │
                     └──> Show tooltip ─────> Tooltip appears


Click on [1] ────────┐
                     │
                     ├──> click event
                     │
                     ├──> preventDefault()
                     │
                     ├──> Get page number
                     │
                     ├──> jumpToPage()
                     │
                     ├──> scrollIntoView()
                     │
                     └──> Flash highlight ──> Smooth scroll
                                              Blue flash


Move mouse away ─────┐
                     │
                     ├──> mouseleave event
                     │
                     ├──> 200ms delay
                     │
                     └──> Hide tooltip ─────> Tooltip fades out
```

## State Management

```
PDFCitationLinkDetector State:
┌────────────────────────────────┐
│ pdfDocument: PDFDocumentProxy  │  ← Loaded PDF
│ hoveredReference: Reference    │  ← Current hovered citation
│ tooltipPosition: { x, y }      │  ← Tooltip screen position
│ isTooltipVisible: boolean      │  ← Show/hide state
└────────────────────────────────┘

CitationTooltip State:
┌────────────────────────────────┐
│ adjustedPosition: { x, y }     │  ← Final position (adjusted)
└────────────────────────────────┘

PDFViewer State:
┌────────────────────────────────┐
│ currentPage: number            │  ← Updated on navigation
│ scale: number                  │  ← Zoom level
└────────────────────────────────┘
```

## Technology Stack

```
┌───────────────────────────────────────┐
│           React Components            │
│  • PDFViewer                          │
│  • PDFCitationLinkDetector            │
│  • CitationTooltip                    │
└───────────┬───────────────────────────┘
            │
            ├─────────────────┐
            │                 │
            ▼                 ▼
┌─────────────────┐   ┌─────────────────┐
│   PDF.js        │   │ @react-pdf-     │
│   (pdfjs-dist)  │   │ viewer/core     │
│                 │   │                 │
│ • Parse PDF     │   │ • Render PDF    │
│ • Annotations   │   │ • UI components │
│ • Text extract  │   │ • Plugins       │
└─────────────────┘   └─────────────────┘
            │                 │
            └────────┬────────┘
                     ▼
            ┌─────────────────┐
            │   Browser APIs  │
            │ • DOM           │
            │ • MutationObs   │
            │ • Events        │
            └─────────────────┘
```

## Performance Optimization

```
┌─────────────────────────────────────────┐
│  Performance Strategies                 │
├─────────────────────────────────────────┤
│                                         │
│  1. Lazy Detection                      │
│     ┌─────────────────────────┐         │
│     │ Only process visible    │         │
│     │ annotation layers       │         │
│     └─────────────────────────┘         │
│                                         │
│  2. MutationObserver                    │
│     ┌─────────────────────────┐         │
│     │ Efficient DOM watching  │         │
│     │ No polling needed       │         │
│     └─────────────────────────┘         │
│                                         │
│  3. Debounced Tooltips                  │
│     ┌─────────────────────────┐         │
│     │ 300ms delay prevents    │         │
│     │ excessive API calls     │         │
│     └─────────────────────────┘         │
│                                         │
│  4. Event Listener Cleanup              │
│     ┌─────────────────────────┐         │
│     │ Remove listeners on     │         │
│     │ component unmount       │         │
│     └─────────────────────────┘         │
│                                         │
│  5. Text Caching                        │
│     ┌─────────────────────────┐         │
│     │ PDF.js caches page      │         │
│     │ content automatically   │         │
│     └─────────────────────────┘         │
└─────────────────────────────────────────┘
```

## Error Handling

```
Error Scenarios                 Handling Strategy
───────────────                ──────────────────

No annotations found     ──>   Gracefully skip
                               (no error shown)

Destination not found    ──>   Log warning
                               Don't show tooltip

PDF loading fails        ──>   Catch error
                               Reset state

Text extraction fails    ──>   Log error
                               Show partial text

Navigation error         ──>   Log error
                               Don't jump page
```

## Integration Points

```
┌────────────────────────────────────────────┐
│        Existing Citation System            │
│   (parsedData.references + CitationPopup)  │
└────────────────┬───────────────────────────┘
                 │
                 │ Works alongside
                 │
┌────────────────▼───────────────────────────┐
│        NEW: PDF Annotation Detection       │
│   (PDFCitationLinkDetector + Tooltip)      │
└────────────────────────────────────────────┘

Both systems coexist:
• Old: External paper links
• New: Internal PDF navigation
```

This architecture provides a clean, performant, and maintainable solution for PDF citation detection and navigation.
