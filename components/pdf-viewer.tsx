"use client";

import { useState, useEffect, useRef } from "react"
import { Viewer, Worker } from "@react-pdf-viewer/core"
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation"
import { zoomPlugin } from "@react-pdf-viewer/zoom"
import { thumbnailPlugin } from "@react-pdf-viewer/thumbnail"
import { bookmarkPlugin } from "@react-pdf-viewer/bookmark"
import { useCitationPlugin } from "@/hooks/useCitatioPlugin"
import { useExtractCitations, type ExtractedCitation } from "@/hooks/useExtractCitations"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Sidebar, Eye, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PDFSidebar } from "./pdf-sidebar"
import { SkimmingView } from "./skimming-view"

import "@react-pdf-viewer/core/lib/styles/index.css"
import "@react-pdf-viewer/page-navigation/lib/styles/index.css"
import "@react-pdf-viewer/zoom/lib/styles/index.css"
import "@react-pdf-viewer/thumbnail/lib/styles/index.css"
import "@react-pdf-viewer/bookmark/lib/styles/index.css"
import "@/styles/pdf-components.css"

interface PDFViewerProps {
  file: File
  selectedSection?: string | null
  navigationTarget?: { page: number; yPosition: number } | undefined
  onPageChange?: (page: number) => void
  onSectionSelect?: (bookmark: any) => void
  isActive?: boolean
}

export function PDFViewer({
  file,
  selectedSection,
  navigationTarget,
  onPageChange,
  onSectionSelect,
  isActive,
}: PDFViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string>("")
  const [numPages, setNumPages] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [viewMode, setViewMode] = useState<"reading" | "skimming">("reading")
  const [bookmarks, setBookmarks] = useState<any[]>([])

  // Citation state - now managed in viewer
  const [extractedCitations, setExtractedCitations] = useState<ExtractedCitation[]>([])

  // Citation extraction hook
  const { extractCitations, getCitationById, loading: extracting, progress } = useExtractCitations()

  const currentPageRef = useRef(1)
  const pageLabelRef = useRef<HTMLSpanElement>(null)
  const zoomRef = useRef(1)
  const zoomLabelRef = useRef<HTMLSpanElement>(null)

  // 🔑 CREATE PLUGIN INSTANCES USING useRef - This prevents recreation
  const pageNavigationPluginInstance = useRef(pageNavigationPlugin()).current
  const zoomPluginInstance = useRef(zoomPlugin()).current
  const thumbnailPluginInstance = useRef(thumbnailPlugin()).current
  const bookmarkPluginInstance = useRef(bookmarkPlugin()).current
  
  // 🔑 CITATION PLUGIN - Call hook at top level
  const citationPluginInstance = useCitationPlugin({
    pdfUrl: pdfUrl,
    extractedCitations: extractedCitations,
  });

  // 🔑 CREATE PLUGINS ARRAY - Use useRef to keep it stable
  const pluginsRef = useRef([
    pageNavigationPluginInstance,
    zoomPluginInstance,
    thumbnailPluginInstance,
    bookmarkPluginInstance,
  ])

  // Add citation plugin dynamically when it changes
  const plugins = [...pluginsRef.current, citationPluginInstance]

  const { jumpToNextPage, jumpToPreviousPage } = pageNavigationPluginInstance
  const { zoomTo } = zoomPluginInstance

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
    if (navigationTarget && navigationTarget.page !== currentPageRef.current) {
      // TODO: Implement navigation to specific page
      console.log("[PDFViewer] Navigation target:", navigationTarget)
    }
  }, [navigationTarget])

  // Handle page navigation from skimming mode
  const handleNavigateToPage = (page: number) => {
    currentPageRef.current = page
    if (pageLabelRef.current) {
      pageLabelRef.current.textContent = String(page)
    }
    onPageChange?.(page)
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
          </div>

          {/* Zoom Controls - Only in reading mode */}
          {viewMode === "reading" && (
            <div className="flex items-center gap-2">
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