# Citation Extraction Integration

## Overview
This document describes how `lib/extractCitationReference.js` has been integrated into the citation popup system to extract full reference text from PDF papers.

## Implementation Summary

### 1. API Endpoint (`app/api/citations/extract/route.ts`)
Created a Next.js API route that:
- Accepts uploaded PDF files via POST request
- Uses PDF.js to parse the PDF and extract citation annotations
- For each citation link, follows the destination to the references section
- Extracts the full reference text at that location using the same logic as `lib/extractCitationReference.js`
- Returns an array of extracted citations with:
  - `id`: Citation identifier (e.g., "cite.Smith2020")
  - `text`: Full extracted reference text from references section
  - `confidence`: Extraction confidence score (0-1)
  - `method`: Extraction method ("numbered", "authorYear", "proximity")
  - `spansPages`: Whether the reference spans multiple pages
  - `destPage`: Page number where the citation appears

**Endpoint:** `POST /api/citations/extract`

### 2. Citation Extraction Hook (`hooks/useExtractCitations.ts`)
Created a custom React hook that:
- Manages the extraction process for uploaded PDFs
- Provides a `extractCitations(file)` function to extract citations from a PDF
- Implements client-side caching to avoid re-extracting the same file
- Provides helper functions:
  - `getCitationById()` - Get extracted citation by ID
  - `getCitationsForFile()` - Get all citations for a specific file
  - `clearCache()` - Clear the extraction cache
- Tracks loading state and progress

### 3. PDFReader Integration (`components/pdf-reader.tsx`)
Modified the PDFReader component to:
- Import and use the `useExtractCitations` hook
- Automatically extract citations when a PDF is uploaded
- Store extracted citations in the PDFTab state
- When a citation is clicked:
  - Look up the extracted reference text by citation ID
  - Merge it with the inline citation data
  - Pass it to the CitationPopup component

### 4. Citation Popup Enhancement (`components/citation-popup.tsx`)
Updated the CitationPopup to:
- Accept `extractedText`, `extractionConfidence`, and `extractionMethod` in the Citation interface
- Display the extracted reference text prominently with a green background
- Show extraction confidence as a badge
- Use the extracted text (if available) for fetching metadata from Semantic Scholar
- Distinguish between:
  - **Inline Citation**: The citation as it appears in the text (e.g., "[12]")
  - **Extracted Reference**: The full reference from the references section

## How It Works

```
User uploads PDF
    ↓
PDFReader.handleFileSelect()
    ↓
extractCitations(file) [background]
    ↓
POST /api/citations/extract
    ↓
Server processes PDF with PDF.js
  - Finds citation link annotations
  - Follows each link to references section
  - Extracts full reference text
    ↓
Returns array of extracted citations
    ↓
PDFReader stores citations in tab state
    ↓
User clicks citation [12]
    ↓
PDFReader.handleCitationClick()
  - Looks up extracted reference for [12]
  - Merges: { text: "[12]", extractedText: "Smith, J. et al. (2020). Paper Title..." }
    ↓
CitationPopup displays:
  1. Extracted Reference (full text from PDF)
  2. Inline Citation ([12])
  3. Metadata from Semantic Scholar
  4. Abstract snippet
```

## UI Display

The citation popup now shows multiple levels of information:

1. **Extracted Reference** (if available)
   - Full reference text from the PDF's references section
   - Green background to indicate it's from extraction
   - Confidence badge showing extraction quality

2. **Inline Citation**
   - The citation as it appears in the text
   - Monospace font in muted background

3. **Enriched Metadata** (from Semantic Scholar)
   - Title
   - Authors (first 3 + "et al.")
   - Venue/journal
   - Year
   - Abstract snippet (300 chars)

4. **Actions**
   - Copy citation text
   - Open DOI link
   - Open external URL
   - View full reference

## Key Features

✅ **Automatic extraction** - Citations are extracted in the background when PDF is uploaded
✅ **Client-side caching** - Extracted citations are cached to avoid redundant API calls
✅ **High accuracy** - Uses PDF.js annotation links for precise reference extraction
✅ **Multi-method extraction** - Supports numbered citations, author-year, and proximity-based extraction
✅ **Confidence scores** - Each extraction includes a confidence metric
✅ **Seamless integration** - Works with existing citation detection and metadata fetching

## Files Modified/Created

**Created:**
- `app/api/citations/extract/route.ts` - API endpoint for citation extraction
- `hooks/useExtractCitations.ts` - React hook for managing extraction
- `CITATION_EXTRACTION_INTEGRATION.md` - This documentation

**Modified:**
- `components/pdf-reader.tsx` - Added extraction on file upload
- `components/citation-popup.tsx` - Display extracted reference text
- `hooks/useCitationMetadata.ts` - Already created for metadata fetching

## Testing

To test the citation extraction:

1. Upload a PDF with citations (papers from arXiv work well)
2. Click on any inline citation (e.g., [1], [12])
3. The popup should show:
   - "Extracted Reference" section with full reference text
   - Confidence score badge
   - Enriched metadata from Semantic Scholar

## Technical Notes

- The extraction uses the same logic as `lib/extractCitationReference.js` but adapted for Next.js API routes
- PDF.js is configured to work in Node.js environment (workers disabled)
- Temporary files are created and cleaned up automatically
- The extraction runs asynchronously to avoid blocking the UI
- Extracted citations are stored per-tab to support multiple open PDFs

## Extraction Methods

The system supports three extraction methods:

1. **Numbered** - Detects references starting with [1], [2], etc.
2. **AuthorYear** - Detects references starting with "Author et al. (2020)"
3. **Proximity** - Falls back to extracting text near the destination coordinates

Each method has an associated confidence score.

## Future Enhancements

Potential improvements:
- Add extraction progress indicator in UI
- Support for more citation formats
- Batch extraction for better performance
- Export extracted citations to BibTeX
- Semantic matching between inline citations and extracted references
