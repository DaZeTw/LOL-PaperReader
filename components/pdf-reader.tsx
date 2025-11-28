"use client"

import { useState, useEffect } from "react"
import { MessageSquare, BookmarkIcon } from "lucide-react"
import { PDFViewer } from "@/components/pdf-viewer"
import { AnnotationToolbar } from "@/components/annotation-toolbar"
import { QAInterface } from "@/components/qa-interface"
import { HighlightNotesSidebar } from "@/components/highlight-notes-sidebar"
import { useSkimmingHighlights } from "@/hooks/useSkimmingHighlights"
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"
import { Button } from "@/components/ui/button"
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
  const [rightSidebarMode, setRightSidebarMode] = useState<"qa" | "highlights">("qa")
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)

  // Highlights state
  const { highlights, loading: highlightsLoading } = useSkimmingHighlights()
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    new Set(["novelty", "method", "result"])
  )
  const [hiddenHighlightIds, setHiddenHighlightIds] = useState<Set<number>>(new Set())
  // Track which highlights should be visible (starts empty - no highlights shown initially)
  const [activeHighlightIds, setActiveHighlightIds] = useState<Set<number>>(new Set())

  // Only reset states when file actually changes (not when tab becomes active/inactive)
  useEffect(() => {
    console.log(`[SinglePDFReader:${tabId}] File changed, resetting states`)
    setSelectedSection(null)
    setNavigationTarget(undefined)
    setCurrentPage(1)
    setAnnotationMode(null)
    setRightSidebarOpen(false)
    setRightSidebarMode("qa")
    setActiveHighlightIds(new Set()) // Reset active highlights when file changes
  }, [file.name, file.size, file.lastModified, tabId])

  // Handle page changes from PDF viewer
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // Handle highlight click - navigate to highlight location and toggle visibility
  const handleHighlightClick = (highlight: SkimmingHighlight) => {
    console.log(`[SinglePDFReader:${tabId}] Clicking highlight:`, highlight.text.substring(0, 50))

    // Toggle highlight in active set (show/hide it in PDF)
    setActiveHighlightIds((prev) => {
      const next = new Set(prev)
      if (next.has(highlight.id)) {
        // If already active, remove it (hide)
        next.delete(highlight.id)
        console.log(`[SinglePDFReader:${tabId}] Hiding highlight ${highlight.id}`)
      } else {
        // If not active, add it (show)
        next.add(highlight.id)
        console.log(`[SinglePDFReader:${tabId}] Showing highlight ${highlight.id}`)
      }
      return next
    })

    // Get the first box to determine page and position
    const firstBox = highlight.boxes[0]
    const page = firstBox.page + 1 // Convert from 0-indexed to 1-indexed

    // Set navigation target with highlight ID for direct element scrolling
    setNavigationTarget({
      page,
      yPosition: firstBox.top,
      highlightId: highlight.id,
    })

    // Update current page
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

    // Validate page number
    if (numPages > 0 && (page < 1 || page > numPages)) {
      console.warn(`[SinglePDFReader:${tabId}] Invalid page number ${page}, PDF only has ${numPages} pages`)
      return
    }

    // Set navigation target with page and text to highlight
    setNavigationTarget({
      page,
      yPosition: 0,
      highlightText: text,
    })

    // Update current page
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
        <AnnotationToolbar
          highlightColor={highlightColor}
          onColorChange={setHighlightColor}
          annotationMode={annotationMode}
          onModeChange={setAnnotationMode}
        />
      </div>

      {/* Right Sidebar - Toggle buttons when closed */}
      {isActive && !rightSidebarOpen && (
        <div className="flex flex-col gap-2 absolute right-4 top-20 z-10">
          <Button
            onClick={() => {
              setRightSidebarMode("qa")
              setRightSidebarOpen(true)
            }}
            variant="default"
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
            title="Open Q&A"
          >
            <MessageSquare className="h-5 w-5" />
          </Button>
          <Button
            onClick={() => {
              setRightSidebarMode("highlights")
              setRightSidebarOpen(true)
            }}
            variant="default"
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
            title="Open Highlights"
            disabled={highlightsLoading || highlights.length === 0}
          >
            <BookmarkIcon className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Right Sidebar Content */}
      {isActive && (
        <>
          {/* Sidebar Mode Toggle - Show when sidebar is open */}
          {rightSidebarOpen && (
            <div className="absolute right-[384px] top-20 z-10 flex flex-col gap-1 bg-background border border-border rounded-lg shadow-md overflow-hidden">
              <button
                onClick={() => setRightSidebarMode("qa")}
                className={`p-3 transition-colors ${
                  rightSidebarMode === "qa"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                title="Q&A"
              >
                <MessageSquare className="h-4 w-4" />
              </button>
              <button
                onClick={() => setRightSidebarMode("highlights")}
                className={`p-3 transition-colors ${
                  rightSidebarMode === "highlights"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                title="Highlights"
                disabled={highlightsLoading || highlights.length === 0}
              >
                <BookmarkIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* QA Interface */}
          {rightSidebarMode === "qa" && (
            <QAInterface
              tabId={tabId}
              pdfFile={file}
              onHighlight={() => {}}
              onCitationClick={handleCitationClick}
              totalPages={numPages}
              isOpen={rightSidebarOpen}
              onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
            />
          )}

          {/* Highlights Sidebar */}
          {rightSidebarMode === "highlights" && (
            <HighlightNotesSidebar
              highlights={highlights}
              visibleCategories={visibleCategories}
              onHighlightClick={handleHighlightClick}
              isOpen={rightSidebarOpen}
              onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
              hiddenHighlightIds={hiddenHighlightIds}
              onHighlightToggle={handleHighlightToggle}
              activeHighlightIds={activeHighlightIds}
            />
          )}
        </>
      )}
    </div>
  )
}