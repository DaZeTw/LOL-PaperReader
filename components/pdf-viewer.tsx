"use client";

import { useState, useEffect, useRef } from "react"
import { Viewer, Worker } from "@react-pdf-viewer/core"
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation"
import { zoomPlugin } from "@react-pdf-viewer/zoom"
import { thumbnailPlugin } from "@react-pdf-viewer/thumbnail"
import { bookmarkPlugin } from "@react-pdf-viewer/bookmark"
import { searchPlugin } from "@react-pdf-viewer/search"
import { useCitationPlugin } from "@/hooks/useCitatioPlugin"
import { useExtractCitations, type ExtractedCitation } from "@/hooks/useExtractCitations"
import { useSkimmingHighlights } from "@/hooks/useSkimmingHighlights"
import { usePDFHighlightPlugin } from "@/hooks/usePDFHighlightPlugin"
import { useAnnotation } from "@/hooks/useAnnotation" // ✅ ADD: Import annotation hook
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Sidebar, Eye, FileText, Highlighter, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PDFSidebar } from "./pdf-sidebar"
import { SkimmingView } from "./skimming-view"
import { SkimmingControls } from "./skimming-controls"

import "@react-pdf-viewer/core/lib/styles/index.css"
import "@react-pdf-viewer/page-navigation/lib/styles/index.css"
import "@react-pdf-viewer/zoom/lib/styles/index.css"
import "@react-pdf-viewer/thumbnail/lib/styles/index.css"
import "@react-pdf-viewer/bookmark/lib/styles/index.css"
import "@react-pdf-viewer/highlight/lib/styles/index.css" // ✅ ADD: Highlight styles
import "@react-pdf-viewer/search/lib/styles/index.css" // ✅ ADD: Search styles
import "@/styles/pdf-components.css"

interface PDFViewerProps {
  file: File
  selectedSection?: string | null
  navigationTarget?: { page: number; yPosition: number; highlightText?: string; highlightId?: number } | undefined
  onPageChange?: (page: number) => void
  onSectionSelect?: (bookmark: any) => void
  onNavigationComplete?: () => void
  onDocumentLoad?: (pageCount: number) => void
  isActive?: boolean
  hiddenHighlightIds?: Set<number>
  activeHighlightIds?: Set<number>
  highlights?: SkimmingHighlight[]
  onReferenceClick?: (citationId: string) => void
}

export function PDFViewer({
  file,
  selectedSection,
  navigationTarget,
  onPageChange,
  onSectionSelect,
  onNavigationComplete,
  onDocumentLoad,
  isActive,
  hiddenHighlightIds = new Set(),
  activeHighlightIds = new Set(),
  highlights = [],
  onReferenceClick,
}: PDFViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string>("")
  const [numPages, setNumPages] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [viewMode, setViewMode] = useState<"reading" | "skimming">("reading")
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    new Set(["objective", "method", "result"])
  )

  // Citation state - now managed in viewer
  const [extractedCitations, setExtractedCitations] = useState<ExtractedCitation[]>([])

  // Citation extraction hook
  const { extractCitations, getCitationById, loading: extracting, progress } = useExtractCitations()

  // Skimming highlights hook
  // Highlights are now passed from parent via props
  // const { highlights, loading: highlightsLoading, error: highlightsError, highlightCounts } = useSkimmingHighlights()
  const highlightCounts = {
    objective: highlights.filter((h) => h.label === "objective").length,
    method: highlights.filter((h) => h.label === "method").length,
    result: highlights.filter((h) => h.label === "result").length,
  }

  // ✅ ADD: Annotation hook for user text highlighting
  const { 
    annotations, 
    annotationCount, 
    annotationPluginInstance, 
    clearAllAnnotations 
  } = useAnnotation()

  const currentPageRef = useRef(1)
  const pageLabelRef = useRef<HTMLSpanElement>(null)
  const zoomRef = useRef(1)
  const zoomLabelRef = useRef<HTMLSpanElement>(null)
  const pendingPageNavigation = useRef<number | null>(null)

  // 🔑 CREATE PLUGIN INSTANCES USING useRef - This prevents recreation
  const pageNavigationPluginInstance = useRef(pageNavigationPlugin()).current
  const zoomPluginInstance = useRef(zoomPlugin()).current
  const thumbnailPluginInstance = useRef(thumbnailPlugin()).current
  const bookmarkPluginInstance = useRef(bookmarkPlugin()).current
  const searchPluginInstance = useRef(searchPlugin({
    keyword: '',
  })).current

  // 🔑 CITATION PLUGIN - Call hook at top level
  const citationPluginInstance = useCitationPlugin({
    pdfUrl: pdfUrl,
    extractedCitations: extractedCitations,
    onCitationClick: onReferenceClick ? (citation, event) => {
      // Call the reference click handler with the citation ID
      event.preventDefault()
      event.stopPropagation()
      onReferenceClick(citation.id)
    } : undefined,
  });

  // 🔑 HIGHLIGHT PLUGIN - Call hook at top level
  // Only show highlights that are both active (clicked in sidebar) and not hidden
  const visibleHighlights = highlights.filter(
    h => activeHighlightIds.has(h.id) && !hiddenHighlightIds.has(h.id)
  )

  // Debug logging
  useEffect(() => {
    console.log(`[PDFViewer] Highlights state:`, {
      total: highlights.length,
      active: activeHighlightIds.size,
      hidden: hiddenHighlightIds.size,
      visible: visibleHighlights.length,
      visibleCategories: Array.from(visibleCategories),
    })
    if (visibleHighlights.length > 0) {
      console.log(`[PDFViewer] Visible highlights:`, visibleHighlights.map(h => ({
        id: h.id,
        label: h.label,
        page: h.boxes[0]?.page + 1,
      })))
    }
  }, [highlights.length, activeHighlightIds.size, hiddenHighlightIds.size, visibleHighlights.length, visibleCategories])

  const highlightPluginInstance = usePDFHighlightPlugin({
    highlights: visibleHighlights,
    visibleCategories,
    onHighlightClick: (h) => console.log("Clicked highlight:", h.text),
  });

  // 🔑 CREATE PLUGINS ARRAY - Use useRef to keep it stable
  const pluginsRef = useRef([
    pageNavigationPluginInstance,
    zoomPluginInstance,
    thumbnailPluginInstance,
    bookmarkPluginInstance,
    searchPluginInstance,
  ])

  // ✅ MODIFY: Add citation, highlight, and annotation plugins dynamically
  const plugins = [
    ...pluginsRef.current,
    citationPluginInstance,
    highlightPluginInstance,
    annotationPluginInstance // ✅ ADD: Always include annotation plugin
  ]

  const { jumpToNextPage, jumpToPreviousPage, jumpToPage } = pageNavigationPluginInstance
  const { zoomTo } = zoomPluginInstance
  const { highlight, clearHighlights } = searchPluginInstance

  // Convert file to blob URL and extract citations
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);

      // Extract citations when file is loaded
      extractCitations(file).then((result) => {
        if (result) {
          console.log("[PDFViewer] Extracted", result.totalCitations, "citations")
          setExtractedCitations(result.citations)
        }
      })

      return () => URL.revokeObjectURL(url);
    }
  }, [file, extractCitations])

  // Handle navigation target changes
  useEffect(() => {
    if (navigationTarget) {
      console.log("[PDFViewer] Navigating to page:", navigationTarget.page, "yPosition:", navigationTarget.yPosition, "text:", navigationTarget.highlightText?.substring(0, 30))

      // Update current page ref
      currentPageRef.current = navigationTarget.page

      // Update page label in UI
      if (pageLabelRef.current) {
        pageLabelRef.current.textContent = String(navigationTarget.page)
      }

      // Notify parent of page change
      onPageChange?.(navigationTarget.page)

      // Handle different navigation types
      if (navigationTarget.highlightId !== undefined) {
        // For highlight navigation: Jump to page first, then scroll to element
        jumpToPage(navigationTarget.page - 1)

        // Wait for page to load, then scroll to the highlight element
        setTimeout(() => {
          const highlightElement = document.querySelector(`[data-highlight-id="${navigationTarget.highlightId}"]`) as HTMLElement

          if (highlightElement) {
            console.log("[PDFViewer] Found highlight element, scrolling into view")
            highlightElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            })

            // Add a pulse animation to make it obvious which highlight was clicked
            setTimeout(() => {
              highlightElement.style.animation = 'highlight-pulse 1s ease-in-out'
              setTimeout(() => {
                highlightElement.style.animation = ''
              }, 1000)
            }, 500) // Increased delay to wait for scroll to complete
          } else {
            console.warn("[PDFViewer] Highlight element not found")
          }
        }, 600) // Longer wait for page render and highlights
      } else if (navigationTarget.highlightText) {
        // For citation navigation: Jump to page and search for text
        jumpToPage(navigationTarget.page - 1)
        clearHighlights()

        // Wait for page to load, then highlight with multiple strategies
        setTimeout(() => {
          // Clean up text: normalize whitespace, remove extra formatting
          const fullText = navigationTarget.highlightText!
            .trim()
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/[""]/g, '"') // Normalize quotes
            .replace(/['']/g, "'") // Normalize apostrophes

          console.log("[PDFViewer] Attempting to highlight text:", fullText.substring(0, 100))

          // Strategy 1: Try highlighting first meaningful sentence (up to 150 chars)
          const firstSentence = fullText.split(/[.!?]/)[0].trim()
          const shortText = firstSentence.length > 150 ? firstSentence.substring(0, 150) : firstSentence

          if (shortText.length > 10) {
            console.log("[PDFViewer] Highlighting with first sentence:", shortText)
            highlight(shortText)
          }

          // Strategy 2: If first strategy might fail, also try with first 10-15 words as backup
          setTimeout(() => {
            const words = fullText.split(/\s+/).filter(w => w.length > 0)
            const keyPhrase = words.slice(0, Math.min(15, words.length)).join(' ')

            if (keyPhrase.length > 20 && keyPhrase !== shortText) {
              console.log("[PDFViewer] Also trying key phrase:", keyPhrase.substring(0, 80))
              highlight(keyPhrase)
            }
          }, 100)

          // Strategy 3: Try even shorter phrase (first 8 words) for difficult cases
          setTimeout(() => {
            const words = fullText.split(/\s+/).filter(w => w.length > 0)
            const veryShortPhrase = words.slice(0, Math.min(8, words.length)).join(' ')

            if (veryShortPhrase.length > 15) {
              console.log("[PDFViewer] Also trying very short phrase:", veryShortPhrase)
              highlight(veryShortPhrase)
            }
          }, 200)
        }, 500)
      } else if (navigationTarget.yPosition > 0) {
        // For position-based navigation: Jump to page and scroll to position
        jumpToPage(navigationTarget.page - 1)

        setTimeout(() => {
          const pageElements = document.querySelectorAll('.rpv-core__page-layer')
          const targetPageElement = pageElements[navigationTarget.page - 1] as HTMLElement

          if (targetPageElement) {
            const pageRect = targetPageElement.getBoundingClientRect()
            const pageHeight = pageRect.height
            const scrollTop = targetPageElement.offsetTop + (navigationTarget.yPosition * pageHeight)

            const viewerContainer = document.querySelector('.rpv-core__inner-pages')
            if (viewerContainer) {
              viewerContainer.scrollTo({
                top: scrollTop - 100,
                behavior: 'smooth'
              })
              console.log("[PDFViewer] Scrolled to position:", scrollTop, "on page", navigationTarget.page)
            }
          }
        }, 400)
      } else {
        // Just jump to page
        jumpToPage(navigationTarget.page - 1)
        clearHighlights()
      }

      // Clear navigation target after a short delay to allow jump to complete
      setTimeout(() => {
        onNavigationComplete?.()
      }, 100)
    }
  }, [navigationTarget, jumpToPage, onPageChange, onNavigationComplete, highlight, clearHighlights])

  // Execute pending navigation when switching to reading mode
  useEffect(() => {
    if (viewMode === "reading" && pendingPageNavigation.current !== null) {
      const targetPage = pendingPageNavigation.current
      console.log("[PDFViewer] Executing pending navigation to page:", targetPage)

      // Small delay to ensure PDF viewer is fully rendered
      setTimeout(() => {
        currentPageRef.current = targetPage
        if (pageLabelRef.current) {
          pageLabelRef.current.textContent = String(targetPage)
        }
        jumpToPage(targetPage - 1)
        onPageChange?.(targetPage)
        pendingPageNavigation.current = null
      }, 100)
    }
  }, [viewMode, jumpToPage, onPageChange])

  // Handle page navigation from skimming mode
  const handleNavigateToPage = (page: number) => {
    console.log("[PDFViewer] Requested jump to page:", page)
    pendingPageNavigation.current = page
  }

  // Toggle view mode
  const toggleViewMode = () => {
    setViewMode((prev) => (prev === "reading" ? "skimming" : "reading"))
  }

  // 🔍 Zoom controls without re-render
  const handleZoomIn = () => {
    const newScale = Math.min(2, zoomRef.current + 0.1)
    zoomRef.current = newScale
    zoomTo(newScale)
    requestAnimationFrame(() => {
      if (zoomLabelRef.current)
        zoomLabelRef.current.textContent = `${Math.round(newScale * 100)}%`
    })
  }

  const handleZoomOut = () => {
    const newScale = Math.max(0.5, zoomRef.current - 0.1)
    zoomRef.current = newScale
    zoomTo(newScale)
    requestAnimationFrame(() => {
      if (zoomLabelRef.current)
        zoomLabelRef.current.textContent = `${Math.round(newScale * 100)}%`
    })
  }

  const handlePageChangeInternal = (e: any) => {
    const newPage = e.currentPage + 1
    currentPageRef.current = newPage
    
    // Update UI
    requestAnimationFrame(() => {
      if (pageLabelRef.current) {
        pageLabelRef.current.textContent = String(newPage)
      }
    })

    // Notify parent
    onPageChange?.(newPage)
  }

  return (
    <div className="pdf-viewer-container flex flex-1 h-full bg-muted/30 min-h-0">
      {/* Sidebar - Only show in reading mode */}
      {viewMode === "reading" && (
        <div
          className={cn(
            "pdf-sidebar-container relative bg-background border-r border-border transition-all duration-300 ease-in-out flex-shrink-0",
            sidebarOpen ? "w-80" : "w-0 overflow-hidden"
          )}
        >
          {sidebarOpen && (
            <PDFSidebar
              pdfUrl={pdfUrl}
              numPages={numPages}
              bookmarkPluginInstance={bookmarkPluginInstance}
              thumbnailPluginInstance={thumbnailPluginInstance}
              onClose={() => setSidebarOpen(false)}
              onSectionSelect={onSectionSelect}
            />
          )}
        </div>
      )}

      {/* Main viewer area */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        {/* Skimming Controls - Show when highlights are loaded */}
        {viewMode === "reading" && highlights.length > 0 && (
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
                prev.size === 3 ? new Set() : new Set(["objective", "method", "result"])
              )
            }}
            highlightCounts={highlightCounts}
          />
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
          {/* Page + Section Controls */}
          <div className="flex items-center gap-2">
            {viewMode === "reading" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="h-7 w-7"
                >
                  <Sidebar className="h-4 w-4" />
                </Button>

                <div className="w-px h-4 bg-border mx-1" />
              </>
            )}

            {viewMode === "reading" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (currentPageRef.current > 1) jumpToPreviousPage()
                  }}
                  className="h-7 w-7"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <span className="font-mono text-sm text-foreground">
                  <span ref={pageLabelRef}>1</span>{" "}
                  <span className="text-muted-foreground">/ {numPages || "?"}</span>
                </span>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (currentPageRef.current < numPages) jumpToNextPage()
                  }}
                  className="h-7 w-7"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                {selectedSection && (
                  <>
                    <div className="w-px h-4 bg-border mx-2" />
                    <div className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-md">
                      {selectedSection}
                    </div>
                  </>
                )}
              </>
            )}

            {/* View Mode Toggle */}
            <div className="w-px h-4 bg-border mx-1" />
            <Button
              variant={viewMode === "skimming" ? "default" : "ghost"}
              size="sm"
              onClick={toggleViewMode}
              className="gap-2 h-7"
            >
              {viewMode === "skimming" ? (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  <span className="text-xs">Skimming</span>
                </>
              ) : (
                <>
                  <FileText className="h-3.5 w-3.5" />
                  <span className="text-xs">Reading</span>
                </>
              )}
            </Button>

            {/* ✅ ADD: User Annotations Info - Show when there are annotations */}
            {annotationCount > 0 && (
              <>
                <div className="w-px h-4 bg-border mx-1" />
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-md flex items-center gap-1">
                    <Highlighter className="h-3 w-3" />
                    <span>{annotationCount} annotation{annotationCount !== 1 ? 's' : ''}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllAnnotations}
                    className="h-7 px-2 text-xs text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Zoom Controls - Only in reading mode */}
          {viewMode === "reading" && (
            <div className="flex items-center gap-2">
              {/* ✅ ADD: Helper text for annotations */}
              {annotationCount === 0 && (
                <div className="text-xs text-muted-foreground mr-2">
                  Select text to highlight
                </div>
              )}
              
              <Button
                variant="ghost"
                size="icon"
                onClick={handleZoomOut}
                disabled={zoomRef.current <= 0.5}
                className="h-7 w-7"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>

              <span
                ref={zoomLabelRef}
                className="min-w-[3rem] text-center font-mono text-sm text-muted-foreground"
              >
                100%
              </span>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleZoomIn}
                disabled={zoomRef.current >= 2}
                className="h-7 w-7"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>

              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Content Area - Conditional Rendering */}
        <div className="flex-1 overflow-hidden bg-muted/30">
          {viewMode === "reading" ? (
            <div className="h-full p-4">
              {pdfUrl && (
                <div className="h-full mx-auto max-w-4xl">
                  <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                    <div className="bg-white shadow-lg rounded-lg overflow-hidden h-full">
                      <Viewer
                        fileUrl={pdfUrl}
                        plugins={plugins}
                        onDocumentLoad={(e) => {
                          setNumPages(e.doc.numPages)
                          currentPageRef.current = 1
                          zoomRef.current = 1
                          if (pageLabelRef.current) pageLabelRef.current.textContent = "1"
                          if (zoomLabelRef.current) zoomLabelRef.current.textContent = "100%"

                          // Notify parent of page count
                          onDocumentLoad?.(e.doc.numPages)

                          // Extract bookmarks for skimming mode
                          e.doc.getOutline().then((outline) => {
                            if (outline) {
                              setBookmarks(outline)
                            }
                          })
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
  );
}