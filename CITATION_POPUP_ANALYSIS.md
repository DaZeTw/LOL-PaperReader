# Citation Popup Implementation Analysis

## Summary

Your current citation popup implementation in `components/pdf-viewer.tsx` already follows most of the patterns from the Google Scholar Reader extension. This document explains the key patterns and suggests optional enhancements.

## Extension Patterns vs. Your Implementation

### 1. **Click Detection & Event Handling**

#### Extension Pattern (`reader-compiled.js:169`)
```javascript
// Extension creates clickable links
const citationLink = W({className: "gsr-citation-link"});
citationLink.addEventListener("click", handleClick => {
  const sidebar = app.I;
  sidebar.S.display(
    sidebar.j.getBoundingClientRect(), // Element bounds
    citationLink,                       // Clicked element
    parsedData,                         // Full citation data
    citationIndex,                      // Citation index
    metadata
  );
  handleClick.preventDefault();
  handleClick.stopPropagation();
});
```

#### Your Implementation (`pdf-viewer.tsx:605-673`)
✅ **Already Implemented** - You detect citations via:
- Text layer analysis (lines 238-677)
- Superscript detection
- Hyperlink detection
- Position-based detection
- Click handlers with `span.onclick`

**Differences:**
- Extension uses separate link elements
- You make text spans clickable directly
- Both approaches work well!

---

### 2. **Popup Positioning**

#### Extension Pattern (`reader-compiled.js:179, functions vk, dk, ek`)
```javascript
// Calculate position relative to trigger
const triggerBounds = element.getBoundingClientRect();
const containerBounds = parent.getBoundingClientRect();

// Center on trigger
let x = triggerBounds.left + triggerBounds.width / 2 - popupWidth / 2;

// CLAMP TO VIEWPORT with 24px padding
x = Math.max(24, Math.min(x, window.innerWidth - popupWidth - 24));

// Position below or above trigger
let y = triggerBounds.bottom + 8;
if (y + popupHeight > window.innerHeight) {
  y = triggerBounds.top - popupHeight - 8; // Flip above
}

// Apply position
popup.style.left = `${x}px`;
popup.style.top = `${y}px`;
```

#### Your Implementation (`pdf-viewer.tsx:1132-1136`)
```tsx
style={{
  left: `${citationPopup.position.x}px`,
  top: `${citationPopup.position.y}px`,
  transform: "translate(-50%, calc(-100% - 8px))",
}}
```

**Status:** ⚠️ **Partially Implemented**
- ✅ You center horizontally with `translate(-50%)`
- ✅ You position above trigger with `calc(-100% - 8px)`
- ❌ Missing viewport boundary clamping (can overflow)

**Enhancement Suggestion:**
Add boundary clamping logic in a `useEffect` hook:

```tsx
// In PDFViewer component
const [adjustedPosition, setAdjustedPosition] = useState(citationPopup.position);

useEffect(() => {
  if (!citationPopup || !popupRef.current) return;

  const rect = popupRef.current.getBoundingClientRect();
  const PADDING = 24; // px from viewport edges

  let x = citationPopup.position.x;
  let y = citationPopup.position.y;

  // Clamp X (horizontal)
  const halfWidth = rect.width / 2;
  x = Math.max(PADDING + halfWidth, Math.min(x, window.innerWidth - PADDING - halfWidth));

  // Clamp Y (vertical) - flip if needed
  const popupHeight = rect.height;
  const triggerTop = citationPopup.position.y;

  // Try positioning above first
  let aboveY = triggerTop - popupHeight - 8;
  if (aboveY < PADDING) {
    // Not enough space above, try below
    let belowY = triggerTop + 8;
    if (belowY + popupHeight < window.innerHeight - PADDING) {
      y = belowY; // Use below
    } else {
      // Clamp to viewport top/bottom
      y = Math.max(PADDING, Math.min(aboveY, window.innerHeight - PADDING - popupHeight));
    }
  } else {
    y = aboveY; // Use above
  }

  setAdjustedPosition({ x, y });
}, [citationPopup, popupRef.current]);

// Then use adjustedPosition in style:
style={{
  left: `${adjustedPosition.x}px`,
  top: `${adjustedPosition.y}px`,
  transform: "translate(-50%, 0)", // Center horizontally
}}
```

---

### 3. **Data Structure**

#### Extension Format (`reader-compiled.js:170`)
```javascript
{
  id: string,
  text: string,           // Citation title/text
  page: number,           // Page number
  url: string,            // Reference URL
  authors: string[],      // Author list
  year: number,           // Publication year
  abstract: string,       // Full abstract
  venue: string,          // Publication source
  confidence: number      // Relevance score
}
```

#### Your Format (`pdf-viewer.tsx:38-50`)
```typescript
{
  id: string;
  number: number;
  text: string;
  authors?: string;
  title?: string;
  year?: string;
  journal?: string;
  doi?: string;
  url?: string;
  arxivId?: string;
}
```

**Status:** ✅ **Well Implemented**
- Your structure matches the extension pattern
- Includes additional fields (doi, arxivId) which is excellent
- Type safety with TypeScript

---

### 4. **Animation & Visibility**

#### Extension CSS
```css
.gsr-popover {
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.13s, visibility 0s 0.13s;
}

.gsr-popover.gsr-vis {
  visibility: visible;
  opacity: 1;
  transition: all 0s;
}
```

#### Your Implementation
**Status:** ⚠️ **Could Be Enhanced**
- Currently appears/disappears instantly
- Could add fade-in/fade-out animation

**Enhancement Suggestion:**
```tsx
// Add state for visibility
const [isPopupVisible, setIsPopupVisible] = useState(false);

// Trigger animation when citationPopup changes
useEffect(() => {
  if (citationPopup) {
    setTimeout(() => setIsPopupVisible(true), 10); // Trigger after mount
  } else {
    setIsPopupVisible(false);
  }
}, [citationPopup]);

// Update className
className={`citation-popup fixed z-50 transition-opacity duration-150 ${
  isPopupVisible ? 'opacity-100' : 'opacity-0'
}`}
```

---

### 5. **Hover Behavior**

#### Extension Pattern
- Immediate show on click
- Delayed show (500ms) on hover
- Delayed hide (200ms) when leaving to allow moving to popup

#### Your Implementation (`pdf-viewer.tsx:513-603`)
**Status:** ✅ **Excellent Implementation**
- 500ms hover delay before showing popup (line 519)
- 200ms leave delay to allow moving to popup (line 598)
- Clears timeout if re-entering (lines 1138-1141)

---

### 6. **Lazy Loading Citation Details**

#### Extension Pattern (`reader-compiled.js:function ok`)
```javascript
// Show basic info immediately
displayCitation(basicInfo);

// Fetch full details asynchronously
fetchFullCitationData(citationId).then(fullData => {
  if (stillSelected(citationId)) {
    updateCitationDisplay(fullData);
  }
});
```

#### Your Implementation (`pdf-viewer.tsx:524-586`)
**Status:** ✅ **Well Implemented**
- Shows basic citation info immediately
- Fetches paper URL asynchronously via `/api/references/search`
- Updates popup state when URL loads
- Shows loading indicator (line 1197-1201)

---

## Comparison Summary

| Feature | Extension | Your App | Status |
|---------|-----------|----------|--------|
| Click Detection | ✅ Separate link elements | ✅ Clickable text spans | ✅ Both work well |
| Hover Behavior | ✅ 500ms delay | ✅ 500ms delay | ✅ Matching |
| Basic Positioning | ✅ Center on trigger | ✅ Center on trigger | ✅ Matching |
| Boundary Clamping | ✅ 24px padding | ❌ Can overflow | ⚠️ Enhancement needed |
| Vertical Flip | ✅ Above/below logic | ✅ Always above | ⚠️ Could add flip |
| Data Structure | ✅ Rich metadata | ✅ Rich metadata | ✅ Matching |
| Lazy Loading | ✅ Async fetch | ✅ Async fetch | ✅ Matching |
| Animation | ✅ Fade in/out | ❌ Instant | ⚠️ Optional enhancement |
| Close on Outside Click | ✅ Implemented | ✅ Implemented | ✅ Matching |
| DOI Validation | ❌ Not present | ✅ HEAD request check | ✅ Your feature! |

---

## Key Extension Files Analyzed

1. **`/extension/reader-compiled.js`** (555KB minified)
   - Function `Rj` (line ~169): Citation link creation
   - Class `Bk`: Citation popup display manager
   - Functions `vk`, `dk`, `ek` (line ~179): Positioning system
   - Function `ok`: Citation selection and detail loading
   - Function `gk`: Get selected citation

2. **`/extension/reader-prod.css`**
   - `.gsr-citation-link`: Citation styling
   - `.gsr-popover`: Popup positioning and animation
   - `.gsr-dialog`: Dialog layout

3. **`/extension/annotation/annotation.js`** (readable, not minified)
   - Clean patterns for UI interaction
   - Event delegation examples

---

## Recommended Enhancements (Optional)

### Priority 1: Boundary Clamping
Prevents popup from overflowing viewport edges on small screens or near edges.

**Implementation:** See code example in Section 2 above.

**Why:** Currently your popup can overflow off-screen if citation is near viewport edge.

---

### Priority 2: Vertical Flip Logic
Show popup below trigger if not enough space above.

```tsx
// In positioning logic
let y = citationPopup.position.y;
const popupHeight = popupRef.current?.getBoundingClientRect().height || 0;

// Try above first
let aboveY = y - popupHeight - 8;
if (aboveY < 24) {
  // Not enough space above, try below
  y = citationPopup.position.y + 20; // Below trigger
} else {
  y = aboveY;
}
```

**Why:** Extension always finds space for popup, yours might clip at top of page.

---

### Priority 3: Smooth Fade Animation
Matches extension's polished feel.

**Implementation:** See code example in Section 4 above.

**Why:** Instant appearance can feel jarring; fade is more professional.

---

## Your Unique Features (Better than Extension!)

1. **DOI Validation** (lines 1226-1292)
   - HEAD request to check DOI before opening
   - Automatic fallback to search API
   - The extension doesn't do this!

2. **TypeScript Type Safety**
   - Explicit interfaces for CitationPopup
   - Prevents runtime errors

3. **React Hooks Architecture**
   - Clean state management
   - Proper cleanup in useEffect

4. **Definition Popup** (lines 698-751)
   - ScholarPhi-style term definitions
   - Double-click to define
   - The extension doesn't have this!

---

## Code Locations Reference

**Your Files:**
- Main implementation: `components/pdf-viewer.tsx` lines 222-695 (detection), 1128-1317 (popup)
- Definition popup: `components/definition-popup.tsx`

**Extension Files (for reference):**
- Citation logic: `extension/reader-compiled.js` (minified, hard to read)
- Annotation example: `extension/annotation/annotation.js` (readable)
- Styles: `extension/reader-prod.css`

---

## Testing Checklist

- [ ] Citation popup appears on hover after 500ms
- [ ] Citation popup appears on click immediately
- [ ] Popup stays visible when mouse moves to it
- [ ] Popup disappears when clicking outside
- [ ] Popup shows loading state for paper URL
- [ ] Paper URL opens in new tab
- [ ] DOI validation works (falls back to search if invalid)
- [ ] Popup doesn't overflow viewport edges ⚠️ (needs enhancement)
- [ ] Popup flips below trigger if needed ⚠️ (needs enhancement)
- [ ] Definition popup works on double-click
- [ ] Both popups don't interfere with each other

---

## Conclusion

Your implementation is **excellent** and already matches or exceeds the extension in most areas. The two key enhancements you could add are:

1. **Viewport boundary clamping** - Prevents overflow
2. **Vertical flip logic** - Shows popup below if no space above

Both are optional polish features. Your current implementation works well for most use cases!
