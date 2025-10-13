"use client"

import { useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
// import "react-pdf/dist/esm/Page/AnnotationLayer.css"
// import "react-pdf/dist/esm/Page/TextLayer.css"

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

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
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [pdfUrl, setPdfUrl] = useState<string>("")

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setCurrentPage(1)
  }

  // Convert File to URL for react-pdf
  useState(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setPdfUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  })

  const handlePrevPage = () => setCurrentPage((prev) => Math.max(1, prev - 1))
  const handleNextPage = () => setCurrentPage((prev) => Math.min(numPages, prev + 1))
  const handleZoomIn = () => setZoom((prev) => Math.min(2, prev + 0.1))
  const handleZoomOut = () => setZoom((prev) => Math.max(0.5, prev - 0.1))

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
          <Button variant="ghost" size="icon" onClick={handleZoomOut} disabled={zoom <= 0.5} className="h-7 w-7">
            <ZoomOut className="h-4 w-4" />
          </Button>

          <span className="min-w-[3rem] text-center font-mono text-sm text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>

          <Button variant="ghost" size="icon" onClick={handleZoomIn} disabled={zoom >= 2} className="h-7 w-7">
            <ZoomIn className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex min-h-full items-start justify-center p-8">
          <div
            className="rounded-lg border border-border bg-white shadow-lg"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
            }}
          >
            {pdfUrl && (
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                className="pdf-document"
                loading={
                  <div className="flex h-[842px] w-[595px] items-center justify-center">
                    <p className="font-mono text-sm text-muted-foreground">Loading PDF...</p>
                  </div>
                }
                error={
                  <div className="flex h-[842px] w-[595px] items-center justify-center">
                    <p className="font-mono text-sm text-destructive">Error loading PDF</p>
                  </div>
                }
              >
                <Page
                  pageNumber={currentPage}
                  width={595}
                  className="pdf-page"
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              </Document>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
