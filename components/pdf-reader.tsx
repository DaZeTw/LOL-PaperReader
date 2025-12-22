"use client"

import { useState, useEffect } from "react"
import { PDFViewer } from "@/components/pdf-viewer"
import { RightSidebar } from "@/components/right-sidebar"
import { useSkimmingHighlights } from "@/hooks/useSkimmingHighlights"
import { usePaperReferences } from "@/hooks/usePaperReferences"
import { usePipelineStatus } from "@/hooks/usePipelineStatus"
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
  sidebarOpen: boolean
  onSidebarToggle: (isOpen: boolean) => void
  onOpenReferencePDF?: (pdfUrl: string, title: string) => void
}

export function SinglePDFReader({
  file, 
  documentId,
  tabId,
  isActive,
  sidebarOpen,
  onSidebarToggle,
  onOpenReferencePDF
}: SinglePDFReaderProps) {
  // ============================================================================
  // PIPELINE STATUS - Centralized processing state management
  // ============================================================================
  const {
    // Overall status
    isAllReady,
    isProcessing,
    overallProgress,
    message,
    stage,
    
    // Independent task readiness (ALL 4 tasks)
    isChatReady,
    isSummaryReady,
    isReferencesReady,
    isSkimmingReady,
    
    // Task statuses
    embeddingStatus,
    summaryStatus,
    referenceStatus,
    skimmingStatus,
    
    // Available features
    availableFeatures,
    
    // Helper functions
    isFeatureAvailable,
    getTaskMessage,
    getCompletedTasks,
    getProcessingTasks,
    
    // Metadata
    chunkCount,
    referenceCount,
    
    // Errors
    hasErrors,
    errors,
    
    // Timestamps
    embeddingUpdatedAt,
    summaryUpdatedAt,
    referenceUpdatedAt,
    skimmingUpdatedAt,
    
    // Raw status for advanced use
    raw: pipelineStatus,
  } = usePipelineStatus({ documentId })

  // Log pipeline status changes
  useEffect(() => {
    if (availableFeatures.length > 0) {
      console.log(`[SinglePDFReader:${tabId}] Available features:`, availableFeatures.join(', '))
    }
    if (isProcessing) {
      console.log(`[SinglePDFReader:${tabId}] Processing:`, getProcessingTasks().join(', '))
    }
    if (isAllReady) {
      console.log(`[SinglePDFReader:${tabId}] All processing complete!`)
    }
  }, [availableFeatures, isProcessing, isAllReady, tabId, getProcessingTasks])

  // ============================================================================
  // PDF Navigation State
  // ============================================================================
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState<number>(0)

  // ============================================================================
  // Highlights State (depends on embeddings being ready)
  // ============================================================================
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

  // References state (extracted references from PDF's References section)
  const { references, loading: referencesLoading, error: referencesError } = usePaperReferences(documentId)

  // ============================================================================
  // Handle citation click to open reference PDF
  // ============================================================================
  const handleReferenceClick = (citationId: string) => {
    console.log(`[SinglePDFReader:${tabId}] Citation clicked:`, citationId)

    // Check if references are ready
    if (!isReferencesReady) {
      console.warn(`[SinglePDFReader:${tabId}] References not ready yet (status: ${referenceStatus})`)
      return
    }

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
      console.warn(`[SinglePDFReader:${tabId}] Reference #${refNumber} not found in ${references.length} references`)
      return
    }

    // Open the reference link
    if (reference.link) {
      console.log(`[SinglePDFReader:${tabId}] Opening reference link:`, reference.link, `(type: ${reference.link_type})`)
      window.open(reference.link, "_blank", "noopener,noreferrer")
    } else {
      console.warn(`[SinglePDFReader:${tabId}] Reference #${refNumber} has no link`)
    }
  }

  // ============================================================================
  // Handle enabling skimming (depends on embeddings being ready)
  // ============================================================================
  const handleEnableSkimming = async () => {
    if (!isChatReady) {
      console.warn(`[SinglePDFReader:${tabId}] Cannot enable skimming - embeddings not ready (status: ${embeddingStatus})`)
      return
    }

    try {
      console.log(`[SinglePDFReader:${tabId}] Enabling skimming with default 50% density`)
      await enableSkimming(file, documentId, "medium")  // Always use medium (50%)
      setSkimmingEnabled(true)
    } catch (error) {
      console.error(`[SinglePDFReader:${tabId}] Failed to enable skimming:`, error)
    }
  }

  // ============================================================================
  // Handle disabling skimming
  // ============================================================================
  const handleDisableSkimming = () => {
    console.log(`[SinglePDFReader:${tabId}] Disabling skimming`)
    setSkimmingEnabled(false)
    setActiveHighlightIds(new Set())  // Clear active highlights immediately
  }

  // ============================================================================
  // Auto-activate all highlights when they are loaded
  // ============================================================================
  useEffect(() => {
    if (!skimmingEnabled) {
      // Clear highlights when skimming is disabled
      setActiveHighlightIds(new Set())
      console.log(`[SinglePDFReader:${tabId}] Skimming disabled, cleared active highlights`)
    } else if (highlights.length > 0) {
      // Activate all highlights when skimming is enabled
      const allHighlightIds = new Set(highlights.map((h) => h.id))
      setActiveHighlightIds(allHighlightIds)
      console.log(`[SinglePDFReader:${tabId}] Auto-activated ${highlights.length} highlights`)
    }
  }, [highlights.length, skimmingEnabled, tabId])

  // ============================================================================
  // Reset states when file changes
  // ============================================================================
  useEffect(() => {
    console.log(`[SinglePDFReader:${tabId}] File changed, resetting states`)
    setNavigationTarget(undefined)
    setCurrentPage(1)
    setActiveHighlightIds(new Set())
    setSkimmingEnabled(false)
    setHiddenHighlightIds(new Set())
  }, [file.name, file.size, file.lastModified, tabId])

  // ============================================================================
  // Handle page changes from PDF viewer
  // ============================================================================
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // ============================================================================
  // Handle highlight click - navigate to highlight location and toggle visibility
  // ============================================================================
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

  // ============================================================================
  // Handle highlight toggle - show/hide individual highlight
  // ============================================================================
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

  // ============================================================================
  // Handle citation click - navigate to citation page
  // ============================================================================
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

  // ============================================================================
  // Clear navigation target after navigation completes
  // ============================================================================
  const handleNavigationComplete = () => {
    console.log(`[SinglePDFReader:${tabId}] Navigation completed, clearing target`)
    setNavigationTarget(undefined)
  }

  console.log(
    `[SinglePDFReader:${tabId}] Render - file: ${file.name}, ` +
    `page: ${currentPage}, active: ${isActive}, sidebarOpen: ${sidebarOpen}, ` +
    `skimming: ${skimmingEnabled}, highlights: ${highlights.length}, ` +
    `pipeline: ${stage} (${availableFeatures.join(', ') || 'none ready'})`
  )

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
          documentId={documentId}
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
          onEnableSkimming={handleEnableSkimming}
          onDisableSkimming={handleDisableSkimming}
          isOpen={sidebarOpen}
          onToggle={() => onSidebarToggle(!sidebarOpen)}
          pipelineStatus={{
            // Overall status
            isAllReady,
            isProcessing,
            overallProgress,
            stage,
            message,
            
            // Independent task readiness (3 tasks passed to sidebar)
            isChatReady,
            isSummaryReady,
            isSkimmingReady,
            
            // Task statuses (3 tasks)
            embeddingStatus,
            summaryStatus,
            skimmingStatus,
            
            // Available features
            availableFeatures,
            
            // Metadata (chat/summary only)
            chunkCount,
            
            // Error tracking
            hasErrors,
            errors,
            
            // Helper functions
            getTaskMessage: (task: 'embedding' | 'summary' | 'skimming') => {
              return getTaskMessage(task as any)
            },
            getCompletedTasks,
            getProcessingTasks,
            isFeatureAvailable: (feature: 'chat' | 'summary' | 'skimming') => {
              return isFeatureAvailable(feature as any)
            },
            
            // Timestamps
            embeddingUpdatedAt,
            summaryUpdatedAt,
            skimmingUpdatedAt,
          }}
        />
      )}
    </div>
  )
}