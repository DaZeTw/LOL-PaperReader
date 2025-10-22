# Reference Parser - Usage Guide

## What Changed

✅ **Replaced mock data with real PDF parsing!**

### Files Modified

1. **`lib/pdf-reference-parser.ts`** (NEW)
   - Extracts real references from PDF's bibliography section
   - Parses reference metadata (authors, title, year, DOI, arXiv, URLs)
   - Extracts section headings from PDF

2. **`app/api/pdf/upload/route.ts`** (UPDATED)
   - Now calls `extractReferencesFromPDF()` instead of returning mock data
   - Extracts actual references from uploaded PDF
   - Returns real reference data to the frontend

## How It Works

### 1. Reference Extraction Process

```typescript
// When PDF is uploaded:
const arrayBuffer = await file.arrayBuffer();

// Extract references from last 30% of PDF pages
const references = await extractReferencesFromPDF(arrayBuffer);

// Returns array of Reference objects with real data:
[
  {
    id: "ref1",
    number: 1,
    text: "Smith, J., & Johnson, A. (2023). Machine Learning...",
    authors: "Smith, J., & Johnson, A.",
    title: "Machine Learning Approaches...",
    year: "2023",
    doi: "10.1234/jair.2023.12345",
    url: "https://doi.org/10.1234/jair.2023.12345",
    pageNum: 8,
    yPosition: 650.5
  },
  // ... more references
]
```

### 2. Reference Pattern Detection

The parser recognizes multiple citation formats:

```
[1] Author. Title. Journal (2023).
1. Author. Title. Journal (2023).
1 Author. Title. Journal (2023).
```

### 3. Metadata Extraction

Automatically extracts from reference text:
- **Year**: `(2023)` or `, 2023`
- **DOI**: `DOI: 10.1234/...` or `doi: 10.1234/...`
- **arXiv**: `arXiv:2203.12345`
- **URL**: `https://...`
- **Authors**: Text before first period
- **Title**: Quoted text or text between periods
- **Journal**: Text after title and before year

## Testing Your Implementation

### Step 1: Start Development Server

```bash
npm run dev
```

### Step 2: Upload a Real PDF

1. Open http://localhost:3000
2. Click "Upload PDF"
3. Select a research paper (preferably with a References section)
4. Wait for parsing to complete

### Step 3: Check Console Logs

You should see:
```
[PDF Upload] Processing file: paper.pdf Size: 1234567
[Reference Parser] PDF loaded, pages: 12
[Reference Parser] Found references section on page 11
[Reference Parser] Extracted 25 references
[PDF Upload] Successfully parsed: { sections: 5, references: 25 }
```

### Step 4: Test Citation Click

1. Hover over a citation number in the PDF (like `[1]`)
2. **Popup should show REAL reference text** (not mock data!)
3. Click the citation
4. Should jump to references section (if references are on separate page)

## What If No References Are Found?

If the parser returns 0 references, it means:

### Common Issues:

1. **PDF has no "References" heading**
   - Parser looks for: "References", "Bibliography", "Works Cited"
   - Try manually checking last few pages of PDF

2. **References use non-standard format**
   - Parser expects numbered references: `[1]`, `1.`, etc.
   - Some papers use author-year format (not supported yet)

3. **References are images/scanned**
   - Parser only works with text-based PDFs
   - OCR support not implemented

### Debugging Steps:

1. **Check console logs** for parser output
2. **Manually inspect PDF** - open in browser, check last pages
3. **Check reference format** - does it start with `[1]` or `1.`?

## Example Output

### Before (Mock Data):
```json
{
  "references": [
    {
      "number": 1,
      "text": "Smith, J., & Johnson, A. (2023). Machine Learning...",
      "title": "Machine Learning Approaches to Natural Language Processing",
      // ❌ This was hardcoded mock data
    }
  ]
}
```

### After (Real Data):
```json
{
  "references": [
    {
      "number": 1,
      "text": "Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A.N., Kaiser, Ł. and Polosukhin, I., 2017. Attention is all you need. In Advances in neural information processing systems (pp. 5998-6008).",
      "authors": "Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A.N., Kaiser, Ł. and Polosukhin, I.",
      "title": "Attention is all you need",
      "year": "2017",
      "journal": "Advances in neural information processing systems",
      "pageNum": 8,
      "yPosition": 652.3
      // ✅ Extracted from actual PDF!
    }
  ]
}
```

## Troubleshooting

### Issue: "Cannot find module 'pdfjs-dist'"

**Solution**: pdfjs-dist is already in package.json, just restart dev server:
```bash
npm run dev
```

### Issue: Parser returns empty array

**Solution**: Check these in order:
1. Is PDF text-based? (Try selecting text in PDF - if you can't, it's scanned)
2. Does PDF have "References" section? (Check last few pages)
3. Are references numbered? (Look for `[1]`, `1.`, etc.)

### Issue: Metadata (title, authors) not extracted

**Solution**: This is normal for complex reference formats. The parser does its best, but some references are hard to parse. At minimum, you'll get the full reference text.

### Issue: API route takes too long

**Solution**:
- Reference parsing can take 5-10 seconds for large PDFs
- Only parses last 30% of pages (where references usually are)
- Consider adding loading indicator in UI

## Advanced: Improving Parser Accuracy

If you want to improve parsing accuracy, edit `lib/pdf-reference-parser.ts`:

### 1. Adjust Reference Search Range

```typescript
// Current: searches last 30% of pages
const startPage = Math.max(1, Math.floor(pdf.numPages * 0.7));

// Change to: search last 5 pages only (faster)
const startPage = Math.max(1, pdf.numPages - 5);
```

### 2. Add More Reference Patterns

```typescript
const patterns = [
  /^\[(\d+)\]\s+(.+)/,           // [1] ...
  /^(\d+)\.\s+(.+)/,              // 1. ...
  /^(\d+)\s+([A-Z].+)/,           // 1 Author...

  // Add custom pattern:
  /^\((\d+)\)\s+(.+)/,            // (1) ...
];
```

### 3. Improve Title Extraction

Edit the `extractReferenceMetadata()` function to add custom logic for your paper format.

## Next Steps

Now that references are real:

1. ✅ Citations show actual reference text
2. ✅ DOI/arXiv links work automatically
3. ✅ Can jump to exact reference location (pageNum + yPosition)

### TODO (Optional Enhancements):

- [ ] Add progress indicator during parsing
- [ ] Cache parsed references (avoid re-parsing)
- [ ] Support author-year citation format
- [ ] Add OCR support for scanned PDFs
- [ ] Improve title/author extraction with ML models

## Summary

**Before**: All citation data was hardcoded mock data in API route

**After**: Real references extracted from PDF's bibliography section

**Test it**: Upload a PDF and hover over citation numbers - you should see REAL reference text!
