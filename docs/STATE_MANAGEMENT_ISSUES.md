# State Management Issues & Solutions

## Overview
Khi load nhiều papers cùng lúc, ứng dụng gặp vấn đề về state pollution - các components dùng chung state với nhau thay vì isolated per-tab. Document này phân tích chi tiết các vấn đề và đề xuất giải pháp.

---

## Current Architecture

### Tab Management (pdf-reader.tsx)
```typescript
interface PDFTab {
  id: string                    // Unique tab ID (timestamp-based)
  file: File                    // PDF file object
  selectedSection: string | null
  bookmarks: BookmarkItem[]
  qaHistory: Array<...>
  extractedCitations?: ExtractedCitation[]
  pdfId?: string               // Backend PDF identifier
  parsedOutputs?: any
}

const [tabs, setTabs] = useState<PDFTab[]>([])
const [activeTabId, setActiveTabId] = useState<string | null>(null)
```

**Status**: ✅ Properly isolated per tab
- Mỗi tab có state riêng
- Switch tabs không ảnh hưởng state của tabs khác

---

## Critical Issues

### 🔴 ISSUE #1: Citation Plugin Global State (CRITICAL)

**File**: `hooks/useCitationPlugin.tsx:28-35`

**Problem**:
```typescript
// Module-level variables (GLOBAL - shared across ALL PDF instances!)
let validCitationIds: Set<string> = new Set();
let annotationIdToDestination: Map<string, string> = new Map();
let moduleExtractedCitations: any[] = [];
```

**Why This Is Critical**:
1. Khi load Paper A:
   - `validCitationIds` = Set of citation IDs from Paper A
   - `moduleExtractedCitations` = citations from Paper A
   - Event listeners attached to DOM elements

2. Khi switch sang Paper B (hoặc load Paper B ở tab mới):
   - `validCitationIds` bị overwrite với citations from Paper B
   - `moduleExtractedCitations` bị overwrite
   - **BUT**: Event listeners từ Paper A vẫn còn trong DOM!

3. Kết quả:
   - Click citation ở Paper A → handler fires → đọc `moduleExtractedCitations` → gets data from Paper B ❌
   - Citations hiển thị sai data
   - Citations từ paper cũ có thể không work

**Impact**: HIGH - Citations hoàn toàn không đáng tin cậy khi có nhiều papers

**Reproduction Steps**:
1. Load Paper A.pdf
2. Click vào một citation → works correctly
3. Load Paper B.pdf ở tab mới (hoặc switch tab)
4. Quay lại Paper A.pdf
5. Click vào cùng citation đó → hiển thị data từ Paper B hoặc không hoạt động

---

### 🟡 ISSUE #2: Pipeline Status Not Per-PDF

**File**: `hooks/usePipelineStatus.ts`

**Problem**:
```typescript
// Polls a GLOBAL endpoint - not tied to specific PDF
const res = await fetch('/api/qa/status')
```

**Why This Is An Issue**:
1. Backend `/api/qa/status` trả về global status (không specific cho PDF nào)
2. Nếu user load Paper A và Paper B:
   - Cả 2 tabs đều poll cùng endpoint
   - Status hiển thị là "processing" cho cả 2
   - Không biết paper nào đang được process

3. User experience:
   - Load Paper A → "Processing..."
   - Load Paper B → cả 2 tabs đều show "Processing..."
   - Không clear paper nào ready

**Impact**: MEDIUM - Confusing UX nhưng không break functionality

---

### 🟡 ISSUE #3: Storage Keys Based On Filename Only

**File**: `components/qa-interface.tsx:56-57`

**Problem**:
```typescript
const storageKey = `chat_session_${pdfFile.name}`
const messagesStorageKey = `chat_messages_${pdfFile.name}`
```

**Why This Is An Issue**:
1. Nếu load cùng một file 2 lần (2 tabs):
   - Tab 1: `chat_session_paper.pdf`
   - Tab 2: `chat_session_paper.pdf` (SAME KEY!)

2. Cả 2 tabs share:
   - Cùng session ID
   - Cùng message history
   - User chat ở tab 1 → history xuất hiện ở tab 2

3. Behavior:
   - Clear history ở 1 tab → clear ở tất cả tabs cùng file
   - New message ở 1 tab → xuất hiện ở tabs khác (after reload)

**Impact**: MEDIUM - Confusing khi có multiple tabs cùng file

---

### 🟢 ISSUE #4: Cache Keys May Collide (Minor)

**File**: `hooks/useExtractCitations.ts:40`

**Problem**:
```typescript
const cacheKey = `${file.name}-${file.size}`
```

**Why This Is Minor**:
1. Collision chỉ xảy ra nếu 2 files có:
   - Exact same filename
   - Exact same size

2. Probability: Very low in practice

3. Impact nếu xảy ra:
   - Paper B sẽ dùng cached citations của Paper A
   - Incorrect citations displayed

**Impact**: LOW - Rare edge case

---

## Proposed Solutions

### ✅ Solution #1: Fix Citation Plugin State Management

**Approach**: Convert module-level state to Context API with per-tab isolation

**Implementation Plan**:

#### Step 1: Create Citation Context
```typescript
// contexts/CitationContext.tsx
interface CitationState {
  validCitationIds: Set<string>
  annotationIdToDestination: Map<string, string>
  extractedCitations: any[]
}

interface CitationContextValue {
  [tabId: string]: CitationState
}

const CitationContext = createContext<{
  state: CitationContextValue
  updateCitations: (tabId: string, citations: any[]) => void
} | null>(null)
```

#### Step 2: Modify PDFReader to provide context
```typescript
// pdf-reader.tsx
const [citationStates, setCitationStates] = useState<CitationContextValue>({})

return (
  <CitationContext.Provider value={{ state: citationStates, updateCitations }}>
    {/* existing components */}
  </CitationContext.Provider>
)
```

#### Step 3: Update useCitationPlugin to use context
```typescript
// hooks/useCitationPlugin.tsx
export const useCitationPlugin = (tabId: string, props?: CitationPluginProps): Plugin => {
  const citationContext = useContext(CitationContext)

  // Get state specific to this tab
  const tabState = citationContext.state[tabId] || {
    validCitationIds: new Set(),
    annotationIdToDestination: new Map(),
    extractedCitations: []
  }

  // Use tabState instead of module-level variables
  // ...
}
```

**Benefits**:
- ✅ Complete isolation between tabs
- ✅ No state pollution
- ✅ Citations work correctly for each paper independently
- ✅ Clean up state when tab closes

**Files to modify**:
1. Create `contexts/CitationContext.tsx`
2. Modify `hooks/useCitationPlugin.tsx`
3. Modify `components/pdf-reader.tsx`
4. Modify `components/pdf-viewer.tsx` (pass tabId to plugin)

---

### ✅ Solution #2: Add PDF Identifier to Pipeline Status

**Approach**: Make pipeline status per-PDF instead of global

**Implementation Plan**:

#### Step 1: Update usePipelineStatus to accept PDF identifier
```typescript
// hooks/usePipelineStatus.ts
export function usePipelineStatus(pdfId?: string, options: UsePipelineStatusOptions = {}) {
  const endpoint = pdfId
    ? `/api/qa/status?pdf_id=${pdfId}`
    : '/api/qa/status'

  const res = await fetch(endpoint)
  // ...
}
```

#### Step 2: Update QAInterface to pass pdfId
```typescript
// components/qa-interface.tsx
const { isPipelineReady, status: pipelineStatus } = usePipelineStatus(
  activeTab?.pdfId  // Pass PDF identifier
)
```

#### Step 3: Update backend to track per-PDF status
```python
# Backend needs to maintain status per PDF
# /api/qa/status?pdf_id=xxx should return status for that specific PDF
```

**Benefits**:
- ✅ Clear status per PDF
- ✅ User knows which PDF is ready
- ✅ Better UX with multiple papers

**Files to modify**:
1. `hooks/usePipelineStatus.ts`
2. `components/qa-interface.tsx`
3. Backend API endpoint

---

### ✅ Solution #3: Include Tab ID in Storage Keys

**Approach**: Use composite keys (tabId + filename) for localStorage

**Implementation Plan**:

#### Step 1: Pass tabId to QAInterface
```typescript
// pdf-reader.tsx
<QAInterface
  tabId={activeTab.id}  // Add this prop
  pdfFile={activeTab.file}
  // ...
/>
```

#### Step 2: Update storage keys to include tabId
```typescript
// components/qa-interface.tsx
interface QAInterfaceProps {
  tabId: string  // Add this
  pdfFile: File
  // ...
}

export function QAInterface({ tabId, pdfFile, ... }: QAInterfaceProps) {
  const storageKey = `chat_session_${tabId}_${pdfFile.name}`
  const messagesStorageKey = `chat_messages_${tabId}_${pdfFile.name}`

  // Now each tab has its own session and messages
}
```

**Benefits**:
- ✅ Complete session isolation per tab
- ✅ Can have same PDF in multiple tabs with different conversations
- ✅ Clear history in one tab doesn't affect others

**Consideration**:
- Sessions persist even if user closes and reopens same file
- May want to add "Resume session" vs "New session" option

**Files to modify**:
1. `components/qa-interface.tsx` (add tabId prop)
2. `components/pdf-reader.tsx` (pass tabId to QAInterface)

---

### ✅ Solution #4: Enhance Citation Cache Keys

**Approach**: Include tabId in cache keys

**Implementation Plan**:

```typescript
// hooks/useExtractCitations.ts
export function useExtractCitations(tabId: string) {
  const extractCitations = useCallback(async (file: File) => {
    // Include tabId in cache key for complete isolation
    const cacheKey = `${tabId}_${file.name}_${file.size}`

    if (cacheRef.current[cacheKey]) {
      return cacheRef.current[cacheKey]
    }
    // ...
  }, [tabId])
}
```

**Benefits**:
- ✅ Zero chance of cache collision
- ✅ Each tab has independent cache
- ✅ Simple to implement

**Files to modify**:
1. `hooks/useExtractCitations.ts`
2. `components/pdf-reader.tsx` (pass tabId)

---

## Implementation Priority

### Phase 1: Critical Fixes (Must Do)
1. **Fix Citation Plugin Global State** (Solution #1)
   - Severity: CRITICAL
   - Effort: Medium (2-3 hours)
   - Impact: High - fixes broken citations

### Phase 2: Important Improvements (Should Do)
2. **Include Tab ID in Storage Keys** (Solution #3)
   - Severity: Medium
   - Effort: Low (30 mins)
   - Impact: Medium - better UX

3. **Enhance Citation Cache Keys** (Solution #4)
   - Severity: Low
   - Effort: Very Low (15 mins)
   - Impact: Low - prevents edge case

### Phase 3: Nice to Have (Could Do)
4. **Per-PDF Pipeline Status** (Solution #2)
   - Severity: Medium
   - Effort: Medium (requires backend changes)
   - Impact: Medium - better UX

---

## Alternative Approach: Per-Tab React Context

Thay vì fix từng issue riêng lẻ, có thể implement một "Tab Context" toàn diện:

```typescript
// contexts/TabContext.tsx
interface TabContextValue {
  tabId: string
  pdfFile: File
  citationState: CitationState
  sessionState: SessionState
  // All tab-specific state here
}

const TabContext = createContext<TabContextValue | null>(null)

// pdf-reader.tsx
{tabs.map(tab => (
  <TabContext.Provider value={getTabContext(tab.id)}>
    {activeTabId === tab.id && (
      <>
        <PDFViewer />
        <QAInterface />
      </>
    )}
  </TabContext.Provider>
))}
```

**Benefits**:
- ✅ Complete isolation by design
- ✅ Easy to add new tab-specific features
- ✅ Clear ownership of state
- ✅ Automatic cleanup when tab closes

**Drawbacks**:
- ⚠️ More refactoring required upfront
- ⚠️ Need to update many components

---

## Testing Plan

### Manual Testing
1. Load Paper A, click citations → verify works
2. Load Paper B in new tab
3. Switch back to Paper A, click same citations → verify still works correctly
4. Load same paper in 2 tabs → verify independent sessions
5. Close tab → verify state cleanup

### Automated Testing (Future)
```typescript
describe('Multi-tab state isolation', () => {
  it('should maintain separate citation state per tab', () => {
    // Test citation state isolation
  })

  it('should maintain separate QA sessions per tab', () => {
    // Test session isolation
  })

  it('should cleanup state when tab closes', () => {
    // Test cleanup
  })
})
```

---

## Rollout Strategy

1. **Week 1**: Implement Solution #1 (Citation Plugin fix)
   - Create PR with context implementation
   - Test thoroughly with multiple papers
   - Deploy to staging

2. **Week 1-2**: Implement Solutions #3 & #4 (Storage keys + cache)
   - Quick wins, low risk
   - Can be combined in same PR

3. **Week 2+**: Implement Solution #2 (Pipeline status)
   - Requires backend coordination
   - Deploy backend changes first
   - Then update frontend

---

## Migration Notes

### For Users
- Existing sessions will continue to work
- After update, sessions will be tab-specific
- May need to log in again to some sessions

### For Developers
- Review all components using `useCitationPlugin`
- Ensure `tabId` is passed correctly
- Update any custom hooks that cache data

---

## Conclusion

Vấn đề chính là **Citation Plugin Global State** - đây là critical bug cần fix ngay. Các issues khác là improvements cho UX tốt hơn.

**Recommended approach**:
1. Fix Citation Plugin bằng Context API (Phase 1)
2. Add tabId to storage keys (Phase 2)
3. Enhance cache keys (Phase 2)
4. Per-PDF pipeline status nếu có thời gian (Phase 3)

Với approach này, sẽ có complete state isolation giữa các tabs và papers.
