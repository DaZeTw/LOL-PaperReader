# Skimming Integration Guide - LOL-PaperReader

## 📋 Tổng Quan

Tài liệu này mô tả chi tiết quá trình tích hợp tính năng **Skimming/Highlighting** vào LOL-PaperReader, kết nối với external API của Semantic Scholar để highlight tự động các phần quan trọng trong paper.

**Session Date**: December 3, 2025
**API Provider**: Semantic Scholar (via ngrok)
**API Endpoint**: `https://lea-protrudent-azimuthally.ngrok-free.dev`

---

## 🎯 Mục Tiêu

Cho phép user **enable skimming mode** để tự động highlight các phần quan trọng trong PDF:
- **Objective** (🎯 Orange): Mục tiêu nghiên cứu
- **Method** (🔬 Blue): Phương pháp/cách tiếp cận
- **Result** (📊 Green): Kết quả/findings

**Lưu ý quan trọng**: API đã bỏ label "novelty", chỉ còn 3 labels như trên.

---

## 🏗️ Architecture Overview

### Luồng Dữ Liệu

```
User Upload PDF
    ↓
Click "Enable Skimming" + Chọn Preset (Light/Medium/Heavy)
    ↓
Frontend: POST /api/pdf/enable-skimming
    ↓
Backend: POST /api/skimming/process-and-highlight
    ↓
External API: POST /process_and_highlight
    ↓
Cache highlights (MD5-based)
    ↓
Return highlights với 3 labels
    ↓
Frontend: Auto-activate tất cả highlights
    ↓
Render overlay trên PDF + Show sidebar
```

### Caching Strategy

- **Cache Location**: `<data_dir>/.skimming_cache/`
- **Cache Key**: `MD5(file_name + mode + alpha + ratio)`
- **Benefits**:
  - Lần đầu: ~30-300s (tùy PDF size)
  - Lần sau với cùng preset: < 1s (đọc từ cache)

---

## 🔧 Backend Implementation

### 1. Skimming Service (`backend/src/paperreader/services/skimming/`)

#### File: `skimming_service.py`

**Key Components:**

**a) Presets Configuration**
```python
PRESETS = {
    "light": {"alpha": 0.3, "ratio": 0.3},    # 30% highlights
    "medium": {"alpha": 0.5, "ratio": 0.5},   # 50% highlights
    "heavy": {"alpha": 0.7, "ratio": 0.7},    # 70% highlights
}
```

**b) Caching Class**
```python
class SkimmingCache:
    def _get_cache_key(self, file_name: str, mode: str, alpha: float, ratio: float) -> str:
        key_str = f"{file_name}_{mode}_{alpha}_{ratio}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def get(self, file_name, mode, alpha, ratio) -> Optional[Dict]
    def set(self, file_name, data, mode, alpha, ratio)
```

**c) Main Function: `process_and_highlight()`**

**Critical Implementation Details:**

1. **Field Name**: API expects `"file"` (NOT `"pdf_file"`)
```python
files = {
    "file": (file_name + ".pdf", pdf_file, "application/pdf")
}
```

2. **File Name Format**: Stem only (no `.pdf` extension)
```python
# Input: "2303.14334v2.pdf"
file_stem = Path(file_name).stem  # "2303.14334v2"
```

3. **Headers for ngrok**:
```python
headers = {
    "ngrok-skip-browser-warning": "true",
    "User-Agent": "LOL-PaperReader/1.0"
}
```

4. **Response Parsing**: Extract from nested structure
```python
# API returns:
{
  "status": "success",
  "pipeline_result": {...},
  "highlight_result": {
    "highlights": [...]  # ← Extract từ đây
  }
}

# Code extracts:
highlights = result["highlight_result"]["highlights"]
return {"highlights": highlights, "status": "success"}
```

**Full Function Signature:**
```python
async def process_and_highlight(
    file_name: str,          # Stem only, e.g., "2303.14334v2"
    pdf_file: bytes,         # PDF binary data
    alpha: float = 0.5,      # Sparse filtering parameter
    ratio: float = 0.5,      # Highlight retention ratio
    cache_dir: Optional[Path] = None
) -> Dict:
```

### 2. API Routes (`backend/src/paperreader/api/skimming_routes.py`)

**Endpoints:**

#### POST `/api/skimming/process-and-highlight`
```python
@router.post("/process-and-highlight")
async def process_and_get_highlights(
    file: UploadFile = File(...),
    preset: PresetType = Form("medium"),
    alpha: Optional[float] = Form(None),
    ratio: Optional[float] = Form(None),
)
```

**Key Logic:**
```python
# Strip .pdf extension
file_stem = Path(file.filename).stem

# Get preset params
if alpha is None or ratio is None:
    preset_params = get_preset_params(preset)
    alpha = alpha or preset_params["alpha"]
    ratio = ratio or preset_params["ratio"]

# Call service
result = await process_and_highlight(
    file_name=file_stem,
    pdf_file=pdf_bytes,
    alpha=alpha,
    ratio=ratio,
    cache_dir=SKIMMING_CACHE_DIR
)
```

#### GET `/api/skimming/highlights`
- Lấy highlights đã cache cho một PDF
- Parameters: `file_name`, `preset`, `alpha`, `ratio`

#### GET `/api/skimming/cache-status`
- Check cache status cho tất cả presets của 1 file

### 3. Main App Registration (`backend/src/paperreader/main.py`)

```python
from paperreader.api.skimming_routes import router as skimming_router

app.include_router(skimming_router, prefix="/api/skimming", tags=["Skimming"])
```

---

## 💻 Frontend Implementation

### 1. Type Definitions Update

**Updated Interface** (`components/pdf-highlight-overlay.tsx`):
```typescript
export interface SkimmingHighlight {
  id: number
  text: string
  section: string
  label: "objective" | "method" | "result"  // ← Chỉ 3 labels
  score: number
  boxes: {
    left: number
    top: number
    width: number
    height: number
    page: number
  }[]
  block_id: string
}
```

**Color Mapping**:
```typescript
const CATEGORY_COLORS = {
  objective: "rgba(249, 115, 22, 0.85)",  // orange-600
  method: "rgba(37, 99, 235, 0.85)",      // blue-600
  result: "rgba(22, 163, 74, 0.85)",      // green-600
}

const CATEGORY_INFO = {
  objective: {
    color: "bg-orange-100 border-orange-300 text-orange-900",
    label: "Objective",
    icon: "🎯",
  },
  method: { ... },
  result: { ... },
}
```

### 2. Hook Update (`hooks/useSkimmingHighlights.ts`)

**Chuyển từ Auto-Fetch sang On-Demand:**

**Before:**
```typescript
// Auto-fetch on mount
useEffect(() => {
  fetchHighlights()
}, [])
```

**After:**
```typescript
export function useSkimmingHighlights() {
  const [processing, setProcessing] = useState(false)

  // Manual trigger functions
  const enableSkimming = useCallback(async (file: File, preset: PresetType) => {
    setProcessing(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("preset", preset)

    const response = await fetch("/api/pdf/enable-skimming", {
      method: "POST",
      body: formData,
    })
    // ...
  }, [])

  const fetchHighlights = useCallback(async (fileName: string, preset: PresetType) => {
    // Fetch for already processed file
  }, [])

  return {
    highlights,
    loading,
    processing,
    enableSkimming,     // NEW
    fetchHighlights,    // NEW
    clearHighlights,    // NEW
  }
}
```

### 3. Frontend API Routes

#### `app/api/pdf/enable-skimming/route.ts`
```typescript
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get("file") as File
  const preset = formData.get("preset") as string || "medium"

  // Forward to backend
  const backendFormData = new FormData()
  backendFormData.append("file", file)
  backendFormData.append("preset", preset)

  const response = await fetch(`${BACKEND_URL}/api/skimming/process-and-highlight`, {
    method: "POST",
    body: backendFormData,
  })

  return NextResponse.json(await response.json())
}
```

#### `app/api/pdf/skimming-data/route.ts`
```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const fileName = searchParams.get("file_name")
  const preset = searchParams.get("preset") || "medium"

  const response = await fetch(
    `${BACKEND_URL}/api/skimming/highlights?file_name=${fileName}&preset=${preset}`
  )

  return NextResponse.json(await response.json())
}
```

### 4. UI Components

#### `components/pdf-reader.tsx` - Main Integration

**State Management:**
```typescript
const {
  highlights,
  loading: highlightsLoading,
  processing: highlightsProcessing,
  enableSkimming,
  fetchHighlights,
} = useSkimmingHighlights()

const [skimmingEnabled, setSkimmingEnabled] = useState(false)
const [selectedPreset, setSelectedPreset] = useState<"light" | "medium" | "heavy">("medium")
const [activeHighlightIds, setActiveHighlightIds] = useState<Set<number>>(new Set())
```

**Enable Skimming Handler:**
```typescript
const handleEnableSkimming = async () => {
  try {
    await enableSkimming(file, selectedPreset)
    setSkimmingEnabled(true)
    setRightSidebarMode("highlights")
    setRightSidebarOpen(true)
  } catch (error) {
    console.error("Failed to enable skimming:", error)
  }
}
```

**Auto-Activate All Highlights:**
```typescript
useEffect(() => {
  if (highlights.length > 0 && skimmingEnabled) {
    const allHighlightIds = new Set(highlights.map((h) => h.id))
    setActiveHighlightIds(allHighlightIds)
    console.log(`Auto-activated ${highlights.length} highlights`)
  }
}, [highlights.length, skimmingEnabled, tabId])
```

**UI Controls:**
```tsx
{/* Before Skimming Enabled */}
{isActive && !skimmingEnabled && (
  <div className="absolute left-4 top-4 z-10 ...">
    <span>Enable Skimming:</span>
    <select
      value={selectedPreset}
      onChange={(e) => setSelectedPreset(e.target.value as "light" | "medium" | "heavy")}
    >
      <option value="light">Light (30%)</option>
      <option value="medium">Medium (50%)</option>
      <option value="heavy">Heavy (70%)</option>
    </select>
    <Button onClick={handleEnableSkimming} disabled={highlightsProcessing}>
      {highlightsProcessing ? "Processing..." : "Enable"}
    </Button>
  </div>
)}

{/* After Skimming Enabled */}
{isActive && skimmingEnabled && highlights.length > 0 && (
  <div className="absolute left-4 top-4 z-10 ...">
    <span>✨</span>
    <span>Skimming: {highlights.length} highlights ({selectedPreset})</span>
  </div>
)}
```

**Pass to PDFViewer:**
```tsx
<PDFViewer
  file={file}
  highlights={highlights}
  activeHighlightIds={activeHighlightIds}
  hiddenHighlightIds={hiddenHighlightIds}
  // ... other props
/>
```

#### `components/pdf-viewer.tsx` - Render Engine

**Receive Highlights from Parent:**
```typescript
export function PDFViewer({
  highlights = [],
  activeHighlightIds = new Set(),
  hiddenHighlightIds = new Set(),
  // ...
}: PDFViewerProps) {

  // Filter visible highlights
  const visibleHighlights = highlights.filter(
    h => activeHighlightIds.has(h.id) && !hiddenHighlightIds.has(h.id)
  )

  // Create highlight plugin
  const highlightPluginInstance = usePDFHighlightPlugin({
    highlights: visibleHighlights,
    visibleCategories,
    onHighlightClick: (h) => console.log("Clicked:", h.text),
  })

  // Add to plugins array
  const plugins = [
    pageNavigationPluginInstance,
    zoomPluginInstance,
    // ...
    highlightPluginInstance,  // ← Render highlights
  ]
}
```

#### `components/skimming-controls.tsx` - Category Toggles

**Updated Categories:**
```typescript
const CATEGORIES = [
  {
    id: "objective",
    label: "Objective",
    icon: Sparkles,
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    description: "Research objectives and goals",
  },
  { id: "method", ... },
  { id: "result", ... },
]

interface SkimmingControlsProps {
  highlightCounts: {
    objective: number
    method: number
    result: number
  }
  // ...
}
```

---

## 🐛 Issues Encountered & Solutions

### Issue 1: API Field Name Mismatch
**Problem**: Gửi `pdf_file` nhưng API expect `file`
```python
# ❌ Wrong
files = {"pdf_file": (file_name, pdf_file, "application/pdf")}

# ✅ Correct
files = {"file": (file_name, pdf_file, "application/pdf")}
```

### Issue 2: File Name Format
**Problem**: API tìm folder không có `.pdf` extension
```
Error: Folder not found: /temp_data/2303.14334v2.pdf
```

**Solution**: Strip extension
```python
file_stem = Path(file_name).stem  # "2303.14334v2.pdf" → "2303.14334v2"
```

### Issue 3: ngrok Browser Warning
**Problem**: ngrok trả về HTML warning page thay vì JSON

**Solution**: Thêm headers
```python
headers = {
    "ngrok-skip-browser-warning": "true",
    "User-Agent": "LOL-PaperReader/1.0"
}
```

### Issue 4: Nested Response Structure
**Problem**: Response không phải flat structure

**Solution**: Extract từ nested path
```python
if "highlight_result" in result and "highlights" in result["highlight_result"]:
    highlights = result["highlight_result"]["highlights"]
    return {"highlights": highlights, "status": "success"}
```

### Issue 5: Highlights Not Showing on PDF
**Problem**: Highlights fetch về nhưng không render

**Root Cause**:
1. `activeHighlightIds` rỗng → filter ra 0 highlights
2. Hook không auto-fetch nữa

**Solution**:
```typescript
// Auto-activate after loading
useEffect(() => {
  if (highlights.length > 0 && skimmingEnabled) {
    const allHighlightIds = new Set(highlights.map(h => h.id))
    setActiveHighlightIds(allHighlightIds)
  }
}, [highlights.length, skimmingEnabled])
```

### Issue 6: `highlightsLoading is not defined`
**Problem**: PDFViewer vẫn reference biến đã xóa

**Solution**: Remove reference
```typescript
// ❌ Before
{viewMode === "reading" && !highlightsLoading && highlights.length > 0 && (

// ✅ After
{viewMode === "reading" && highlights.length > 0 && (
```

---

## 🧪 Testing Guide

### 1. Start Backend
```bash
cd backend
python -m uvicorn src.paperreader.main:app --reload --port 8000
```

**Expected Startup Log:**
```
INFO:     Application startup complete.
[SkimmingCache] Initialized with cache directory: ./parsed_data/.skimming_cache
```

### 2. Start Frontend
```bash
npm run dev
```

### 3. Test Workflow

**Step 1: Upload PDF**
- Chọn file (e.g., `2303.14334v2.pdf`)
- Upload thành công

**Step 2: Enable Skimming**
- Click dropdown preset → chọn "Medium"
- Click "Enable" button
- Loading spinner hiện (~30-300s)

**Expected Backend Logs:**
```
[SkimmingService] Processing and highlighting: 2303.14334v2 (alpha=0.5, ratio=0.5)
[SkimmingService] Sending POST request to https://...
[SkimmingService] Response status: 200
[SkimmingService] ✓ Got 22 highlights for 2303.14334v2
```

**Step 3: Verify UI**
- Status badge: "✨ Skimming: 22 highlights (medium)"
- Highlights sidebar mở tự động
- PDF có colored overlays:
  - 🎯 Orange boxes cho Objective
  - 🔬 Blue boxes cho Method
  - 📊 Green boxes cho Result

**Step 4: Test Caching**
- Upload cùng PDF lần 2
- Click "Enable" với cùng preset "Medium"
- Response < 1s (từ cache)

**Backend Log:**
```
[SkimmingCache] Cache HIT for 2303.14334v2 (mode=sparse, alpha=0.5, ratio=0.5)
[SkimmingService] Using cached highlights for 2303.14334v2
```

**Step 5: Test Different Presets**
- Change preset to "Light" → Enable
- Fewer highlights (30%)
- Change to "Heavy" → Enable
- More highlights (70%)

### 4. Browser Console Checks

**Success Indicators:**
```javascript
[SinglePDFReader:tab-1] Enabling skimming with preset: medium
[useSkimmingHighlights] Enabling skimming for 2303.14334v2.pdf with preset: medium
[useSkimmingHighlights] Skimming enabled: 22 highlights
[SinglePDFReader:tab-1] Auto-activated 22 highlights

[PDFViewer] Highlights state: {
  total: 22,
  active: 22,
  hidden: 0,
  visible: 22,
  visibleCategories: ["objective", "method", "result"]
}

[usePDFHighlightPlugin] Page 1: 800x1130px, 22 total highlights
```

---

## 📊 API Reference

### External API (Semantic Scholar via ngrok)

**Base URL**: `https://lea-protrudent-azimuthally.ngrok-free.dev`

#### POST `/process_and_highlight`

**Request:**
```bash
curl -X POST \
  https://lea-protrudent-azimuthally.ngrok-free.dev/process_and_highlight \
  -H 'ngrok-skip-browser-warning: true' \
  -F 'file_name=2303.14334v2' \
  -F 'file=@2303.14334v2.pdf' \
  -F 'alpha=0.5' \
  -F 'ratio=0.5'
```

**Response:**
```json
{
  "status": "success",
  "pipeline_result": {
    "save_pdf": { "status": "success", ... },
    "pdf_to_sent": { "num_sents": 796, ... },
    "sent_to_highlights": { "num_highlights": 44, ... }
  },
  "highlight_result": {
    "file_id": "2303.14334v2",
    "num_dense": 44,
    "num_sparse": 22,
    "highlights": [
      {
        "id": 10,
        "text": "This paper explores...",
        "section": "ABSTRACT",
        "label": "method",
        "score": 3.0,
        "boxes": [
          {
            "left": 0.284,
            "top": 0.618,
            "width": 0.195,
            "height": 0.011,
            "page": 0
          }
        ],
        "block_id": "...",
        "is_sparse": true
      }
    ]
  }
}
```

**Label Types:**
- `"objective"`: Research goals/objectives
- `"method"`: Methodology/approach
- `"result"`: Findings/results

**Parameters:**
- `file_name`: Stem without `.pdf` (e.g., "paper_name")
- `file`: Binary PDF file
- `alpha`: Sparse filtering weight (0.0 - 1.0)
- `ratio`: Highlight retention ratio (0.0 - 1.0)

---

## 🔐 Security Considerations

### Current State
- ✅ Frontend validates file type (PDF only)
- ✅ Backend strips file path, uses stem only
- ✅ Caching isolated per file+preset
- ⚠️ No rate limiting on API calls
- ⚠️ ngrok API is public (temporary URL)

### Production Recommendations
1. **Rate Limiting**: Add rate limit cho skimming endpoints
2. **File Size Limit**: Giới hạn PDF upload size
3. **Timeout Handling**: Handle timeout cho API calls lâu
4. **Error Reporting**: Better error messages for users
5. **API Key**: Nếu API production, cần add authentication

---

## 📁 File Structure Summary

```
LOL-PaperReader/
├── backend/
│   └── src/paperreader/
│       ├── api/
│       │   └── skimming_routes.py          # NEW: API endpoints
│       ├── services/
│       │   └── skimming/                   # NEW: Service layer
│       │       ├── __init__.py
│       │       └── skimming_service.py
│       └── main.py                         # MODIFIED: Register routes
│
├── app/api/pdf/
│   ├── enable-skimming/
│   │   └── route.ts                        # NEW: Trigger endpoint
│   └── skimming-data/
│       └── route.ts                        # MODIFIED: Query endpoint
│
├── components/
│   ├── pdf-reader.tsx                      # MODIFIED: Main integration
│   ├── pdf-viewer.tsx                      # MODIFIED: Accept highlights prop
│   ├── pdf-highlight-overlay.tsx           # MODIFIED: 3 labels
│   ├── highlight-notes-sidebar.tsx         # MODIFIED: Colors/icons
│   └── skimming-controls.tsx               # MODIFIED: Categories
│
└── hooks/
    └── useSkimmingHighlights.ts            # MODIFIED: On-demand hooks
```

---

## 🚀 Next Steps / Future Improvements

### Short-term
1. ✅ Add loading progress indicator (hiện tại chỉ có spinner)
2. ✅ Error handling UI (toast notifications)
3. ✅ Persist preset selection per user (localStorage)

### Medium-term
1. **Batch Processing**: Pre-process multiple PDFs
2. **Background Jobs**: Queue system cho long-running tasks
3. **Highlight Export**: Export highlights to JSON/CSV
4. **Custom Thresholds**: Allow user adjust alpha/ratio manually

### Long-term
1. **Self-hosted Model**: Deploy highlighting model locally
2. **Custom Labels**: User-defined highlight categories
3. **Collaborative Highlights**: Share highlights giữa users
4. **ML Fine-tuning**: Train model trên user feedback

---

## 📝 Notes & Gotchas

### Important Behaviors

1. **Cache Persistence**: Cache tồn tại qua server restarts (filesystem-based)
2. **Tab Isolation**: Mỗi PDF tab có independent skimming state
3. **Reset on File Change**: Skimming state reset khi switch file
4. **Auto-activation**: Tất cả highlights auto-show sau khi load

### Performance Characteristics

- **First Time**: 30-300s (depends on PDF length, API load)
- **Cached**: < 1s
- **Frontend Render**: ~100-200ms for 20-50 highlights
- **Memory**: Minimal (highlights are lightweight JSON)

### Known Limitations

1. **API Dependency**: Requires ngrok API online
2. **No Offline Mode**: Cannot work without API connection
3. **Fixed Algorithm**: Cannot customize highlight detection
4. **English Only**: API may not work well với non-English papers

---

## 🎓 Credits & References

- **API Provider**: Semantic Scholar Team (via ngrok tunnel)
- **Original Paper**: [Semantic Reader Project](https://allenai.org/blog/case-study-iterative-design-for-skimming-support)
- **Label System**: Based on scholarly reading patterns
- **Integration**: Implemented December 3, 2025

---

## 📞 Support & Contact

For issues or questions:
1. Check backend logs: `backend/logs/`
2. Check browser console for frontend errors
3. Verify ngrok API is online: `curl https://lea-protrudent-azimuthally.ngrok-free.dev/docs`
4. Review this guide's troubleshooting section

**Happy Skimming! 🚀📚**
