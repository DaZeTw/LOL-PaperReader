"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, createContext } from "react"
import { Viewer, Worker, SpecialZoomLevel } from "@react-pdf-viewer/core"
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation"
import { zoomPlugin } from "@react-pdf-viewer/zoom"
import { thumbnailPlugin } from "@react-pdf-viewer/thumbnail"
import { bookmarkPlugin } from "@react-pdf-viewer/bookmark"
import { searchPlugin } from "@react-pdf-viewer/search"
import { useAnnotations, type PageAnnotations } from "@/hooks/useAnnotations"
import { useCitationAnnotationPlugin } from "@/hooks/useCitationAnnotationPlugin"
import type { Annotation } from "@/hooks/useAnnotations"
import { usePDFHighlightPlugin } from "@/hooks/usePDFHighlightPlugin"
import { useAnnotation } from "@/hooks/useAnnotation"
import { useTextSelectionPopup } from "@/hooks/useTextSelectionPopup"
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"
import { CitationPopup } from "@/components/citation-popup"
import { KeywordPopup } from "@/components/keyword-popup"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Sidebar, BookOpen, Loader2 } from "lucide-react"
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

// --- 1. CONTEXT DEFINITION ---
export const CitationContext = createContext<{
  annotations: PageAnnotations[];
  isLoading: boolean;
}>({
  annotations: [],
  isLoading: false,
});

// --- 2. INNER VIEWER (FIREWALL) ---
const InnerViewer = React.memo(({
  fileUrl,
  plugins,
  onDocumentLoad,
  onPageChange,
  onZoom
}: any) => {
  return (
    <Viewer
      fileUrl={fileUrl}
      plugins={plugins}
      onDocumentLoad={onDocumentLoad}
      onPageChange={onPageChange}
      onZoom={onZoom}
      defaultScale={SpecialZoomLevel.PageWidth}
    />
  )
}, (prev, next) => {
  return prev.fileUrl === next.fileUrl && prev.plugins === next.plugins;
});

InnerViewer.displayName = 'InnerViewer';

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
  referenceStatus?: 'idle' | 'processing' | 'ready' | 'error'
  referenceCount?: number
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
  referenceStatus = 'idle',
  referenceCount = 0,
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

  // Cache for citation details
  const citationCacheDict = useRef<Map<string, any>>(new Map())
  const setCitationCacheDict = (key: string, value: any) => {
    citationCacheDict.current.set(key, value)
  }
  const getCitationCacheDict = (key: string) => {
    return citationCacheDict.current.get(key)
  }

  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })

  // Data Loading
  const {
    annotations,
    isLoading: annotationsLoading,
    extractAnnotations
  } = useAnnotations()

  // Refs for stability
  const annotationsRef = useRef<PageAnnotations[]>([])
  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  const {
    annotations: userAnnotations,
    annotationCount,
    annotationPluginInstance,
  } = useAnnotation()

  const {
    popupState,
    handleTextSelection,
    handleNodeClick,
    closePopup,
  } = useTextSelectionPopup()

  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const currentPageRef = useRef(1)
  const pageLabelRef = useRef<HTMLSpanElement>(null)
  const zoomRef = useRef(1)
  const zoomLabelRef = useRef<HTMLSpanElement>(null)
  const pendingPageNavigation = useRef<number | null>(null)
  const initialZoomAdjusted = useRef(false)

  // --- PLUGINS ---
  const pageNavigationPluginInstance = useRef(pageNavigationPlugin()).current
  const zoomPluginInstance = useRef(zoomPlugin({})).current
  const thumbnailPluginInstance = useRef(thumbnailPlugin()).current
  const bookmarkPluginInstance = useRef(bookmarkPlugin()).current
  const searchPluginInstance = useRef(searchPlugin({ keyword: "" })).current

  // 1. Citation Plugin (Stable)
  const citationAnnotationPluginInstance = useMemo(() => {
    return useCitationAnnotationPlugin({
      annotationsRef: annotationsRef,
      onAnnotationClick: enableInteractions ? (annotation, event) => {
        setSelectedAnnotation(annotation)
        setPopupPosition({ x: event.clientX, y: event.clientY })
      } : undefined,
    })
  }, [enableInteractions])

  // 2. Highlight Plugin (Corrected Stabilization Pattern)

  // A. Prepare Data
  const visibleHighlights = useMemo(() => {
    return enableInteractions
      ? highlights.filter((h) => activeHighlightIds.has(h.id) && !hiddenHighlightIds.has(h.id))
      : []
  }, [enableInteractions, highlights, activeHighlightIds, hiddenHighlightIds]);

  // B. Call Hook Top-Level (✅ CORRECT: Not inside useMemo)
  // This always returns a fresh object on every render
  const rawHighlightPluginInstance = usePDFHighlightPlugin({
    highlights: visibleHighlights,
    visibleCategories,
    onHighlightClick: enableInteractions ? (h) => console.log("Clicked highlight:", h.text) : undefined,
  })

  // C. Stabilize Instance
  // We use useMemo to cache the result. 
  // We intentionally omit 'rawHighlightPluginInstance' from deps so we only update 
  // when the DATA (visibleHighlights) changes.
  const highlightPluginInstance = useMemo(() => {
    return rawHighlightPluginInstance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableInteractions, visibleHighlights])

  // 3. Master Plugins Array (Frozen)
  const plugins = useMemo(() => {
    const basePlugins = [
      pageNavigationPluginInstance,
      zoomPluginInstance,
      thumbnailPluginInstance,
      bookmarkPluginInstance,
      searchPluginInstance,
    ]

    if (enableInteractions) {
      return [
        ...basePlugins,
        citationAnnotationPluginInstance,
        highlightPluginInstance,
        annotationPluginInstance
      ]
    }

    return basePlugins
  }, [
    enableInteractions,
    citationAnnotationPluginInstance,
    highlightPluginInstance,
    annotationPluginInstance,
    pageNavigationPluginInstance,
    zoomPluginInstance,
    thumbnailPluginInstance,
    bookmarkPluginInstance,
    searchPluginInstance,
  ])

  const { jumpToNextPage, jumpToPreviousPage, jumpToPage } = pageNavigationPluginInstance
  const { zoomTo } = zoomPluginInstance
  const { highlight, clearHighlights } = searchPluginInstance

  // Extract annotations on load
  useEffect(() => {
    if (file && documentId) {
      const url = URL.createObjectURL(file)
      setPdfUrl(url)
      initialZoomAdjusted.current = false // Reset for new file

      if (enableInteractions && referenceStatus === 'ready') {
        extractAnnotations(file, documentId)
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
  }, [file, documentId, enableInteractions, referenceStatus])

  // --- HANDLERS ---
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
            viewerContainer.scrollTo({ top: scrollTop - 100, behavior: 'smooth' })
          }
        }
      }, 400)
    }
  }, [enableInteractions, jumpToPage])

  const handlePageChangeInternal = useCallback((e: any) => {
    const newPage = e.currentPage + 1
    currentPageRef.current = newPage
    requestAnimationFrame(() => {
      if (pageLabelRef.current) pageLabelRef.current.textContent = String(newPage)
    })
    onPageChange?.(newPage)
  }, [onPageChange])

  const handleZoomInternal = useCallback((e: any) => {
    zoomRef.current = e.scale
    requestAnimationFrame(() => {
      if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(e.scale * 100)}%`
    })
    console.log("Current zoom level:", e.scale)

    // Initial 90% adjustment logic
    if (!initialZoomAdjusted.current && e.scale > 0) {
      initialZoomAdjusted.current = true
      const targetScale = e.scale * 0.9
      // Small timeout to ensure the viewer has finished its internal initial layout
      setTimeout(() => {
        zoomTo(targetScale)
      }, 100)
    }
  }, [zoomTo])

  const handleDocumentLoadInternal = useCallback((e: any) => {
    setNumPages(e.doc.numPages)
    currentPageRef.current = 1
    if (pageLabelRef.current) pageLabelRef.current.textContent = "1"
    onDocumentLoad?.(e.doc.numPages)
    e.doc.getOutline().then((outline: any) => {
      if (outline) setBookmarks(outline)
    })
  }, [onDocumentLoad])

  const handleZoomIn = () => {
    const newScale = Math.min(2, zoomRef.current + 0.1)
    zoomTo(newScale)
  }

  const handleZoomOut = () => {
    const newScale = Math.max(0.5, zoomRef.current - 0.1)
    zoomTo(newScale)
  }

  const handleNavigateToPage = useCallback((page: number) => {
    pendingPageNavigation.current = page
  }, [])

  // Navigation Logic
  useEffect(() => {
    if (navigationTarget) {
      currentPageRef.current = navigationTarget.page
      if (pageLabelRef.current) pageLabelRef.current.textContent = String(navigationTarget.page)
      onPageChange?.(navigationTarget.page)

      if (navigationTarget.highlightId !== undefined && enableInteractions) {
        jumpToPage(navigationTarget.page - 1)
        setTimeout(() => {
          const el = document.querySelector(`[data-highlight-id="${navigationTarget.highlightId}"]`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 600)
      } else if (navigationTarget.highlightText && enableInteractions) {
        jumpToPage(navigationTarget.page - 1)
        clearHighlights()
        setTimeout(() => {
          const text = navigationTarget.highlightText!.trim().replace(/\s+/g, ' ').split(/[.!?]/)[0].trim()
          if (text.length > 10) highlight(text)
        }, 500)
      } else {
        jumpToPage(navigationTarget.page - 1)
        if (enableInteractions) clearHighlights()
      }
      setTimeout(() => onNavigationComplete?.(), 100)
    }
  }, [navigationTarget, jumpToPage, onPageChange, onNavigationComplete, highlight, clearHighlights, enableInteractions])

  return (
    <CitationContext.Provider value={{ annotations, isLoading: annotationsLoading }}>
      <div className="pdf-viewer-container flex flex-1 h-full bg-muted/30 min-h-0">
        {/* Sidebar */}
        {viewMode === "reading" && enableInteractions && (
          <div className={cn("pdf-sidebar-container relative bg-background border-r border-border transition-all duration-300 ease-in-out flex-shrink-0", sidebarOpen ? "w-80" : "w-0 overflow-hidden")}>
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

        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          {/* Controls */}
          {viewMode === "reading" && enableInteractions && highlights.length > 0 && (
            <SkimmingControls
              visibleCategories={visibleCategories}
              onToggleCategory={(category) => setVisibleCategories((prev) => {
                const next = new Set(prev); next.has(category) ? next.delete(category) : next.add(category); return next;
              })}
              onToggleAll={() => setVisibleCategories((prev) => prev.size === 3 ? new Set() : new Set(["objective", "method", "result"]))}
              highlightCounts={{
                objective: highlights.filter((h) => h.label === "objective").length,
                method: highlights.filter((h) => h.label === "method").length,
                result: highlights.filter((h) => h.label === "result").length,
              }}
            />
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
            <div className="flex items-center gap-2">
              {viewMode === "reading" && (
                <>
                  {enableInteractions && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="h-7 w-7">
                        <Sidebar className="h-4 w-4" />
                      </Button>
                      <div className="w-px h-4 bg-border mx-1" />
                    </>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => currentPageRef.current > 1 && jumpToPreviousPage()} className="h-7 w-7">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-mono text-sm text-foreground">
                    <span ref={pageLabelRef}>1</span> <span className="text-muted-foreground">/ {numPages || "?"}</span>
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => currentPageRef.current < numPages && jumpToNextPage()} className="h-7 w-7">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}

              {/* STATUS INDICATORS */}
              {enableInteractions && (
                <div className="flex items-center gap-2 ml-4 px-2 py-1 bg-muted/40 rounded-md">
                  {referenceStatus === 'processing' && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Processing...</span>
                    </div>
                  )}
                  {annotationsLoading && referenceStatus === 'ready' && (
                    <div className="flex items-center gap-2 text-xs text-blue-600 font-medium">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Fetching Citations...</span>
                    </div>
                  )}
                  {!annotationsLoading && annotations.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-green-600 font-medium">
                      <span>{annotations.reduce((sum, p) => sum + p.annotations.length, 0)} Citations</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Zoom Controls */}
            {viewMode === "reading" && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={handleZoomOut} disabled={zoomRef.current <= 0.5} className="h-7 w-7"><ZoomOut className="h-4 w-4" /></Button>
                <span ref={zoomLabelRef} className="min-w-[3rem] text-center font-mono text-sm text-muted-foreground">100%</span>
                <Button variant="ghost" size="icon" onClick={handleZoomIn} disabled={zoomRef.current >= 2} className="h-7 w-7"><ZoomIn className="h-4 w-4" /></Button>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden bg-muted/30">
            {viewMode === "reading" ? (
              <div ref={pdfContainerRef} className="h-full" onMouseUp={enableInteractions ? (e) => handleTextSelection(e.nativeEvent) : undefined}>
                {pdfUrl && (
                  <div className="h-full mx-auto max-w-6xl">
                    <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                      <div className="bg-white shadow-lg rounded-lg overflow-hidden h-full">
                        <div className="
                          bg-white shadow-lg rounded-lg overflow-hidden h-full
                          px-[clamp(2px,4%,10px)]
                          py-[clamp(4px,2%,12px)]
                        "> {/* ⚡️ USING INNER VIEWER (FIREWALL) */}
                          <InnerViewer
                            fileUrl={pdfUrl}
                            plugins={plugins}
                            onDocumentLoad={handleDocumentLoadInternal}
                            onPageChange={handlePageChangeInternal}
                            onZoom={handleZoomInternal}
                          />
                        </div>
                      </div>
                    </Worker>
                  </div>
                )}
              </div>
            ) : (
              enableInteractions && <SkimmingView file={file} numPages={numPages} onNavigateToPage={handleNavigateToPage} onExitSkimming={() => setViewMode("reading")} />
            )}
          </div>
        </div>
      </div>

      {/* Popups */}
      {enableInteractions && (
        <>
          <CitationPopup
            annotation={selectedAnnotation}
            isOpen={!!selectedAnnotation}
            onClose={() => setSelectedAnnotation(null)}
            onCopyText={handleCopyText}
            onViewReference={handleViewReference}
            position={popupPosition}
            citationCache={{
              set: setCitationCacheDict,
              get: getCitationCacheDict
            }}
          />
          <KeywordPopup isOpen={popupState.isOpen} keyword={popupState.keyword} context={popupState.context} concept={popupState.concept} siblings={popupState.siblings} descendants={popupState.descendants} loading={popupState.loading} error={popupState.error} onClose={closePopup} onNodeClick={handleNodeClick} position={popupState.position} />
        </>
      )}
    </CitationContext.Provider>
  )
}