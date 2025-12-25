"use client";

import { useState, useEffect, useRef, useCallback } from "react"
import { Viewer, Worker } from "@react-pdf-viewer/core"
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation"
import { zoomPlugin } from "@react-pdf-viewer/zoom"
import { thumbnailPlugin } from "@react-pdf-viewer/thumbnail"
import { bookmarkPlugin } from "@react-pdf-viewer/bookmark"
import { searchPlugin } from "@react-pdf-viewer/search"
import { useAnnotations, type PageAnnotations } from "@/hooks/useAnnotations"
import { useCitationAnnotationPlugin } from "@/hooks/useCitationAnnotationPlugin"
import type { Annotation } from "@/hooks/useAnnotations"
import { useSkimmingHighlights } from "@/hooks/useSkimmingHighlights"
import { usePDFHighlightPlugin } from "@/hooks/usePDFHighlightPlugin"
import { useAnnotation } from "@/hooks/useAnnotation"
import { useTextSelectionPopup } from "@/hooks/useTextSelectionPopup"
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"
import { CitationPopup } from "@/components/citation-popup"
import { KeywordPopup } from "@/components/keyword-popup"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Sidebar, Highlighter, Trash2, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PDFSidebar } from "./pdf-sidebar"
import { SkimmingView } from "./skimming-view"
import { SkimmingControls } from "./skimming-controls"
import { useToast } from "@/hooks/use-toast"

import "@react-pdf-viewer/core/lib/styles/index.css"
import "@react-pdf-viewer/page-navigation/lib/styles/index.css"
import "@react-pdf-viewer/zoom/lib/styles/index.css"
import "@react-pdf-viewer/thumbnail/lib/styles/index.css"
import "@react-pdf-viewer/bookmark/lib/styles/index.css"
import "@react-pdf-viewer/highlight/lib/styles/index.css"
import "@react-pdf-viewer/search/lib/styles/index.css"
import "@/styles/pdf-components.css"

interface PDFViewerProps {
  file: File
  documentId: string
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
  enableInteractions?: boolean
}

export function PDFViewer({
  file,
  documentId,
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
  enableInteractions = true,
}: PDFViewerProps) {
  const { toast } = useToast()
  const [pdfUrl, setPdfUrl] = useState<string>("")
  const [numPages, setNumPages] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"reading" | "skimming">("reading")
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    new Set(["objective", "method", "result"])
  )

  // Citation popup state
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })

  // Annotations hook
  const { 
    annotations, 
    isLoading: annotationsLoading, 
    extractAnnotations 
  } = useAnnotations()
  
  // Store annotations in a ref
  const annotationsRef = useRef<PageAnnotations[]>([])
  
  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  // Highlight counts
  const highlightCounts = {
    objective: highlights.filter((h) => h.label === "objective").length,
    method: highlights.filter((h) => h.label === "method").length,
    result: highlights.filter((h) => h.label === "result").length,
  }

  // User annotation hook
  const { 
    annotations: userAnnotations, 
    annotationCount, 
    annotationPluginInstance, 
    clearAllAnnotations 
  } = useAnnotation()

  // Text selection popup hook
  const {
    popupState,
    handleTextSelection,
    handleNodeClick,
    closePopup,
    isEnabled: popupEnabled,
    setEnabled: setPopupEnabled
  } = useTextSelectionPopup()

  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const currentPageRef = useRef(1)
  const pageLabelRef = useRef<HTMLSpanElement>(null)
  const zoomRef = useRef(1)
  const zoomLabelRef = useRef<HTMLSpanElement>(null)
  const pendingPageNavigation = useRef<number | null>(null)

  // Plugin instances (static)
  const pageNavigationPluginInstance = useRef(pageNavigationPlugin()).current
  const zoomPluginInstance = useRef(zoomPlugin()).current
  const thumbnailPluginInstance = useRef(thumbnailPlugin()).current
  const bookmarkPluginInstance = useRef(bookmarkPlugin()).current
  const searchPluginInstance = useRef(searchPlugin({ keyword: "" })).current

  // Citation annotation plugin
  const citationAnnotationPluginInstance = useCitationAnnotationPlugin({
    annotationsRef: annotationsRef,
    onAnnotationClick: enableInteractions ? (annotation, event) => {
      setSelectedAnnotation(annotation)
      setPopupPosition({ x: event.clientX, y: event.clientY })
    } : undefined,
  })

  // Highlight plugin
  const visibleHighlights = enableInteractions 
    ? highlights.filter((h) => activeHighlightIds.has(h.id) && !hiddenHighlightIds.has(h.id))
    : []

  const highlightPluginInstance = usePDFHighlightPlugin({
    highlights: visibleHighlights,
    visibleCategories,
    onHighlightClick: enableInteractions 
      ? (h) => console.log("Clicked highlight:", h.text)
      : undefined,
  })

  // Build plugins array
  const plugins = enableInteractions 
    ? [
        pageNavigationPluginInstance,
        zoomPluginInstance,
        thumbnailPluginInstance,
        bookmarkPluginInstance,
        searchPluginInstance,
        citationAnnotationPluginInstance,
        highlightPluginInstance,
        annotationPluginInstance
      ]
    : [
        pageNavigationPluginInstance,
        zoomPluginInstance,
        thumbnailPluginInstance,
        bookmarkPluginInstance,
        searchPluginInstance,
      ]

  const { jumpToNextPage, jumpToPreviousPage, jumpToPage } = pageNavigationPluginInstance
  const { zoomTo } = zoomPluginInstance
  const { highlight, clearHighlights } = searchPluginInstance

  // Extract annotations when file loads - FIXED: Minimal dependencies
  useEffect(() => {
    if (file && documentId) {
      const url = URL.createObjectURL(file)
      setPdfUrl(url)

      // Only extract citations in library mode
      if (enableInteractions) {
        extractAnnotations(file, documentId)
          .then(() => {
            console.log("[PDFViewer] Successfully extracted annotations")
          })
          .catch((error) => {
            console.error("[PDFViewer] Failed to extract annotations:", error)
            toast({
              title: "Failed to load citations",
              description: error.message,
              variant: "destructive",
            })
          })
      }

      return () => URL.revokeObjectURL(url)
    }
    // ✅ FIXED: Only depend on file, documentId, and enableInteractions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, documentId, enableInteractions])

  // Handle citation popup actions
  const handleCopyText = useCallback((text: string) => {
    if (!enableInteractions) return
    
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied to clipboard",
      description: text.length > 50 ? text.substring(0, 50) + "..." : text,
    })
  }, [enableInteractions, toast])

  const handleViewReference = useCallback((annotation: Annotation) => {
    if (!enableInteractions) return
    
    if (annotation.target) {
      jumpToPage(annotation.target.page - 1)
      setSelectedAnnotation(null)

      setTimeout(() => {
        const pageElements = document.querySelectorAll('.rpv-core__page-layer')
        const targetPageElement = pageElements[annotation.target!.page - 1] as HTMLElement

        if (targetPageElement) {
          const pageRect = targetPageElement.getBoundingClientRect()
          const scrollTop = targetPageElement.offsetTop + (annotation.target!.y * pageRect.height)

          const viewerContainer = document.querySelector('.rpv-core__inner-pages')
          if (viewerContainer) {
            viewerContainer.scrollTo({
              top: scrollTop - 100,
              behavior: 'smooth'
            })
          }
        }
      }, 400)
    }
  }, [enableInteractions, jumpToPage])

  // Handle navigation target changes
  useEffect(() => {
    if (navigationTarget) {
      console.log("[PDFViewer] Navigating to page:", navigationTarget.page)
      currentPageRef.current = navigationTarget.page

      if (pageLabelRef.current) {
        pageLabelRef.current.textContent = String(navigationTarget.page)
      }

      onPageChange?.(navigationTarget.page)

      if (navigationTarget.highlightId !== undefined && enableInteractions) {
        jumpToPage(navigationTarget.page - 1)
        setTimeout(() => {
          const highlightElement = document.querySelector(`[data-highlight-id="${navigationTarget.highlightId}"]`) as HTMLElement
          if (highlightElement) {
            highlightElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 600)
      } else if (navigationTarget.highlightText && enableInteractions) {
        jumpToPage(navigationTarget.page - 1)
        clearHighlights()
        setTimeout(() => {
          const text = navigationTarget.highlightText!.trim().replace(/\s+/g, ' ')
          const shortText = text.split(/[.!?]/)[0].trim()
          if (shortText.length > 10) {
            highlight(shortText)
          }
        }, 500)
      } else {
        jumpToPage(navigationTarget.page - 1)
        if (enableInteractions) {
          clearHighlights()
        }
      }

      setTimeout(() => {
        onNavigationComplete?.()
      }, 100)
    }
  }, [navigationTarget, jumpToPage, onPageChange, onNavigationComplete, highlight, clearHighlights, enableInteractions])

  const handlePageChangeInternal = (e: any) => {
    const newPage = e.currentPage + 1
    currentPageRef.current = newPage
    
    requestAnimationFrame(() => {
      if (pageLabelRef.current) {
        pageLabelRef.current.textContent = String(newPage)
      }
    })

    onPageChange?.(newPage)
  }

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

  const handleNavigateToPage = useCallback((page: number) => {
    pendingPageNavigation.current = page
  }, [])

  return (
    <>
      <div className="pdf-viewer-container flex flex-1 h-full bg-muted/30 min-h-0">
        {/* Sidebar - Only in library mode */}
        {viewMode === "reading" && enableInteractions && (
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

        {/* Main viewer */}
        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          {/* Skimming Controls - Only in library mode */}
          {viewMode === "reading" && enableInteractions && highlights.length > 0 && (
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
            <div className="flex items-center gap-2">
              {viewMode === "reading" && (
                <>
                  {/* Sidebar toggle - Only in library mode */}
                  {enableInteractions && (
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
                  
                  {/* Page navigation */}
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
                </>
              )}

              {/* Citations loading indicator - Only in library mode */}
              {enableInteractions && annotationsLoading && (
                <>
                  <div className="w-px h-4 bg-border mx-1" />
                  <div className="text-xs text-muted-foreground">
                    Loading citations...
                  </div>
                </>
              )}

              {/* User annotations - Only in library mode */}
              {enableInteractions && annotationCount > 0 && (
                <>
                  <div className="w-px h-4 bg-border mx-1" />
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-md flex items-center gap-1">
                      <Highlighter className="h-3 w-3" />
                      <span>{annotationCount} highlight{annotationCount !== 1 ? 's' : ''}</span>
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

              {/* Preview mode indicator */}
              {!enableInteractions && (
                <>
                  <div className="w-px h-4 bg-border mx-1" />
                  <div className="text-xs text-muted-foreground">
                    Preview Mode - Import to enable features
                  </div>
                </>
              )}
            </div>

            {/* Zoom Controls - Only in reading mode */}
            {viewMode === "reading" && (
              <div className="flex items-center gap-2">
                {enableInteractions && annotationCount === 0 && (
                  <div className="text-xs text-muted-foreground mr-2 flex items-center gap-2">
                    <BookOpen className="h-3 w-3" />
                    <span>Select text for definition</span>
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

          {/* Content */}
          <div className="flex-1 overflow-hidden bg-muted/30">
            {viewMode === "reading" ? (
              <div
                ref={pdfContainerRef}
                className="h-full p-4"
                onMouseUp={enableInteractions ? (e) => handleTextSelection(e.nativeEvent) : undefined}
              >
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
                            onDocumentLoad?.(e.doc.numPages)
                            e.doc.getOutline().then((outline) => {
                              if (outline) setBookmarks(outline)
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
              enableInteractions && (
                <SkimmingView
                  file={file}
                  numPages={numPages}
                  onNavigateToPage={handleNavigateToPage}
                  onExitSkimming={() => setViewMode("reading")}
                />
              )
            )}
          </div>
        </div>
      </div>

      {/* Citation Popup - Only in library mode */}
      {enableInteractions && (
        <CitationPopup
          annotation={selectedAnnotation}
          isOpen={!!selectedAnnotation}
          onClose={() => setSelectedAnnotation(null)}
          onCopyText={handleCopyText}
          onViewReference={handleViewReference}
          position={popupPosition}
        />
      )}

      {/* Keyword Definition Popup */}
      {enableInteractions && (
        <KeywordPopup
          isOpen={popupState.isOpen}
          keyword={popupState.keyword}
          context={popupState.context}
          concept={popupState.concept}
          siblings={popupState.siblings}
          descendants={popupState.descendants}
          loading={popupState.loading}
          error={popupState.error}
          onClose={closePopup}
          onNodeClick={handleNodeClick}
          position={popupState.position}
        />
      )}
    </>
  )
}