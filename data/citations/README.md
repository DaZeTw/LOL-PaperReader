# Extracted Citations Data

This directory stores extracted citation data from uploaded PDFs for debugging purposes.

## File Format

Each time a PDF is parsed, a JSON file is created with the following format:

```
{filename}_{timestamp}.json
```

Example: `research_paper_pdf_2025-10-27T11-38-00-123Z.json`

## JSON Structure

```json
{
  "fileName": "research_paper.pdf",
  "fileSize": 1234567,
  "extractedAt": "2025-10-27T11:38:00.123Z",
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
      "text": "Smith, J., Jones, A., & Brown, K. (2020). Deep Learning Methods...",
      "confidence": 0.9,
      "method": "numbered",
      "spansPages": false,
      "destPage": 12
    }
  ]
}
```

## Fields Explanation

- **fileName**: Original PDF filename
- **fileSize**: File size in bytes
- **extractedAt**: ISO timestamp when extraction occurred
- **totalCitations**: Total number of citations extracted
- **highConfidenceCount**: Citations with confidence > 0.7
- **lowConfidenceCount**: Citations with confidence < 0.5
- **byMethod**: Count of citations by extraction method:
  - `numbered`: Citations like [1], [2], etc.
  - `authorYear`: Citations like "Smith et al. (2020)"
  - `proximity`: Fallback extraction based on position
- **citations**: Array of extracted citation objects

## Citation Object Fields

- **id**: Unique identifier from PDF (e.g., "cite.Smith2020")
- **text**: Full extracted reference text from references section
- **confidence**: Extraction confidence score (0.0 to 1.0)
- **method**: Extraction method used
- **spansPages**: Whether reference spans multiple pages
- **destPage**: Page number where the citation link appears

## Usage for Debugging

1. Upload a PDF through the application
2. Check this directory for the generated JSON file
3. Review extracted citations to verify:
   - All citations were found
   - Reference text is complete and accurate
   - Confidence scores are appropriate
   - Extraction methods are correct

## Cleaning Up

These files are automatically generated and can be safely deleted. They are excluded from git via `.gitignore`.

To clean up old files:
```bash
# Delete files older than 7 days (Windows PowerShell)
Get-ChildItem -Path "data/citations" -Filter "*.json" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | Remove-Item

# Or manually delete files you no longer need
```

## Notes

- Files are timestamped in ISO format (UTC)
- Special characters in filenames are replaced with underscores
- Each extraction creates a new file (no overwriting)
- This is for development/debugging only - not used in production
