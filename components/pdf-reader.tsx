"use client"

import { useState, useEffect } from "react"
import { MessageSquare, BookmarkIcon, BookOpen } from "lucide-react"
import { PDFViewer } from "@/components/pdf-viewer"
import { AnnotationToolbar } from "@/components/annotation-toolbar"
import { QAInterface } from "@/components/qa-interface"
import { HighlightNotesSidebar } from "@/components/highlight-notes-sidebar"
import { ReferencesSidebar } from "@/components/references-sidebar"
import { useSkimmingHighlights } from "@/hooks/useSkimmingHighlights"
import { useReferences } from "@/hooks/useReferences"
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"
import { Button } from "@/components/ui/button"

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
  onOpenReferencePDF?: (pdfUrl: string, title: string) => void
}

export function SinglePDFReader({ file, tabId, isActive, onOpenReferencePDF }: SinglePDFReaderProps) {
  // PDF Navigation State
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState<number>(0)

  // Annotation State
  const [highlightColor, setHighlightColor] = useState("#fef08a")
  const [annotationMode, setAnnotationMode] = useState<"highlight" | "erase" | null>(null)

  // Right sidebar state
  const [rightSidebarMode, setRightSidebarMode] = useState<"qa" | "highlights" | "references">("qa")
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)

  // Highlights state
  const {
    highlights,
    loading: highlightsLoading,
    processing: highlightsProcessing,
    enableSkimming,
    fetchHighlights,
  } = useSkimmingHighlights()
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    new Set(["objective", "method", "result"])
  )
  const [hiddenHighlightIds, setHiddenHighlightIds] = useState<Set<number>>(new Set())
  // Track which highlights should be visible (starts empty - no highlights shown initially)
  const [activeHighlightIds, setActiveHighlightIds] = useState<Set<number>>(new Set())
  const [skimmingEnabled, setSkimmingEnabled] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<"light" | "medium" | "heavy">("medium")

  // References state
  const { references, loading: referencesLoading, error: referencesError } = useReferences()

  // Handle citation click to open reference PDF
  const handleReferenceClick = (citationId: string) => {
    console.log(`[SinglePDFReader:${tabId}] Citation clicked:`, citationId)

    // Extract numeric ID from citation (e.g., "cite.1" -> "1", "[1]" -> "1")
    const numericMatch = citationId.match(/\d+/)
    if (!numericMatch) {
      console.warn(`[SinglePDFReader:${tabId}] Could not extract numeric ID from:`, citationId)
      return
    }

    const refNumber = parseInt(numericMatch[0])
    console.log(`[SinglePDFReader:${tabId}] Looking for reference #${refNumber}`)

    // Find the reference
    const reference = references.find((ref) => ref.id === refNumber)
    if (!reference) {
      console.warn(`[SinglePDFReader:${tabId}] Reference #${refNumber} not found`)
      return
    }

    // Open the reference link
    if (reference.link) {
      console.log(`[SinglePDFReader:${tabId}] Opening reference link:`, reference.link, `(type: ${reference.link_type})`)
      
      const title = reference.title || `Reference ${refNumber}`
      
      // Try to open as new tab in app for supported types (arXiv, DOI, direct URL)
      if (onOpenReferencePDF && reference.link_type !== 'scholar') {
        // Use our proxy which supports arXiv, DOI (via Semantic Scholar), and direct PDFs
        console.log(`[SinglePDFReader:${tabId}] Attempting to open PDF in app:`, reference.link)
        onOpenReferencePDF(reference.link, title)
      } else {
        // Fallback to opening in browser for Scholar links (search results, not actual PDFs)
        window.open(reference.link, "_blank", "noopener,noreferrer")
      }
    } else {
      console.warn(`[SinglePDFReader:${tabId}] Reference #${refNumber} has no link`)
    }
  }

  // Handle enabling skimming
  const handleEnableSkimming = async () => {
    try {
      console.log(`[SinglePDFReader:${tabId}] Enabling skimming with preset: ${selectedPreset}`)
      await enableSkimming(file, selectedPreset)
      setSkimmingEnabled(true)
      // Switch to highlights sidebar to show results
      setRightSidebarMode("highlights")
      setRightSidebarOpen(true)
    } catch (error) {
      console.error(`[SinglePDFReader:${tabId}] Failed to enable skimming:`, error)
    }
  }

  // Auto-activate all highlights when they are loaded
  useEffect(() => {
    if (highlights.length > 0 && skimmingEnabled) {
      const allHighlightIds = new Set(highlights.map((h) => h.id))
      setActiveHighlightIds(allHighlightIds)
      console.log(`[SinglePDFReader:${tabId}] Auto-activated ${highlights.length} highlights`)
    }
  }, [highlights.length, skimmingEnabled, tabId])

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
    setSkimmingEnabled(false) // Reset skimming state when file changes
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
    <div className="flex h-full">
      {/* Main PDF Viewer Section */}
      <div className="flex flex-1 flex-col min-h-0">
        {/* Skimming Control Panel */}
        {isActive && !skimmingEnabled && (
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2 bg-background border border-border rounded-lg shadow-md p-3">
            <span className="font-mono text-sm font-medium text-foreground">Enable Skimming:</span>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value as "light" | "medium" | "heavy")}
              className="px-2 py-1 text-sm border border-border rounded bg-background font-mono"
            >
              <option value="light">Light (30%)</option>
              <option value="medium">Medium (50%)</option>
              <option value="heavy">Heavy (70%)</option>
            </select>
            <Button
              onClick={handleEnableSkimming}
              disabled={highlightsProcessing}
              size="sm"
              className="gap-2"
            >
              {highlightsProcessing ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Processing...
                </>
              ) : (
                "Enable"
              )}
            </Button>
          </div>
        )}

        {/* Skimming Status (after enabled) */}
        {isActive && skimmingEnabled && highlights.length > 0 && (
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg shadow-md px-3 py-2">
            <span className="text-lg">✨</span>
            <span className="font-mono text-sm font-medium text-foreground">
              Skimming: {highlights.length} highlights ({selectedPreset})
            </span>
          </div>
        )}

        <PDFViewer
          file={file}
          navigationTarget={navigationTarget}
          onPageChange={handlePageChange}
          onNavigationComplete={handleNavigationComplete}
          onDocumentLoad={(pageCount) => setNumPages(pageCount)}
          isActive={isActive}
          hiddenHighlightIds={hiddenHighlightIds}
          activeHighlightIds={activeHighlightIds}
          highlights={highlights}
          onReferenceClick={handleReferenceClick}
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
          <Button
            onClick={() => {
              setRightSidebarMode("references")
              setRightSidebarOpen(true)
            }}
            variant="default"
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
            title="Open References"
          >
            <BookOpen className="h-5 w-5" />
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
              <button
                onClick={() => setRightSidebarMode("references")}
                className={`p-3 transition-colors ${
                  rightSidebarMode === "references"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                title="References"
              >
                <BookOpen className="h-4 w-4" />
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

          {/* References Sidebar */}
          {rightSidebarMode === "references" && (
            <ReferencesSidebar
              references={references}
              loading={referencesLoading}
              error={referencesError}
              isOpen={rightSidebarOpen}
              onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
              onOpenReferencePDF={onOpenReferencePDF}
            />
          )}
        </>
      )}
    </div>
  )
}