# State Management Issues & Solutions

## Overview
When loading multiple papers simultaneously, the application encounters state pollution issues - components share state with each other instead of being isolated per-tab. This document provides a detailed analysis of the issues and proposes solutions.

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
- Each tab has its own state
- Switching tabs doesn't affect other tabs' state

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
1. When loading Paper A:
   - `validCitationIds` = Set of citation IDs from Paper A
   - `moduleExtractedCitations` = citations from Paper A
   - Event listeners attached to DOM elements

2. When switching to Paper B (or loading Paper B in a new tab):
   - `validCitationIds` gets overwritten with citations from Paper B
   - `moduleExtractedCitations` gets overwritten
   - **BUT**: Event listeners from Paper A still remain in the DOM!

3. Result:
   - Click citation in Paper A → handler fires → reads `moduleExtractedCitations` → gets data from Paper B ❌
   - Citations display wrong data
   - Citations from old paper may not work

**Impact**: HIGH - Citations are completely unreliable when multiple papers are loaded

**Reproduction Steps**:
1. Load Paper A.pdf
2. Click on a citation → works correctly
3. Load Paper B.pdf in a new tab (or switch tabs)
4. Return to Paper A.pdf
5. Click on the same citation → displays data from Paper B or doesn't work

---

### 🟡 ISSUE #2: Pipeline Status Not Per-PDF

**File**: `hooks/usePipelineStatus.ts`

**Problem**:
```typescript
// Polls a GLOBAL endpoint - not tied to specific PDF
const res = await fetch('/api/qa/status')
```

**Why This Is An Issue**:
1. Backend `/api/qa/status` returns global status (not specific to any PDF)
2. If user loads Paper A and Paper B:
   - Both tabs poll the same endpoint
   - Status shows "processing" for both
   - Can't tell which paper is being processed

3. User experience:
   - Load Paper A → "Processing..."
   - Load Paper B → both tabs show "Processing..."
   - Unclear which paper is ready

**Impact**: MEDIUM - Confusing UX but doesn't break functionality

---

### 🟡 ISSUE #3: Storage Keys Based On Filename Only

**File**: `components/qa-interface.tsx:56-57`

**Problem**:
```typescript
const storageKey = `chat_session_${pdfFile.name}`
const messagesStorageKey = `chat_messages_${pdfFile.name}`
```

**Why This Is An Issue**:
1. If loading the same file twice (2 tabs):
   - Tab 1: `chat_session_paper.pdf`
   - Tab 2: `chat_session_paper.pdf` (SAME KEY!)

2. Both tabs share:
   - Same session ID
   - Same message history
   - User chats in tab 1 → history appears in tab 2

3. Behavior:
   - Clear history in 1 tab → clears in all tabs with same file
   - New message in 1 tab → appears in other tabs (after reload)

**Impact**: MEDIUM - Confusing when having multiple tabs with same file

---

### 🟢 ISSUE #4: Cache Keys May Collide (Minor)

**File**: `hooks/useExtractCitations.ts:40`

**Problem**:
```typescript
const cacheKey = `${file.name}-${file.size}`
```

**Why This Is Minor**:
1. Collision only happens if 2 files have:
   - Exact same filename
   - Exact same size

2. Probability: Very low in practice

3. Impact if it occurs:
   - Paper B will use cached citations from Paper A
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

Instead of fixing each issue separately, we could implement a comprehensive "Tab Context":

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

The main issue is **Citation Plugin Global State** - this is a critical bug that needs immediate fixing. The other issues are improvements for better UX.

**Recommended approach**:
1. Fix Citation Plugin using Context API (Phase 1)
2. Add tabId to storage keys (Phase 2)
3. Enhance cache keys (Phase 2)
4. Per-PDF pipeline status if time permits (Phase 3)

With this approach, we'll achieve complete state isolation between tabs and papers.
