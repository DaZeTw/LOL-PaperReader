# Citation-to-Reference Navigation Guide

## Overview

You want citations (like `[1]`, `²`, `³`) in the body of the paper to **jump to the actual reference entry** in the references/bibliography section at the end of the PDF, not show mock data.

## How It Works in the Extension

### Extension Pattern (`pdf_loader-compiled.js:36-51`)

The extension uses **PDF Annotations with Internal Destinations**:

```javascript
// 1. Get annotations from PDF page
const annotations = await page.getAnnotations();

// 2. Filter for Link annotations with internal destinations
const citationLinks = annotations.filter(annotation => {
  return (
    annotation.subtype === 'Link' &&  // Must be a link
    annotation.dest &&                // Has internal destination
    !annotation.url                   // NOT an external URL
  );
});

// 3. When clicked, resolve destination and jump
const destArray = typeof annotation.dest === 'string'
  ? await pdf.getDestination(annotation.dest)
  : annotation.dest;

// 4. Get target page number
const pageIndex = await pdf.getPageIndex(destArray[0]);
const targetPage = pageIndex + 1;

// 5. Navigate to that page
jumpToPage(targetPage);
```

### Key Insight

**The PDF file itself must have internal link annotations** embedded by the paper's authors. These are created when:
- Paper is exported from LaTeX with `hyperref` package
- Paper is created in Word with automatic cross-references
- PDF is post-processed with tools that add navigation

**If the PDF doesn't have these annotations, you must create the links yourself.**

---

## Your Current Implementation

### ✅ What You've Already Built

**File: `components/pdf-citation-link-detector.tsx`**

You already detect and handle internal PDF links:

```typescript
// Lines 85-99: Find all internal links in annotation layers
const links = layer.querySelectorAll('a[data-internal-link]');

links.forEach((link) => {
  const dest = anchor.getAttribute('data-destination');

  // On click, jump to destination
  const pageNumber = await getPageNumberFromDestination(
    pdfDocument,
    destination
  );

  if (pageNumber && onCitationClick) {
    onCitationClick(pageNumber); // Jump to that page
  }
});
```

**File: `lib/pdf-citation-utils.ts`**

You have utilities to:
- Extract citation links from PDF (line 50-74)
- Get reference text at destination (line 96-157)
- Convert destinations to page numbers (line 162-181)

---

## The Problem You're Facing

Based on your question, I believe the issue is:

### Scenario 1: PDF Has No Internal Links
Most research papers **don't have internal link annotations** for citations. The citation numbers appear as plain text (like `[1]` or superscript `²`), not clickable links.

**Solution:** You need to:
1. Detect citation text patterns (already done in `pdf-viewer.tsx:222-695`)
2. Parse the references section
3. Match citation numbers to reference entries
4. Manually create the jump functionality

### Scenario 2: Citations Don't Show Real Reference Data
Your popup shows citation metadata from `parsedData.references`, which might be mock data from your parser API.

**Solution:** Extract actual reference text from the PDF's references section.

---

## Complete Implementation Guide

### Option 1: Use PDF Internal Links (If Available)

**When to use:** Paper has embedded links (check by clicking `[1]` - does it jump?)

**Your code already handles this!** (`PDFCitationLinkDetector` component)

Test if it works:
1. Upload a paper with hyperlinked citations
2. Click a citation number
3. It should jump to references section

---

### Option 2: Manual Citation-to-Reference Mapping

**When to use:** Paper has NO embedded links (most cases)

#### Step 1: Parse References Section

Create `lib/reference-parser.ts`:

```typescript
import * as pdfjsLib from 'pdfjs-dist';

export interface Reference {
  number: number;
  text: string;
  pageNum: number;
  yPosition: number; // For scrolling to exact location
}

/**
 * Extract references from the references section of a PDF
 */
export async function extractReferences(
  pdf: pdfjsLib.PDFDocumentProxy
): Promise<Reference[]> {
  const references: Reference[] = [];

  // Find the "References" section (usually last few pages)
  const startPage = Math.max(1, pdf.numPages - 5); // Check last 5 pages

  for (let pageNum = startPage; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    // Combine text items into lines
    const items = textContent.items as any[];
    let fullText = '';
    let lines: Array<{ text: string; y: number }> = [];

    // Group text by Y position (create lines)
    items.forEach(item => {
      if (!item.str.trim()) return;

      const y = item.transform[5];
      const existingLine = lines.find(l => Math.abs(l.y - y) < 3);

      if (existingLine) {
        existingLine.text += item.str;
      } else {
        lines.push({ text: item.str, y });
      }
    });

    // Sort lines top to bottom
    lines.sort((a, b) => b.y - a.y);

    // Look for "References" heading
    const refHeaderIndex = lines.findIndex(line =>
      /^(References|Bibliography|Works Cited)$/i.test(line.text.trim())
    );

    if (refHeaderIndex === -1 && pageNum === startPage) {
      continue; // Keep searching
    }

    // Extract numbered references
    const startIndex = refHeaderIndex !== -1 ? refHeaderIndex + 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];

      // Match patterns like:
      // [1] Author. Title.
      // 1. Author. Title.
      const match = line.text.match(/^\[?(\d+)\]?\.?\s+(.+)/);

      if (match) {
        const number = parseInt(match[1]);
        let refText = match[2];

        // Collect continuation lines (multi-line references)
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j];
          // If next line starts with number/bracket, it's a new reference
          if (/^\[?\d+\]?\.?\s/.test(nextLine.text)) break;
          // If next line is "References" or section heading, stop
          if (/^[A-Z][a-z]+$/.test(nextLine.text.trim())) break;

          refText += ' ' + nextLine.text;
          j++;
        }

        references.push({
          number,
          text: refText.trim(),
          pageNum,
          yPosition: line.y,
        });

        i = j - 1; // Skip processed lines
      }
    }
  }

  return references;
}
```

#### Step 2: Match Citations to References

In `pdf-viewer.tsx`, modify citation click handler:

```typescript
// Add state for parsed references
const [pdfReferences, setPdfReferences] = useState<Reference[]>([]);

// Parse references when PDF loads
useEffect(() => {
  if (!pdfUrl) return;

  const parseRefs = async () => {
    try {
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      const refs = await extractReferences(pdf);
      setPdfReferences(refs);
      console.log('[v0] Extracted', refs.length, 'references from PDF');
    } catch (error) {
      console.error('[v0] Error parsing references:', error);
    }
  };

  parseRefs();
}, [pdfUrl]);

// Modify citation click handler (line 605-673)
span.onclick = async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const citationNum = citationNums[0]; // Get first citation number

  // Find matching reference
  const reference = pdfReferences.find(ref => ref.number === citationNum);

  if (reference) {
    console.log('[v0] Jumping to reference', citationNum, 'on page', reference.pageNum);

    // Jump to reference page
    handleJumpToPageDirect(reference.pageNum);

    // Scroll to exact Y position after page loads
    setTimeout(() => {
      if (viewerContainerRef.current) {
        const pageElement = viewerContainerRef.current.querySelector(
          `[data-page-number="${reference.pageNum}"]`
        ) as HTMLElement;

        if (pageElement) {
          // Calculate scroll position based on Y coordinate
          const scrollY = reference.yPosition * scale; // Adjust for zoom
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

          // Highlight the reference briefly
          // (You could add a highlight overlay here)
        }
      }
    }, 500);
  } else {
    console.warn('[v0] Reference', citationNum, 'not found in parsed references');
  }
};
```

#### Step 3: Show Real Reference in Popup

Modify citation popup to show extracted reference text:

```typescript
// In citation hover handler (line 513)
hoverTimeoutRef.current = setTimeout(async () => {
  const citationNum = citationNums[0];

  // Get real reference from parsed PDF
  const reference = pdfReferences.find(ref => ref.number === citationNum);

  if (reference) {
    setCitationPopup({
      citation: {
        number: citationNum,
        text: reference.text,  // Real reference text from PDF!
        title: extractTitleFromReference(reference.text),
        authors: extractAuthorsFromReference(reference.text),
        year: extractYearFromReference(reference.text),
      },
      position: {
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      },
      paperUrl: null, // Will be fetched separately
      loadingUrl: false,
    });
  }
}, 500);
```

#### Step 4: Helper Functions for Parsing Reference Text

```typescript
/**
 * Extract title from reference text (very basic heuristic)
 */
function extractTitleFromReference(text: string): string {
  // Title is usually after authors and before year
  // Example: "Smith, J. Deep Learning. Nature (2020)"
  //          Authors    ^^^^Title^^^  Venue  Year

  // Match text between first period and publication venue/year
  const match = text.match(/\.\s+([^.]+?)\.\s+/);
  return match ? match[1].trim() : text.split('.')[1]?.trim() || text.substring(0, 100);
}

/**
 * Extract year from reference text
 */
function extractYearFromReference(text: string): string | undefined {
  const match = text.match(/\((\d{4})\)/); // Match (2020)
  return match ? match[1] : undefined;
}

/**
 * Extract authors from reference text (first part before period)
 */
function extractAuthorsFromReference(text: string): string | undefined {
  const authors = text.split('.')[0]?.trim();
  return authors && authors.length < 100 ? authors : undefined;
}
```

---

## Extension's Approach vs Your Approach

| Aspect | Extension | Your Current Code | Recommended |
|--------|-----------|-------------------|-------------|
| Link Detection | Uses `getAnnotations()` API | Uses react-pdf-viewer annotation layer | Both work! Use yours. |
| Citation-to-Ref Mapping | Relies on PDF internal links | Needs manual parsing | Add manual parsing (Option 2) |
| Reference Text | Extracted from PDF at destination | Mock data from API | Extract from PDF |
| Navigation | `jumpToPage` + scroll to Y coord | `jumpToPage` only | Add Y-coordinate scrolling |

---

## Summary of What to Implement

### ✅ Already Working
- Internal link detection (`PDFCitationLinkDetector`)
- Citation number detection in text (`pdf-viewer.tsx`)
- Basic popup display
- Page navigation

### 🔧 Need to Add
1. **Reference parser** (`extractReferences` function)
2. **Citation-to-reference matching** (map citation number to reference)
3. **Show real reference text** (replace mock data with parsed text)
4. **Precise scrolling** (scroll to exact Y position, not just page)
5. **Reference highlighting** (briefly highlight the reference when jumped to)

---

## Testing Your Implementation

### Test Case 1: Paper WITH Internal Links
1. Upload a LaTeX paper with `hyperref`
2. Click citation `[1]` in body
3. ✅ Should jump to reference #1 (via `PDFCitationLinkDetector`)

### Test Case 2: Paper WITHOUT Internal Links
1. Upload a regular PDF (e.g., scanned paper)
2. Hover over citation `[1]` in body
3. ✅ Popup should show actual reference text from bibliography
4. Click citation
5. ✅ Should jump to references section and highlight entry #1

---

## Code Location Summary

**Your existing files:**
- `components/pdf-citation-link-detector.tsx` - Handles PDF internal links ✅
- `lib/pdf-citation-utils.ts` - PDF annotation utilities ✅
- `components/pdf-viewer.tsx` lines 222-695 - Citation detection ✅
- `components/pdf-viewer.tsx` lines 1128-1317 - Citation popup ✅

**Files to create:**
- `lib/reference-parser.ts` - Parse references section
- Update `pdf-viewer.tsx` - Add reference parsing + matching logic

---

## Extension Code References

**Extension files analyzed:**
- `extension/pdf_loader-compiled.js:36-51` - Annotation extraction
- `extension/pdf_loader-compiled.js:44` - Destination handling
- `extension/reader-compiled.js:169-171` - Citation link creation
- `extension/reader-compiled.js:170` - Reference display function `Rj`

The extension relies heavily on **PDF.js `getAnnotations()` API**, which you're already using correctly!

---

## Next Steps

1. **Test if your PDFs have internal links:**
   - Open PDF in browser
   - Try clicking a citation number
   - If it jumps to references → use `PDFCitationLinkDetector` (already working!)
   - If it doesn't jump → implement Option 2 (reference parser)

2. **Implement reference parser** (Option 2 above)

3. **Replace mock citation data** with real extracted references

4. **Add Y-coordinate scrolling** for precise navigation

Let me know which option you need help implementing!
