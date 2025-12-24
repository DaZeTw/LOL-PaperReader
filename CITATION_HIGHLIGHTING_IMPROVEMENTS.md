# Citation Highlighting Improvements

## Overview
Enhanced the QA citation highlighting system to provide more accurate text matching and better visual feedback for text-based PDFs.

## What Was Improved

### 1. Pipeline Integration (`backend/src/paperreader/services/qa/pipeline.py`)

**Before:**
- Used only 500 characters for matching
- Fixed threshold of 0.75
- Minimal logging

**After:**
- ✅ Increased to 1000 characters for better accuracy
- ✅ Two-stage threshold: 0.65 for search, 0.75 for confidence filtering
- ✅ Better logging with quality indicators (✅/⚠️/❌)
- ✅ Shows match scores and excerpt length
- ✅ Only shows highlights when confidence is high (score ≥ 0.75)

**Key Changes:**
```python
# Use more text for matching (1000 chars vs 500)
excerpt_for_matching = excerpt[:1000] if len(excerpt) > 1000 else excerpt

# Lower threshold for search, higher minimum for display
bbox_result = find_text_bboxes(..., threshold=0.65)
if bbox_score >= 0.75:  # Only show high-confidence matches
    bboxes = bbox_result.get("bboxes", [])
```

### 2. Text Normalization (`backend/src/paperreader/services/pdf/bbox_finder.py`)

**Improvements:**
- ✅ Handle PDF ligatures (ﬁ, ﬂ, ﬃ, ﬄ)
- ✅ Normalize unicode quotes and dashes
- ✅ Remove soft hyphens and zero-width spaces
- ✅ Handle hyphenated words at line breaks ("exam-\nple" → "example")
- ✅ Better whitespace normalization

**Impact:** Significantly improves matching for PDFs with special typography.

### 3. Seed-Based Search (`bbox_finder.py`)

**Before:**
- Seeds: 10, 5, 2 words (concatenated without spaces)
- Threshold: 0.40
- Single-span matching

**After:**
- ✅ Longer seeds: 15, 10, 5 words (with spaces)
- ✅ Lower threshold: 0.35 (more inclusive during search)
- ✅ Multi-span window matching (checks 3 spans at once)

**Impact:** Finds more candidates, reduces false negatives.

### 4. Span Expansion (`bbox_finder.py`)

**Before:**
- Window size: 100 spans
- No space between spans
- No early exit

**After:**
- ✅ Larger window: 200 spans (handles longer excerpts)
- ✅ Add spaces between spans for natural word boundaries
- ✅ Early exit on perfect match (score ≥ 99%)

**Impact:** Better handling of long excerpts, faster for exact matches.

### 5. Demo Script (`backend/scripts/highlight_qa_sentence.py`)

**Improvements:**
- ✅ Better progress messages
- ✅ Confidence level indicators (EXCELLENT/GOOD/ACCEPTABLE/LOW)
- ✅ Detailed output summary
- ✅ Updated default threshold to 0.65

## Testing

### Test Script
```bash
# Run comprehensive tests
python backend/scripts/test_highlight_improvements.py lib/your-pdf.pdf

# Test specific text
python backend/scripts/highlight_qa_sentence.py \
    --pdf lib/2408.09869v5.pdf \
    --page 1 \
    --text "Your text here" \
    --out test_output.pdf
```

### Quality Levels
- **Score ≥ 0.90:** EXCELLENT ✅ - Perfect or near-perfect match
- **Score ≥ 0.75:** GOOD ✅ - High confidence, highlights will show
- **Score ≥ 0.65:** ACCEPTABLE ⚠️ - Moderate confidence, highlights may be filtered
- **Score < 0.65:** LOW ❌ - Poor match, highlights will not show

## Expected Results

### For Text-Based PDFs:
- ✅ More accurate text matching (fewer false positives)
- ✅ Better handling of special characters and ligatures
- ✅ Support for longer excerpts (up to 1000 chars)
- ✅ Clearer feedback about match quality

### For OCR'd/Scanned PDFs:
- ⚠️ May still struggle with poor OCR quality
- ⚠️ Consider lowering threshold to 0.60 if needed
- ⚠️ Check logs for match scores

## Monitoring

During QA, watch for these log messages:

```
[BBOX] ✅ Found 3 bboxes for citation 1 (score: 0.87, length: 543 chars)
```
- ✅ Good: Score ≥ 0.75, highlights will show

```
[BBOX] ⚠️ Match score too low for citation 2 (score: 0.68 < 0.75), skipping highlight
```
- ⚠️ Found match but confidence too low, highlights filtered out

```
[BBOX] ❌ No match found for citation 3 (score: 0.32, excerpt: 'The results show...')
```
- ❌ No match found, check if text exists on that page

## Configuration

If you need to adjust thresholds for your specific PDFs:

### In `pipeline.py` (line ~830):
```python
threshold=0.65  # Lower for OCR'd PDFs (0.55-0.60)
```

### In `pipeline.py` (line ~838):
```python
if bbox_score >= 0.75:  # Lower for less strict filtering (0.65-0.70)
```

### In demo script:
```bash
--threshold 0.60  # Lower threshold for testing
```

## Rollback

If issues occur, revert these files:
1. `backend/src/paperreader/services/qa/pipeline.py`
2. `backend/src/paperreader/services/pdf/bbox_finder.py`
3. `backend/scripts/highlight_qa_sentence.py`

## Next Steps

1. Test with your actual PDFs
2. Monitor match scores in logs
3. Adjust thresholds if needed
4. Report any issues with scores and PDF characteristics
