# Quick Start: Enable PDF Highlighting

## 🚀 3-Minute Setup

### Step 1: Verify Files Exist

Make sure these new files are in your project:

```
✅ components/pdf-highlight-overlay.tsx
✅ components/skimming-controls.tsx
✅ hooks/usePDFHighlightPlugin.tsx
✅ hooks/useSkimmingHighlights.ts
✅ app/api/pdf/skimming-data/route.ts
✅ components/ui/tooltip.tsx
```

### Step 2: Open Your PDF Viewer

Edit `components/pdf-viewer.tsx`

### Step 3: Add Imports (at top of file)

```tsx
// Add these 3 lines
import { useSkimmingHighlights } from "@/hooks/useSkimmingHighlights"
import { usePDFHighlightPlugin } from "@/hooks/usePDFHighlightPlugin"
import { SkimmingControls } from "@/components/skimming-controls"
import { EyeOff } from "lucide-react" // If not already imported
```

### Step 4: Add State (inside component)

Find this line:
```tsx
const [viewMode, setViewMode] = useState<"reading" | "skimming">("reading")
```

Add these 2 lines right after:
```tsx
const [highlightsEnabled, setHighlightsEnabled] = useState(false)
const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
  new Set(["novelty", "method", "result"])
)
```

### Step 5: Fetch Highlights (after state declarations)

Add:
```tsx
const { highlights, loading: highlightsLoading, error: highlightsError, highlightCounts } = useSkimmingHighlights()
```

### Step 6: Create Highlight Plugin (after citation plugin)

Find this line:
```tsx
const citationPluginInstance = useCitationPlugin({ ... })
```

Add right after:
```tsx
const highlightPluginInstance = usePDFHighlightPlugin({
  highlights: highlightsEnabled ? highlights : [],
  visibleCategories,
  onHighlightClick: (h) => console.log("Clicked:", h.text),
})
```

### Step 7: Add to Plugins Array

Find:
```tsx
const plugins = [...pluginsRef.current, citationPluginInstance]
```

Change to:
```tsx
const plugins = [...pluginsRef.current, citationPluginInstance, highlightPluginInstance]
```

### Step 8: Add Controls Bar (in JSX before toolbar)

Find the toolbar div that starts with:
```tsx
<div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
```

Add **BEFORE** that div:
```tsx
{highlightsEnabled && !highlightsLoading && highlights.length > 0 && (
  <SkimmingControls
    visibleCategories={visibleCategories}
    onToggleCategory={(category) => {
      setVisibleCategories((prev) => {
        const next = new Set(prev)
        next.has(category) ? next.delete(category) : next.add(category)
        return next
      })
    }}
    onToggleAll={() => {
      setVisibleCategories((prev) =>
        prev.size === 3 ? new Set() : new Set(["novelty", "method", "result"])
      )
    }}
    highlightCounts={highlightCounts}
  />
)}
```

### Step 9: Add Toggle Button (in toolbar)

Find the view mode toggle button section. Add this button nearby:

```tsx
<Button
  variant={highlightsEnabled ? "default" : "ghost"}
  size="sm"
  onClick={() => setHighlightsEnabled(!highlightsEnabled)}
  className="gap-2 h-7"
  disabled={highlightsLoading}
>
  {highlightsEnabled ? (
    <>
      <Eye className="h-3.5 w-3.5" />
      <span className="text-xs">Highlights On</span>
      <span className="ml-1 px-1.5 py-0.5 bg-background/50 rounded-full text-xs font-bold">
        {highlights.length}
      </span>
    </>
  ) : (
    <>
      <EyeOff className="h-3.5 w-3.5" />
      <span className="text-xs">Highlights Off</span>
    </>
  )}
</Button>
```

### Step 10: Test It!

1. **Start your dev server:**
   ```bash
   npm run dev
   ```

2. **Upload CiteRead_skimming.pdf** (from `skimm/` folder)

3. **Click "Highlights Off" button** → Should change to "Highlights On"

4. **Look for colored rectangles** on the PDF:
   - 🟨 Yellow = Novelty
   - 🟦 Blue = Method
   - 🟩 Green = Result

5. **Hover over highlights** → Tooltip appears

6. **Click category buttons** → Highlights toggle on/off

## 🎯 Expected Result

When working correctly, you should see:

- **Colored rectangles** overlaid on PDF text
- **3 toggle buttons** at top (Novelty / Method / Result)
- **Counts** showing number of each type
- **Smooth hover effects** when mousing over highlights
- **Tooltips** showing full text and score

## 🐛 If Something's Wrong

### Highlights don't appear

**Check:**
1. Is "Highlights On" button active?
2. Do you have `skimm/CiteRead.json` file?
3. Open browser console → any errors?
4. Check Network tab → did `/api/pdf/skimming-data` load?

### Wrong PDF

The example data (`CiteRead.json`) only works with `CiteRead_skimming.pdf`.

To use with your own PDFs, you'll need to:
1. Generate highlight data for your PDF
2. Update `/api/pdf/skimming-data` to serve that data

### Highlights in wrong position

The coordinates in `CiteRead.json` are specifically for that paper. Each PDF needs its own coordinates.

## 📚 Next Steps

Once this works, check out:
- `SKIMMING_HIGHLIGHTS_GUIDE.md` - Full documentation
- `INTEGRATION_EXAMPLE.tsx` - Complete integration example
- Backend TODO: Generate highlights from any PDF

## 💡 Tips

- **Start simple**: Just get highlights showing first
- **Test categories**: Make sure toggle buttons work
- **Check console**: Look for plugin initialization logs
- **Zoom test**: Highlights should scale with zoom
- **Multi-page**: Verify highlights appear on all pages

That's it! You now have CiteRead-style highlighting! 🎉
