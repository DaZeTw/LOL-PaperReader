# PDF Citation Link Detection System

This document explains the citation link detection system that automatically detects citation links in PDF documents and provides hover tooltips with reference previews.

## Overview

When you upload a PDF paper (typically generated from LaTeX/Overleaf), the system:

1. **Detects internal citation links** - PDF citations are implemented as internal link annotations
2. **Shows hover tooltips** - When you hover over a citation number, a tooltip appears with a preview of the reference
3. **Enables smooth scrolling** - Clicking a citation smoothly scrolls to the reference section
4. **Highlights the destination** - The target reference is briefly highlighted when you jump to it

## How It Works

### PDF Citation Structure

In LaTeX/Overleaf PDFs:
- Citations (`\cite{key}`) become **link annotations** with internal destinations
- References have **named destinations** or **anchors**
- PDF.js can extract these annotations and destinations

### Architecture

```
PDFViewer (components/pdf-viewer.tsx)
    └── PDFCitationLinkDetector (components/pdf-citation-link-detector.tsx)
        ├── Loads PDF using PDF.js
        ├── Detects annotation layer links
        ├── Adds hover/click handlers
        └── Shows CitationTooltip
            └── CitationTooltip (components/citation-tooltip.tsx)
```

### Key Components

#### 1. `lib/pdf-citation-utils.ts`
Utility functions for working with PDF citations:
- `extractCitationLinks()` - Extract citation links from PDF pages
- `getReferenceAtDestination()` - Get reference text at a PDF destination
- `getPageNumberFromDestination()` - Get page number from a destination
- `convertPDFRectToViewport()` - Convert PDF coordinates to screen coordinates

#### 2. `components/pdf-citation-link-detector.tsx`
Main detection component:
- Loads PDF document using PDF.js
- Watches for annotation layers in the PDF viewer
- Detects internal links (`a[data-internal-link]`)
- Adds hover handlers to show tooltips
- Adds click handlers for smooth scrolling

#### 3. `components/citation-tooltip.tsx`
Tooltip component that displays:
- Reference text preview (up to 500 characters)
- Page number where the reference is located
- Instruction to click to jump

#### 4. `components/citation-link-overlay.tsx`
Alternative component for manual overlay of citation links (optional):
- Creates clickable overlays at citation positions
- Can be used if annotation layer detection doesn't work

## Usage

### Basic Integration

The system is automatically integrated into `PDFViewer`:

```tsx
<PDFViewer
  file={pdfFile}
  // ... other props
/>
```

That's it! The citation detection happens automatically.

### How Citations Are Detected

The system looks for:
1. **Internal PDF links** - Links with `data-internal-link` attribute or `href="#..."` format
2. **Annotation layer** - PDF.js renders these in `.rpv-core__annotation-layer`
3. **Destinations** - Each link has a destination pointing to a location in the PDF

### User Experience

1. **Hover over citation number** (e.g., [1], [2])
   - Wait 300ms → Tooltip appears
   - Shows reference preview from the References section
   - Displays page number

2. **Click citation**
   - Jumps to the reference page
   - Scrolls smoothly to the reference
   - Briefly highlights the reference (blue flash effect)

## Technical Details

### PDF.js Integration

```typescript
// Load PDF
const pdf = await pdfjsLib.getDocument(url).promise;

// Get reference at destination
const destArray = await pdf.getDestination(destination);
const pageIndex = await pdf.getPageIndex(destArray[0]);
const page = await pdf.getPage(pageIndex + 1);
const textContent = await page.getTextContent();

// Extract text near destination Y-coordinate
const targetY = destArray[3];
```

### Event Handling

```typescript
// Hover to show tooltip
anchor.addEventListener('mouseenter', async (e) => {
  // Wait 300ms before showing tooltip
  setTimeout(async () => {
    const reference = await getReferenceAtDestination(pdf, destination);
    setHoveredReference(reference);
  }, 300);
});

// Click to navigate
anchor.addEventListener('click', async (e) => {
  e.preventDefault();
  const pageNumber = await getPageNumberFromDestination(pdf, destination);
  jumpToPage(pageNumber);
});
```

### Smooth Scrolling

When a citation is clicked:

```typescript
// Jump to page
handleJumpToPageDirect(pageNumber);

// Smooth scroll to page element
pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

// Flash highlight effect
setTimeout(() => {
  pageElement.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
  setTimeout(() => {
    pageElement.style.backgroundColor = 'transparent';
  }, 1000);
}, 500);
```

## Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support (with PDF.js)

## Performance Considerations

1. **Lazy loading** - Citation links are detected as pages load
2. **MutationObserver** - Watches for new annotation layers efficiently
3. **Debounced tooltips** - 300ms delay prevents excessive tooltip showing
4. **Cleanup** - Event listeners are properly removed when component unmounts

## Fallback Behavior

If the PDF doesn't have internal link annotations:
- The system gracefully does nothing
- No errors are shown to users
- Regular PDF viewing continues to work

## Debugging

Enable console logs to see detection in action:

```javascript
console.log('[PDFCitationLinkDetector] Found X annotation layers');
console.log('[PDFCitationLinkDetector] Layer Y has Z internal links');
```

## Future Enhancements

Potential improvements:
- [ ] Support for multiple citation formats ([1-3], [1,2,3])
- [ ] Bidirectional navigation (back to citation from reference)
- [ ] Keyboard shortcuts (e.g., Alt+Click to open reference in new window)
- [ ] Citation context extraction (surrounding text)
- [ ] Support for footnote-style citations

## Testing

To test the citation detection system:

1. Upload a PDF paper with citations (LaTeX-generated PDFs work best)
2. Look for citation numbers in the text (usually superscript or in brackets)
3. Hover over a citation → Tooltip should appear
4. Click the citation → Should jump to the reference section
5. Observe the smooth scroll and highlight effect

## Troubleshooting

**Tooltips not showing:**
- Check if PDF has internal link annotations (not all PDFs do)
- Check browser console for errors
- Verify PDF.js worker is loading correctly

**Clicks not working:**
- Ensure `onCitationClick` handler is properly connected
- Check if page navigation is working in general
- Verify destination resolution isn't failing

**Performance issues:**
- Reduce tooltip delay (currently 300ms)
- Disable if PDF has too many citations (>1000)
- Check MutationObserver isn't triggering too frequently
