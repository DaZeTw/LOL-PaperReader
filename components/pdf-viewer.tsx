"use client"

import { useState, useEffect } from "react"
import { Viewer, Worker } from "@react-pdf-viewer/core"
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation"
import { zoomPlugin } from "@react-pdf-viewer/zoom"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import "@react-pdf-viewer/core/lib/styles/index.css"
import "@react-pdf-viewer/page-navigation/lib/styles/index.css"
import "@react-pdf-viewer/zoom/lib/styles/index.css"

interface PDFViewerProps {
  file: File
  selectedSection?: string | null
  highlightColor?: string
  annotationMode?: "highlight" | "erase" | null
  onCitationClick?: (citation: any) => void
}

export function PDFViewer({
  file,
  selectedSection,
  highlightColor = "#fef08a",
  annotationMode,
  onCitationClick,
}: PDFViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string>("")
  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1)

  // Initialize plugins - these use hooks internally so call them at top level
  const pageNavigationPluginInstance = pageNavigationPlugin()
  const { jumpToPage, jumpToNextPage, jumpToPreviousPage } = pageNavigationPluginInstance

  const zoomPluginInstance = zoomPlugin()
  const { zoomTo } = zoomPluginInstance

  // Convert File to URL for @react-pdf-viewer/core
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setPdfUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [file])

  // Reset page state when file changes
  useEffect(() => {
    setCurrentPage(1)
    setNumPages(0)
  }, [file])

  const handlePrevPage = () => {
    jumpToPreviousPage()
  }

  const handleNextPage = () => {
    jumpToNextPage()
  }

  const handleZoomIn = () => {
    const newScale = Math.min(2, scale + 0.1)
    setScale(newScale)
    zoomTo(newScale)
  }

  const handleZoomOut = () => {
    const newScale = Math.max(0.5, scale - 0.1)
    setScale(newScale)
    zoomTo(newScale)
  }

  return (
    <div className="flex flex-1 flex-col bg-muted/30">
      <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handlePrevPage} disabled={currentPage === 1} className="h-7 w-7">
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="font-mono text-sm text-foreground">
            {currentPage} <span className="text-muted-foreground">/ {numPages || "?"}</span>
          </span>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextPage}
            disabled={currentPage === numPages}
            className="h-7 w-7"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleZoomOut} disabled={scale <= 0.5} className="h-7 w-7">
            <ZoomOut className="h-4 w-4" />
          </Button>

          <span className="min-w-[3rem] text-center font-mono text-sm text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>

          <Button variant="ghost" size="icon" onClick={handleZoomIn} disabled={scale >= 2} className="h-7 w-7">
            <ZoomIn className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 bg-muted/30">
        {pdfUrl && (
          <div className="mx-auto max-w-4xl">
            <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
              <div className="bg-white shadow-lg rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
                <Viewer
                  fileUrl={pdfUrl}
                  plugins={[pageNavigationPluginInstance, zoomPluginInstance]}
                  onDocumentLoad={(e) => {
                    console.log('Document loaded:', e.doc.numPages, 'pages')
                    setNumPages(e.doc.numPages)
                    setCurrentPage(1)
                  }}
                  onPageChange={(e) => {
                    console.log('Page changed to:', e.currentPage + 1)
                    setCurrentPage(e.currentPage + 1)
                  }}
                />
              </div>
            </Worker>
          </div>
        )}
      </div>
    </div>
  )
}
