"use client";

import { useState, useEffect, useRef } from "react"
import { Viewer, Worker } from "@react-pdf-viewer/core"
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation"
import { zoomPlugin } from "@react-pdf-viewer/zoom"
import { thumbnailPlugin } from "@react-pdf-viewer/thumbnail"
import { bookmarkPlugin } from "@react-pdf-viewer/bookmark"
import { useCitationPlugin } from "@/hooks/useCitatioPlugin";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Sidebar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PDFSidebar } from "./pdf-sidebar"

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
  onCitationClick?: (citation: any, event: MouseEvent) => void
}

export function PDFViewer({
  file,
  selectedSection,
  navigationTarget,
  onPageChange,
  onSectionSelect,
  onCitationClick,
}: PDFViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string>("")
  const [numPages, setNumPages] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const currentPageRef = useRef(1)
  const pageLabelRef = useRef<HTMLSpanElement>(null)
  const zoomRef = useRef(1)
  const zoomLabelRef = useRef<HTMLSpanElement>(null)

  const pageNavigationPluginInstance = pageNavigationPlugin()
  const zoomPluginInstance = zoomPlugin()
  const thumbnailPluginInstance = thumbnailPlugin()
  const bookmarkPluginInstance = bookmarkPlugin()
  const citationPluginInstance = useCitationPlugin({
    onCitationClick: onCitationClick,
    pdfUrl: pdfUrl,
  });

  const { jumpToNextPage, jumpToPreviousPage } = pageNavigationPluginInstance
  const { zoomTo } = zoomPluginInstance

  // Convert file to blob URL
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file])

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

  return (
    <div className="pdf-viewer-container flex flex-1 h-full bg-muted/30 min-h-0">
      {/* Sidebar */}
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

      {/* Main viewer area */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
          {/* Page + Section Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-7 w-7"
            >
              <Sidebar className="h-4 w-4" />
            </Button>

            <div className="w-px h-4 bg-border mx-1" />

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
          </div>

          {/* Zoom Controls (no state) */}
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
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 overflow-hidden p-4 bg-muted/30">
          {pdfUrl && (
            <div className="h-full mx-auto max-w-4xl">
              <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                <div className="bg-white shadow-lg rounded-lg overflow-hidden h-full">
                  <Viewer
                    fileUrl={pdfUrl}
                    plugins={[
                      pageNavigationPluginInstance,
                      zoomPluginInstance,
                      thumbnailPluginInstance,
                      bookmarkPluginInstance,
                      citationPluginInstance
                    ]}
                    onDocumentLoad={(e) => {
                      setNumPages(e.doc.numPages)
                      currentPageRef.current = 1
                      zoomRef.current = 1
                      if (pageLabelRef.current) pageLabelRef.current.textContent = "1"
                      if (zoomLabelRef.current) zoomLabelRef.current.textContent = "100%"
                    }}
                    onPageChange={(e) => {
                      const newPage = e.currentPage + 1
                      currentPageRef.current = newPage
                      requestAnimationFrame(() => {
                        if (pageLabelRef.current)
                          pageLabelRef.current.textContent = String(newPage)
                      })
                    }}
                  />
                </div>
              </Worker>
            </div>
          )}
        </div>
      </div>


    </div>
  );
}
