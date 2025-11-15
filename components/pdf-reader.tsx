"use client"

import { useState, useEffect } from "react"
import { MessageSquare } from "lucide-react"
import { PDFViewer } from "@/components/pdf-viewer"
import { AnnotationToolbar } from "@/components/annotation-toolbar"
import { QAInterface } from "@/components/qa-interface"

interface NavigationTarget {
  page: number
  yPosition: number
}

interface SinglePDFReaderProps {
  file: File
  tabId: string
  isActive: boolean
}

export function SinglePDFReader({ file, tabId, isActive }: SinglePDFReaderProps) {
  // PDF Navigation State
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)

  // Annotation State
  const [highlightColor, setHighlightColor] = useState("#fef08a")
  const [annotationMode, setAnnotationMode] = useState<"highlight" | "erase" | null>(null)

  // QA State - only keep the open/close state
  const [qaOpen, setQaOpen] = useState(false)

  // Only reset states when file actually changes (not when tab becomes active/inactive)
  useEffect(() => {
    console.log(`[SinglePDFReader:${tabId}] File changed, resetting states`)
    setSelectedSection(null)
    setNavigationTarget(undefined)
    setCurrentPage(1)
    setAnnotationMode(null)
    setQaOpen(false)
  }, [file.name, file.size, file.lastModified, tabId])

  // Handle page changes from PDF viewer
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // Handle annotation highlight (placeholder for now)
  const handleHighlight = () => {
    console.log(`[SinglePDFReader:${tabId}] Highlight triggered`)
    // TODO: Implement highlighting logic
  }

  // Close QA when tab becomes inactive
  useEffect(() => {
    if (!isActive && qaOpen) {
      setQaOpen(false)
    }
  }, [isActive, qaOpen])

  console.log(`[SinglePDFReader:${tabId}] Render - file: ${file.name}, page: ${currentPage}, active: ${isActive}`)

  return (
    <div className="flex h-full">
      {/* Main PDF Viewer Section */}
      <div className="flex flex-1 flex-col min-h-0">
        <PDFViewer
          file={file}
          navigationTarget={navigationTarget}
          onPageChange={handlePageChange}
          isActive={isActive}
        />

        {/* Annotation Toolbar */}
        <AnnotationToolbar
          highlightColor={highlightColor}
          onColorChange={setHighlightColor}
          annotationMode={annotationMode}
          onModeChange={setAnnotationMode}
        />
      </div>

      {/* QA Interface Sidebar - Always present when tab is active */}
      {isActive && (
        <QAInterface
          tabId={tabId}
          pdfFile={file}
          onHighlight={handleHighlight}
          isOpen={qaOpen}
          onToggle={() => setQaOpen(!qaOpen)}
        />
      )}

      
    </div>
  )
}