# Reference Linking Feature - Implementation Plan

## Overview
Implement automatic reference extraction from PDFs with intelligent link generation, allowing users to open each reference in a new tab via DOI, arXiv ID, URL, or Google Scholar search.

---

## Architecture Summary

### Backend (Python/FastAPI)
- **Reference Extraction Pipeline**: Detect and parse references section from PDF markdown
- **Metadata Parser**: Extract DOIs, URLs, arXiv IDs, titles, authors from individual references
- **Link Generator**: Generate clickable URLs for each reference type
- **API Endpoint**: `/api/pdf/{session_id}/references` - Returns structured reference list

### Frontend (Next.js/React)
- **References Panel**: New UI component in PDF sidebar
- **Link Handler**: Click → Open in new tab with appropriate URL
- **Fallback Logic**: Auto-search Google Scholar if no direct link available

---

## Phase 1: Backend - Reference Detection & Parsing

### 1.1 Detect References Section
**File**: `backend/src/paperreader/services/parser/pdf_parser_pymupdf.py`

**Changes**:
- In `parse_pdf_with_pymupdf()`, track when entering "References" or "Bibliography" section
- Store line numbers/content between references heading and next major heading (or EOF)
- Return references block in output dict: `outputs["references_raw"]`

**Heuristics**:
- Match headings: "References", "Bibliography", "Works Cited" (case-insensitive)
- Typically appears near end of document (last 20% of pages)
- Stop when encountering "Appendix", "Acknowledgments", or document end

**Code Location**: Around lines 369-404 (page processing loop)

---

### 1.2 Parse Individual References
**New File**: `backend/src/paperreader/services/references/reference_parser.py`

**Core Function**: `parse_references(raw_text: str) -> List[Reference]`

**Reference Object**:
```python
@dataclass
class Reference:
    id: int
    raw_text: str
    title: Optional[str] = None
    authors: Optional[List[str]] = None
    year: Optional[int] = None
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    url: Optional[str] = None
    venue: Optional[str] = None  # Journal/conference name
```

**Parsing Strategy**:
1. **Split references**: Use numbered patterns `[1]`, `(1)`, `1.` or newline-based heuristics
2. **Extract DOI**: Regex `10.\d{4,}/[\S]+` or `doi.org/...`
3. **Extract arXiv ID**: Regex `arXiv:\d{4}\.\d{4,5}` or `arxiv.org/abs/...`
4. **Extract URL**: Find `http(s)://...` links
5. **Extract title**: Heuristic - text between quotes or first capitalized sentence
6. **Extract year**: Find 4-digit number `(19|20)\d{2}` in parentheses

**Libraries**:
- Consider using `re` (standard library) for initial implementation
- Optional: `scholarly`, `crossref` for enhanced metadata lookup (future enhancement)

---

### 1.3 Link Generation
**File**: `backend/src/paperreader/services/references/link_generator.py`

**Function**: `generate_link(reference: Reference) -> str`

**Priority Order**:
1. **DOI** → `https://doi.org/{doi}`
2. **arXiv ID** → `https://arxiv.org/abs/{arxiv_id}`
3. **URL** → Use extracted URL directly
4. **Title** → `https://scholar.google.com/scholar?q={encoded_title}`

**Fallback**: Always generate Google Scholar link using title + year if available

---

### 1.4 API Endpoint
**File**: `backend/src/paperreader/api/pdf_routes.py`

**New Endpoint**:
```python
@router.get("/api/pdf/{session_id}/references")
async def get_references(session_id: str):
    """
    Returns extracted references for a PDF session.

    Response:
    {
        "session_id": "...",
        "references": [
            {
                "id": 1,
                "raw_text": "[1] Smith et al. Deep Learning. 2020.",
                "title": "Deep Learning",
                "authors": ["Smith"],
                "year": 2020,
                "link": "https://scholar.google.com/...",
                "link_type": "scholar"  // doi | arxiv | url | scholar
            }
        ]
    }
    """
```

**Storage Strategy**:
- Cache parsed references in same directory as parsed markdown: `.parsed_data/{session_id}/references.json`
- Parse on-demand if not cached, then save for future requests

---

## Phase 2: Frontend - References UI

### 2.1 References Panel Component
**New File**: `components/references-sidebar.tsx`

**Features**:
- List all references with numbering
- Show truncated title/author if available, otherwise raw text (first 100 chars)
- Click handler to open link in new tab
- Badge showing link type (DOI, arXiv, URL, Scholar)
- Search/filter functionality (optional - Phase 3)

**Layout**:
```tsx
<div className="references-sidebar">
  <h3>References ({count})</h3>
  <div className="reference-list">
    {references.map(ref => (
      <div key={ref.id} className="reference-item">
        <span className="ref-number">[{ref.id}]</span>
        <div className="ref-content">
          <p className="ref-text">{ref.title || ref.raw_text}</p>
          <div className="ref-meta">
            {ref.authors && <span>{ref.authors.join(', ')}</span>}
            {ref.year && <span>({ref.year})</span>}
          </div>
        </div>
        <Button onClick={() => handleOpenReference(ref.link)}>
          <ExternalLink /> {ref.link_type}
        </Button>
      </div>
    ))}
  </div>
</div>
```

---

### 2.2 Integrate with PDF Reader
**File**: `components/pdf-reader.tsx`

**Changes**:
- Add new sidebar mode: `"references"` alongside `"qa"` and `"highlights"`
- Add toggle button in annotation toolbar or top bar
- Fetch references when PDF loads: `useEffect(() => fetchReferences(sessionId), [sessionId])`

**Hook**: `hooks/useReferences.tsx`
```tsx
export function useReferences(sessionId: string) {
  const [references, setReferences] = useState<Reference[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchReferences()
  }, [sessionId])

  const fetchReferences = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pdf/${sessionId}/references`)
      const data = await res.json()
      setReferences(data.references)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return { references, loading, error, refetch: fetchReferences }
}
```

---

### 2.3 API Proxy Route
**New File**: `app/api/pdf/[sessionId]/references/route.ts`

**Purpose**: Proxy frontend requests to backend

```typescript
export async function GET(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
  const response = await fetch(`${backendUrl}/api/pdf/${params.sessionId}/references`)
  const data = await response.json()
  return Response.json(data)
}
```

---

## Phase 3: Enhanced Features (Optional)

### 3.1 Reference Cross-Linking
- Detect in-text citations `[1]`, `(Smith et al., 2020)`
- Make them clickable → scroll to reference in sidebar
- Highlight reference in sidebar when clicked

### 3.2 Semantic Scholar Integration
- Use Semantic Scholar API for richer metadata
- Show paper abstract on hover
- Display citation count, venue, PDF availability
- API: `https://api.semanticscholar.org/v1/paper/{doi}`

### 3.3 Batch Export
- Export all references as BibTeX
- Export as plain text list
- Copy all DOIs/URLs to clipboard

### 3.4 Smart Search
- Full-text search within references
- Filter by year range, author, venue

---

## Testing Strategy

### Unit Tests

**Backend**:
- `test_reference_parser.py`:
  - Test reference splitting (various formats: numbered, newline-based)
  - Test DOI extraction (valid/invalid patterns)
  - Test arXiv ID extraction
  - Test URL extraction
  - Test title/author parsing accuracy

- `test_link_generator.py`:
  - Test priority order (DOI > arXiv > URL > Scholar)
  - Test Google Scholar query encoding
  - Test malformed input handling

**Frontend**:
- `references-sidebar.test.tsx`:
  - Test rendering with mock data
  - Test click handlers
  - Test empty state
  - Test loading/error states

---

### Integration Tests

**Test Papers** (≥5 different reference formats):
1. **Computer Science (ACM/IEEE)**: Numbered references `[1]`, DOIs common
2. **Physics (arXiv)**: arXiv IDs prevalent, numbered style
3. **Biology/Medicine (APA)**: Author-year citations, full names
4. **Math**: Minimal metadata, often no DOIs
5. **Old Paper (pre-2000)**: No DOIs/URLs, title-based search only

**Test Cases**:
- ✅ References section correctly detected
- ✅ Individual references correctly split
- ✅ DOIs extracted with ≥90% accuracy
- ✅ arXiv IDs extracted with ≥95% accuracy
- ✅ Clickable links work (open in new tab)
- ✅ Scholar fallback works for references without DOI/arXiv
- ✅ UI responsive, no layout breaks
- ✅ Performance: <2s to parse 50 references

---

### Manual QA Checklist

- [ ] Upload PDF with references → References sidebar appears
- [ ] Click DOI link → Opens correct paper on doi.org
- [ ] Click arXiv link → Opens correct paper on arxiv.org
- [ ] Click Scholar link → Opens relevant search results
- [ ] References with no metadata → Scholar search works
- [ ] Empty references section → Shows "No references found" message
- [ ] Large reference list (100+) → Scrollable, no lag
- [ ] Switch between QA/Highlights/References sidebars → No state loss

---

## File Structure

```
backend/
  src/paperreader/
    services/
      parser/
        pdf_parser_pymupdf.py          # [MODIFY] Add references detection
      references/                       # [NEW FOLDER]
        __init__.py
        reference_parser.py             # Core parsing logic
        link_generator.py               # Link generation
        models.py                       # Reference dataclass
    api/
      pdf_routes.py                     # [MODIFY] Add /references endpoint

frontend/
  components/
    references-sidebar.tsx              # [NEW] Main references UI
    pdf-reader.tsx                      # [MODIFY] Add references mode
  hooks/
    useReferences.tsx                   # [NEW] Data fetching hook
  app/api/pdf/[sessionId]/references/
    route.ts                            # [NEW] Proxy endpoint
```

---

## Implementation Order

### Sprint 1: Backend Foundation (3-5 days)
1. ✅ Modify `pdf_parser_pymupdf.py` to detect references section
2. ✅ Implement `reference_parser.py` with basic splitting + regex extraction
3. ✅ Implement `link_generator.py` with priority logic
4. ✅ Add `/api/pdf/{session_id}/references` endpoint
5. ✅ Test with 3 sample papers

### Sprint 2: Frontend UI (2-3 days)
6. ✅ Create `references-sidebar.tsx` with basic list view
7. ✅ Create `useReferences.tsx` hook
8. ✅ Add proxy API route
9. ✅ Integrate into `pdf-reader.tsx` as new sidebar mode
10. ✅ Style with Tailwind + match existing design system

### Sprint 3: Testing & Refinement (2-3 days)
11. ✅ Test with 5+ diverse papers
12. ✅ Fix parsing edge cases (line breaks, special chars)
13. ✅ Add error handling (no references found, parse failures)
14. ✅ Performance optimization (caching, lazy loading)
15. ✅ Write unit tests for critical functions

### Sprint 4: Polish & Deploy (1-2 days)
16. ✅ Add loading states, empty states, error messages
17. ✅ Accessibility: keyboard navigation, ARIA labels
18. ✅ Documentation: Update CLAUDE.md with references feature
19. ✅ PR review + merge to main
20. ✅ Deploy to production

**Total Estimate**: 8-13 days (depends on parsing accuracy iteration)

---

## Risk Mitigation

### Risk 1: Low Parsing Accuracy
**Impact**: References incorrectly split or metadata missing

**Mitigation**:
- Start with numbered references (easiest pattern)
- Use multiple regex patterns with fallbacks
- Allow manual correction in future iteration
- Show raw text as fallback if parsing fails

### Risk 2: Google Scholar Rate Limiting
**Impact**: Scholar links may break if heavily used

**Mitigation**:
- Generate links client-side (no server requests)
- Use Scholar search URL (not API)
- Future: Integrate Semantic Scholar API (no rate limits with API key)

### Risk 3: Edge Cases in Reference Formats
**Impact**: Some papers have non-standard reference styles

**Mitigation**:
- Test with diverse paper corpus
- Add configuration for custom regex patterns
- Graceful degradation: show raw text if parsing fails

---

## Success Metrics

- **Accuracy**: ≥90% of references correctly parsed with valid links
- **Coverage**: Works on ≥80% of academic papers (CS, Physics, Bio)
- **Performance**: <2s to parse and display references
- **Usability**: Users can open references in new tab with ≤2 clicks
- **Reliability**: No crashes/errors on malformed inputs

---

## Future Enhancements (Post-MVP)

1. **PDF Availability Detection**: Check if referenced paper has free PDF
2. **Citation Graph**: Visualize connections between references
3. **Reference Manager Integration**: Export to Zotero, Mendeley, EndNote
4. **AI-Powered Summarization**: Show 1-sentence summary of each reference
5. **In-Document Highlighting**: Highlight citations in main text that link to references
6. **Reference Recommendations**: "You might also like these papers..."

---

## Definition of Done

This feature is **complete** when:

- ✅ References are reliably scraped with ≥90% accuracy on test corpus
- ✅ Each reference can be opened in a new tab (DOI / arXiv / URL / Scholar)
- ✅ UI interaction works without errors or layout breaks
- ✅ Fallback to Google Scholar works for references without direct links
- ✅ Code reviewed and merged into `main` branch
- ✅ Documentation updated (CLAUDE.md + inline comments)
- ✅ Unit tests pass with ≥80% coverage on critical functions
- ✅ Manual QA checklist completed
- ✅ No performance regression (embedding pipeline still <500s for 20pg PDF)

---

## Dependencies

### Python Packages (Backend)
```bash
# Already installed:
- pymupdf (fitz)
- fastapi
- pydantic

# May need to add:
- crossref-commons  # Optional: Enhanced DOI lookup
- scholarly         # Optional: Google Scholar API
```

### npm Packages (Frontend)
```bash
# Already installed:
- react, next
- lucide-react (for icons)
- tailwindcss

# No new dependencies needed
```

---

## Notes

- Leverage existing `common_sections` set in `pdf_parser_pymupdf.py:344` which already includes "references" and "bibliography"
- Reuse citation click handler pattern from `pdf-reader.tsx:97-115` for reference navigation
- Store parsed references in `.parsed_data/{session_id}/references.json` (same pattern as markdown caching)
- DOI resolver (`https://doi.org/`) is maintained by IDF and is stable/reliable
- Google Scholar search URLs are stable: `https://scholar.google.com/scholar?q={query}`
- arXiv URLs are stable: `https://arxiv.org/abs/{id}`

---

## Questions for Stakeholder

1. Should references panel be default visible or hidden by default?
2. Priority: Focus on accuracy (slower) or speed (lower accuracy)?
3. Should we support non-English papers (UTF-8 handling)?
4. Do we need BibTeX export in MVP or defer to Phase 3?
5. Should in-document citations be clickable (Phase 3 feature)?

