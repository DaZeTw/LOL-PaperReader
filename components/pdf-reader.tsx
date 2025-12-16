"use client"

import { useState, useEffect } from "react"
import { PDFViewer } from "@/components/pdf-viewer"
import { AnnotationToolbar } from "@/components/annotation-toolbar"
import { RightSidebar } from "@/components/right-sidebar"
import { useSkimmingHighlights } from "@/hooks/useSkimmingHighlights"
import { usePaperReferences } from "@/hooks/usePaperReferences"
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"

interface NavigationTarget {
  page: number
  yPosition: number
  highlightText?: string
  highlightId?: number
}

interface SinglePDFReaderProps {
  file: File
  documentId: string
  tabId: string
  isActive: boolean
  sidebarOpen: boolean  // Controlled from parent
  onSidebarToggle: (isOpen: boolean) => void  // Callback to parent
  onOpenReferencePDF?: (pdfUrl: string, title: string) => void  // Callback to open reference in new tab
}

export function SinglePDFReader({
  file, documentId,
  tabId,
  isActive,
  sidebarOpen,
  onSidebarToggle,
  onOpenReferencePDF
}: SinglePDFReaderProps) {
  // PDF Navigation State
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState<number>(0)

  // Annotation State
  const [highlightColor, setHighlightColor] = useState("#fef08a")
  const [annotationMode, setAnnotationMode] = useState<"highlight" | "erase" | null>(null)

  // Highlights state from hook
  const {
    highlights,
    loading: highlightsLoading,
    processing: highlightsProcessing,
    enableSkimming,
  } = useSkimmingHighlights()
  
  // Highlights display state
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    new Set(["objective", "method", "result"])
  )
  const [hiddenHighlightIds, setHiddenHighlightIds] = useState<Set<number>>(new Set())
  const [activeHighlightIds, setActiveHighlightIds] = useState<Set<number>>(new Set())
  
  // Skimming state
  const [skimmingEnabled, setSkimmingEnabled] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<"light" | "medium" | "heavy">("medium")

  // References state (extracted references from PDF's References section)
  const { references, loading: referencesLoading, error: referencesError } = usePaperReferences(documentId)

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

  // Reset states when file changes
  useEffect(() => {
    console.log(`[SinglePDFReader:${tabId}] File changed, resetting states`)
    setNavigationTarget(undefined)
    setCurrentPage(1)
    setAnnotationMode(null)
    // Don't reset sidebar state - it's controlled by parent
    setActiveHighlightIds(new Set())
    setSkimmingEnabled(false)
  }, [file.name, file.size, file.lastModified, tabId])

  // Handle page changes from PDF viewer
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // Handle highlight click - navigate to highlight location and toggle visibility
  const handleHighlightClick = (highlight: SkimmingHighlight) => {
    console.log(`[SinglePDFReader:${tabId}] Clicking highlight:`, highlight.text.substring(0, 50))

    // Toggle highlight visibility
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

    // Navigate to highlight location
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

    // Validate page number
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

  console.log(`[SinglePDFReader:${tabId}] Render - file: ${file.name}, page: ${currentPage}, active: ${isActive}, sidebarOpen: ${sidebarOpen}`)

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* Main PDF Viewer - resizes when sidebar opens */}
      <div 
        className="flex min-h-0 flex-1 flex-col transition-all duration-300 ease-in-out"
        style={{
          marginRight: sidebarOpen ? '384px' : '0px'
        }}
      >
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


      </div>

      {/* Right Sidebar - Only shown when tab is active */}
      {isActive && (
        <RightSidebar
          tabId={tabId}
          pdfFile={file}
          documentId={documentId}
          onCitationClick={handleCitationClick}
          totalPages={numPages}
          highlights={highlights}
          highlightsLoading={highlightsLoading}
          highlightsProcessing={highlightsProcessing}
          visibleCategories={visibleCategories}
          onHighlightClick={handleHighlightClick}
          hiddenHighlightIds={hiddenHighlightIds}
          onHighlightToggle={handleHighlightToggle}
          activeHighlightIds={activeHighlightIds}
          skimmingEnabled={skimmingEnabled}
          selectedPreset={selectedPreset}
          onPresetChange={setSelectedPreset}
          onEnableSkimming={handleEnableSkimming}
          isOpen={sidebarOpen}
          onToggle={() => onSidebarToggle(!sidebarOpen)}
        />
      )}
    </div>
  )
}