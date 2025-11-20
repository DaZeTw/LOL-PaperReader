/**
 * INTEGRATION EXAMPLE: How to add highlighting to pdf-viewer.tsx
 *
 * This file shows the key changes needed to integrate the skimming highlight system.
 * Copy these sections into your actual pdf-viewer.tsx file.
 */

import { useState, useEffect, useRef } from "react"
import { Viewer, Worker } from "@react-pdf-viewer/core"
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation"
import { zoomPlugin } from "@react-pdf-viewer/zoom"
import { thumbnailPlugin } from "@react-pdf-viewer/thumbnail"
import { bookmarkPlugin } from "@react-pdf-viewer/bookmark"
import { useCitationPlugin } from "@/hooks/useCitatioPlugin"

// ✅ ADD THESE IMPORTS
import { useSkimmingHighlights } from "@/hooks/useSkimmingHighlights"
import { usePDFHighlightPlugin } from "@/hooks/usePDFHighlightPlugin"
import { SkimmingControls } from "@/components/skimming-controls"

export function PDFViewer({
  file,
  selectedSection,
  navigationTarget,
  onPageChange,
  onSectionSelect,
  isActive,
}: PDFViewerProps) {
  // Existing state...
  const [pdfUrl, setPdfUrl] = useState<string>("")
  const [numPages, setNumPages] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [viewMode, setViewMode] = useState<"reading" | "skimming">("reading")

  // ✅ ADD SKIMMING HIGHLIGHT STATE
  const [highlightsEnabled, setHighlightsEnabled] = useState(false)
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    new Set(["novelty", "method", "result"])
  )

  // ✅ FETCH HIGHLIGHTS DATA
  const { highlights, loading: highlightsLoading, error: highlightsError, highlightCounts } = useSkimmingHighlights()

  // Existing plugins...
  const pageNavigationPluginInstance = useRef(pageNavigationPlugin()).current
  const zoomPluginInstance = useRef(zoomPlugin()).current
  const thumbnailPluginInstance = useRef(thumbnailPlugin()).current
  const bookmarkPluginInstance = useRef(bookmarkPlugin()).current
  const citationPluginInstance = useCitationPlugin({
    pdfUrl: pdfUrl,
    extractedCitations: extractedCitations,
  })

  // ✅ ADD HIGHLIGHT PLUGIN
  const highlightPluginInstance = usePDFHighlightPlugin({
    highlights: highlightsEnabled ? highlights : [],
    visibleCategories,
    onHighlightClick: (highlight) => {
      console.log("[Highlight Clicked]", highlight.text)
      // TODO: Show highlight details in sidebar
    },
  })

  // ✅ ADD HIGHLIGHT PLUGIN TO PLUGINS ARRAY
  const plugins = [
    pageNavigationPluginInstance,
    zoomPluginInstance,
    thumbnailPluginInstance,
    bookmarkPluginInstance,
    citationPluginInstance,
    highlightPluginInstance, // ← Add this
  ]

  // ✅ HANDLERS FOR CATEGORY TOGGLES
  const handleToggleCategory = (category: string) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const handleToggleAll = () => {
    setVisibleCategories((prev) => {
      if (prev.size === 3) {
        return new Set() // Hide all
      } else {
        return new Set(["novelty", "method", "result"]) // Show all
      }
    })
  }

  return (
    <div className="pdf-viewer-container flex flex-1 h-full bg-muted/30 min-h-0">
      {/* Existing sidebar code... */}

      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        {/* ✅ ADD SKIMMING CONTROLS TOOLBAR */}
        {highlightsEnabled && !highlightsLoading && highlights.length > 0 && (
          <SkimmingControls
            visibleCategories={visibleCategories}
            onToggleCategory={handleToggleCategory}
            onToggleAll={handleToggleAll}
            highlightCounts={highlightCounts}
          />
        )}

        {/* Existing toolbar with modifications */}
        <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
          <div className="flex items-center gap-2">
            {/* ... existing page navigation ... */}

            {/* ✅ ADD HIGHLIGHT TOGGLE BUTTON */}
            <div className="w-px h-4 bg-border mx-1" />
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

            {/* Show loading/error states */}
            {highlightsLoading && (
              <span className="text-xs text-muted-foreground">
                Loading highlights...
              </span>
            )}
            {highlightsError && (
              <span className="text-xs text-destructive">
                Error: {highlightsError}
              </span>
            )}
          </div>

          {/* ... existing zoom controls ... */}
        </div>

        {/* Existing PDF viewer */}
        <div className="flex-1 overflow-hidden bg-muted/30">
          {viewMode === "reading" ? (
            <div className="h-full p-4">
              {pdfUrl && (
                <div className="h-full mx-auto max-w-4xl">
                  <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                    <div className="bg-white shadow-lg rounded-lg overflow-hidden h-full">
                      <Viewer
                        fileUrl={pdfUrl}
                        plugins={plugins} // ← Now includes highlight plugin
                        onDocumentLoad={(e) => {
                          setNumPages(e.doc.numPages)
                          // ... existing code
                        }}
                        onPageChange={handlePageChangeInternal}
                      />
                    </div>
                  </Worker>
                </div>
              )}
            </div>
          ) : (
            <SkimmingView
              file={file}
              numPages={numPages}
              onNavigateToPage={handleNavigateToPage}
              onExitSkimming={() => setViewMode("reading")}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * SUMMARY OF CHANGES:
 *
 * 1. Import new hooks and components:
 *    - useSkimmingHighlights
 *    - usePDFHighlightPlugin
 *    - SkimmingControls
 *
 * 2. Add state management:
 *    - highlightsEnabled (boolean)
 *    - visibleCategories (Set<string>)
 *
 * 3. Fetch highlights data:
 *    - const { highlights, loading, error, highlightCounts } = useSkimmingHighlights()
 *
 * 4. Create highlight plugin:
 *    - const highlightPluginInstance = usePDFHighlightPlugin({ ... })
 *
 * 5. Add plugin to plugins array:
 *    - plugins = [...existingPlugins, highlightPluginInstance]
 *
 * 6. Add UI controls:
 *    - <SkimmingControls /> toolbar above PDF
 *    - Toggle button in toolbar
 *    - Loading/error states
 *
 * 7. Handle interactions:
 *    - Toggle categories (novelty/method/result)
 *    - Show/hide all
 *    - Click on highlights
 */
