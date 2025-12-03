"use client"

import { useState, useEffect } from "react"
import { PDFViewer } from "@/components/pdf-viewer"
import { AnnotationToolbar } from "@/components/annotation-toolbar"
import { RightSidebar } from "@/components/right-sidebar"
import { useSkimmingHighlights } from "@/hooks/useSkimmingHighlights"
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"
import { useAuth } from "@/hooks/useAuth"

interface NavigationTarget {
  page: number
  yPosition: number
  highlightText?: string
  highlightId?: number
}

interface SinglePDFReaderProps {
  file: File
  tabId: string
  isActive: boolean
  onOpenDocument?: (document: UploadedDocument) => Promise<void>
}

export function SinglePDFReader({ file, tabId, isActive, onOpenDocument }: SinglePDFReaderProps) {
  const { user } = useAuth()
  const stableUserId = user
    ? user.dbId
      ? String(user.dbId)
      : user.id
    : undefined
  
  // PDF Navigation State
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState<number>(0)

  // Annotation State
  const [highlightColor, setHighlightColor] = useState("#fef08a")
  const [annotationMode, setAnnotationMode] = useState<"highlight" | "erase" | null>(null)

  // Right sidebar state
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)

  // Highlights state
  const { highlights, loading: highlightsLoading } = useSkimmingHighlights()
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    new Set(["novelty", "method", "result"])
  )
  const [hiddenHighlightIds, setHiddenHighlightIds] = useState<Set<number>>(new Set())
  const [activeHighlightIds, setActiveHighlightIds] = useState<Set<number>>(new Set())

  // Only reset states when file actually changes
  useEffect(() => {
    console.log(`[SinglePDFReader:${tabId}] File changed, resetting states`)
    setSelectedSection(null)
    setNavigationTarget(undefined)
    setCurrentPage(1)
    setAnnotationMode(null)
    setRightSidebarOpen(false)
    setActiveHighlightIds(new Set())
  }, [file.name, file.size, file.lastModified, tabId])

  // Handle page changes from PDF viewer
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // Handle highlight click - navigate to highlight location and toggle visibility
  const handleHighlightClick = (highlight: SkimmingHighlight) => {
    console.log(`[SinglePDFReader:${tabId}] Clicking highlight:`, highlight.text.substring(0, 50))

    setActiveHighlightIds((prev) => {
      const next = new Set(prev)
      if (next.has(highlight.id)) {
        next.delete(highlight.id)
        console.log(`[SinglePDFReader:${tabId}] Hiding highlight ${highlight.id}`)
      } else {
        next.add(highlight.id)
        console.log(`[SinglePDFReader:${tabId}] Showing highlight ${highlight.id}`)
      }
      return next
    })

    const firstBox = highlight.boxes[0]
    const page = firstBox.page + 1

    setNavigationTarget({
      page,
      yPosition: firstBox.top,
      highlightId: highlight.id,
    })

    setCurrentPage(page)
  }

  // Handle highlight toggle - show/hide individual highlight
  const handleHighlightToggle = (highlightId: number) => {
    setHiddenHighlightIds((prev) => {
      const next = new Set(prev)
      if (next.has(highlightId)) {
        next.delete(highlightId)
      } else {
        next.add(highlightId)
      }
      return next
    })
  }

  // Handle citation click - navigate to citation page
  const handleCitationClick = (page: number, text?: string) => {
    console.log(`[SinglePDFReader:${tabId}] Navigating to citation page:`, page, text?.substring(0, 50))

    if (numPages > 0 && (page < 1 || page > numPages)) {
      console.warn(`[SinglePDFReader:${tabId}] Invalid page number ${page}, PDF only has ${numPages} pages`)
      return
    }

    setNavigationTarget({
      page,
      yPosition: 0,
      highlightText: text,
    })

    setCurrentPage(page)
  }

  // Clear navigation target after navigation completes
  const handleNavigationComplete = () => {
    console.log(`[SinglePDFReader:${tabId}] Navigation completed, clearing target`)
    setNavigationTarget(undefined)
  }

  // Close sidebar when tab becomes inactive
  useEffect(() => {
    if (!isActive && rightSidebarOpen) {
      setRightSidebarOpen(false)
    }
  }, [isActive, rightSidebarOpen])

  console.log(`[SinglePDFReader:${tabId}] Render - file: ${file.name}, page: ${currentPage}, active: ${isActive}`)

  return (
    <div className="relative flex h-full">
      {/* Main PDF Viewer Section */}
      <div className="flex min-h-0 flex-1 flex-col">
        <PDFViewer
          file={file}
          navigationTarget={navigationTarget}
          onPageChange={handlePageChange}
          onNavigationComplete={handleNavigationComplete}
          onDocumentLoad={(pageCount) => setNumPages(pageCount)}
          isActive={isActive}
          hiddenHighlightIds={hiddenHighlightIds}
          activeHighlightIds={activeHighlightIds}
        />

        {/* Annotation Toolbar */}
        {/* <AnnotationToolbar
          highlightColor={highlightColor}
          onColorChange={setHighlightColor}
          annotationMode={annotationMode}
          onModeChange={setAnnotationMode}
        /> */}
      </div>

      {/* Right Sidebar */}
      {isActive && (
        <RightSidebar
          tabId={tabId}
          pdfFile={file}
          onCitationClick={handleCitationClick}
          totalPages={numPages}
          highlights={highlights}
          highlightsLoading={highlightsLoading}
          visibleCategories={visibleCategories}
          onHighlightClick={handleHighlightClick}
          hiddenHighlightIds={hiddenHighlightIds}
          onHighlightToggle={handleHighlightToggle}
          activeHighlightIds={activeHighlightIds}
          isOpen={rightSidebarOpen}
          onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
        />
      )}
    </div>
  )
}