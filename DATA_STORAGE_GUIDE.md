# Citation Data Storage Guide

## Overview

Extracted citation data is automatically saved to the `data/citations/` directory for debugging purposes. Every time a PDF is uploaded and citations are extracted, a JSON file is created with detailed extraction results.

## Directory Structure

```
LOL-PaperReader/
├── data/
│   └── citations/
│       ├── README.md                          # Documentation
│       ├── example_extraction.json            # Example file showing format
│       ├── research_paper_pdf_2025-...json    # Actual extraction files
│       └── another_paper_pdf_2025-...json
```

## Automatic Data Saving

### When Citations are Saved

Citations are automatically saved to disk when:
1. A user uploads a PDF file
2. The extraction API (`/api/citations/extract`) processes the file
3. Citations are successfully extracted

### File Naming Convention

Format: `{sanitized_filename}_{timestamp}.json`

Example: `Attention_is_All_You_Need_pdf_2025-10-27T11-40-15-123Z.json`

- Special characters in filename are replaced with underscores
- Timestamp is in ISO format (UTC) with colons and periods replaced by dashes
- Each upload creates a new file (no overwriting)

## JSON File Structure

```json
{
  "fileName": "original_filename.pdf",
  "fileSize": 1234567,
  "extractedAt": "2025-10-27T11:40:00.000Z",
  "totalCitations": 45,
  "highConfidenceCount": 38,
  "lowConfidenceCount": 2,
  "byMethod": {
    "numbered": 40,
    "authorYear": 3,
    "proximity": 2
  },
  "citations": [
    {
      "id": "cite.Smith2020",
      "text": "Smith, J., et al. (2020). Paper Title. Journal, 12(3), 456-789.",
      "confidence": 0.9,
      "method": "numbered",
      "spansPages": false,
      "destPage": 12
    }
  ]
}
```

### Field Descriptions

#### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `fileName` | string | Original PDF filename |
| `fileSize` | number | File size in bytes |
| `extractedAt` | string | ISO timestamp when extraction occurred |
| `totalCitations` | number | Total number of citations extracted |
| `highConfidenceCount` | number | Citations with confidence > 0.7 |
| `lowConfidenceCount` | number | Citations with confidence < 0.5 |
| `byMethod` | object | Count of citations by extraction method |

#### Citation Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique citation identifier from PDF (e.g., "cite.Smith2020") |
| `text` | string | Full extracted reference text from references section |
| `confidence` | number | Extraction confidence score (0.0 to 1.0) |
| `method` | string | Extraction method: "numbered", "authorYear", or "proximity" |
| `spansPages` | boolean | Whether the reference spans multiple pages |
| `destPage` | number | Page number where the citation link appears |

## Extraction Methods

### 1. Numbered Citations (Confidence: ~0.9)
Pattern: `[1]`, `[2]`, `[3]`, etc.

Example:
```json
{
  "id": "cite.ref1",
  "text": "[1] Author, A. (2020). Paper Title...",
  "confidence": 0.9,
  "method": "numbered"
}
```

### 2. Author-Year Citations (Confidence: ~0.85)
Pattern: `Smith et al. (2020)`, `Jones (2019)`, etc.

Example:
```json
{
  "id": "cite.Smith2020",
  "text": "Smith, A., Jones, B. (2020). Paper Title...",
  "confidence": 0.85,
  "method": "authorYear"
}
```

### 3. Proximity-Based (Confidence: ~0.3)
Fallback method when patterns don't match. Extracts text near the destination coordinates.

Example:
```json
{
  "id": "cite.unknown",
  "text": "Extracted text near citation destination...",
  "confidence": 0.3,
  "method": "proximity"
}
```

## API Endpoints for Debugging

### 1. List All Extraction Files

**Endpoint:** `GET /api/citations/list`

Returns a list of all saved extraction files:

```json
{
  "files": [
    {
      "filename": "paper_2025-10-27T11-40-00.json",
      "path": "C:/path/to/data/citations/paper_2025-10-27T11-40-00.json",
      "size": 45678,
      "createdAt": "2025-10-27T11:40:00.000Z",
      "modifiedAt": "2025-10-27T11:40:00.000Z",
      "pdfFileName": "research_paper.pdf",
      "totalCitations": 45,
      "highConfidenceCount": 38,
      "extractedAt": "2025-10-27T11:40:00.000Z"
    }
  ],
  "total": 1
}
```

**Usage:**
```bash
curl http://localhost:3001/api/citations/list
```

### 2. Get Specific Extraction File

**Endpoint:** `POST /api/citations/list`

Request body:
```json
{
  "filename": "paper_2025-10-27T11-40-00.json"
}
```

Returns the full content of the extraction file.

**Usage:**
```bash
curl -X POST http://localhost:3001/api/citations/list \
  -H "Content-Type: application/json" \
  -d '{"filename": "paper_2025-10-27T11-40-00.json"}'
```

## Debugging Workflow

### Step 1: Upload a PDF
1. Open the app at http://localhost:3001
2. Upload a PDF with citations
3. Wait for extraction to complete

### Step 2: Check Extraction Results
```bash
# List all extraction files
curl http://localhost:3001/api/citations/list

# Or manually check the directory
ls data/citations/
```

### Step 3: Review Extraction Quality

Open the JSON file and check:

✅ **All citations found?**
```json
"totalCitations": 45  // Expected number
```

✅ **High confidence extractions?**
```json
"highConfidenceCount": 38,  // Should be high percentage
"lowConfidenceCount": 2     // Should be low
```

✅ **Correct extraction methods?**
```json
"byMethod": {
  "numbered": 40,    // Most common for academic papers
  "authorYear": 3,
  "proximity": 2     // Fallback, ideally low
}
```

✅ **Reference text complete?**
```json
{
  "text": "Smith, J., Jones, A. (2020). Full Paper Title. Journal Name, 12(3), 456-789.",
  "confidence": 0.9
}
```

### Step 4: Debug Issues

**Low confidence citations:**
- Check if reference formatting is unusual
- Verify destination coordinates are correct
- Consider adjusting extraction thresholds

**Missing citations:**
- Check if PDF has internal link annotations
- Verify citation links point to references section
- Check console logs for parsing errors

**Incomplete reference text:**
- Check if references span multiple pages
- Verify column detection is working
- Adjust x-gap or y-window thresholds

## Example Files

### Example 1: Well-Formatted Paper
`example_extraction.json` (included in repo)
- 5 citations extracted
- 80% high confidence
- Clear numbered format

### Example 2: Complex Paper
When you upload a paper with 100+ citations:
```json
{
  "totalCitations": 123,
  "highConfidenceCount": 110,
  "lowConfidenceCount": 3,
  "byMethod": {
    "numbered": 120,
    "proximity": 3
  }
}
```

## File Management

### Storage Location
```
data/citations/
```

### Automatic Cleanup
Files are **not** automatically deleted. You should manually clean up old files periodically.

### Manual Cleanup Commands

**Delete all files:**
```powershell
Remove-Item "data/citations/*.json" -Exclude "example_extraction.json"
```

**Delete files older than 7 days:**
```powershell
Get-ChildItem -Path "data/citations" -Filter "*.json" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
  Remove-Item
```

**Keep only last 10 files:**
```powershell
Get-ChildItem -Path "data/citations" -Filter "*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 10 |
  Remove-Item
```

## Git Integration

The `data/citations/*.json` files are excluded from git via `.gitignore`:

```gitignore
# extracted citation data for debugging
/data/citations/*.json
```

The `README.md` and `example_extraction.json` **are** committed to help other developers understand the format.

## Troubleshooting

### Files Not Being Created

**Check 1: Directory exists**
```bash
ls data/citations/
```

**Check 2: Server logs**
```bash
# Look for this log message:
[extractCitations] Saved extraction data to: data/citations/...
```

**Check 3: Permissions**
Ensure the app has write permissions to the `data/` directory.

### Large File Sizes

Extraction files are typically:
- Small papers (10-20 citations): ~10 KB
- Medium papers (50 citations): ~50 KB
- Large papers (200+ citations): ~200 KB

If files are much larger, check if reference text extraction is including too much content.

## Production Considerations

### Disable in Production

If you don't want to save extraction data in production:

```typescript
// In app/api/citations/extract/route.ts
if (process.env.NODE_ENV !== 'production') {
  // Only save in development
  fs.writeFileSync(outputPath, JSON.stringify(extractionData, null, 2));
}
```

### Alternative Storage

For production, consider:
- Store in database instead of files
- Use cloud storage (S3, Azure Blob)
- Implement retention policies
- Add data encryption

## Summary

✅ **Automatic saving** - Every PDF extraction is saved
✅ **Detailed metadata** - Full statistics and extraction info
✅ **Debug-friendly** - Easy to review and analyze
✅ **API access** - List and retrieve extraction files
✅ **Git-ignored** - Won't clutter your repository

The data storage system makes it easy to debug citation extraction, verify accuracy, and improve the system over time! 🎯
