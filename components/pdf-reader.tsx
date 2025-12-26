"use client"

import { useState, useEffect } from "react"
import { PDFViewer } from "@/components/pdf-viewer"
import { RightSidebar } from "@/components/right-sidebar"
import { PreviewSidebar } from "@/components/preview-sidebar"
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

type PDFMode = 'preview' | 'library'

interface SinglePDFReaderProps {
  file: File
  documentId: string
  tabId: string
  isActive: boolean
  sidebarOpen: boolean
  onSidebarToggle: (isOpen: boolean) => void
  onOpenReferencePDF?: (pdfUrl: string, title: string) => void
  mode?: PDFMode
}

export function SinglePDFReader({
  file, 
  documentId,
  tabId,
  isActive,
  sidebarOpen,
  onSidebarToggle,
  onOpenReferencePDF,
  mode = 'library',
}: SinglePDFReaderProps) {
  // ============================================================================
  // PDF URL for keyword extraction
  // ============================================================================
  const [pdfUrl, setPdfUrl] = useState<string>('')

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPdfUrl(url)
    console.log(`[SinglePDFReader:${tabId}] Created PDF URL for keyword extraction`)

    return () => {
      URL.revokeObjectURL(url)
      console.log(`[SinglePDFReader:${tabId}] Revoked PDF URL`)
    }
  }, [file, tabId])

  // ============================================================================
  // PIPELINE STATUS - Only fetch if in library mode
  // ============================================================================
  const shouldFetchPipeline = mode === 'library'
  
  const {
    isAllReady,
    isProcessing,
    overallProgress,
    message,
    stage,
    isChatReady,
    isSummaryReady,
    isReferencesReady,
    isSkimmingReady,
    embeddingStatus,
    summaryStatus,
    referenceStatus,
    skimmingStatus,
    availableFeatures,
    isFeatureAvailable,
    getTaskMessage,
    getCompletedTasks,
    getProcessingTasks,
    chunkCount,
    referenceCount,
    hasErrors,
    errors,
    embeddingUpdatedAt,
    summaryUpdatedAt,
    referenceUpdatedAt,
    skimmingUpdatedAt,
    raw: pipelineStatus,
  } = usePipelineStatus({ 
    documentId,
    enabled: shouldFetchPipeline
  })

  // ============================================================================
  // PDF Navigation State
  // ============================================================================
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState<number>(0)

  // ============================================================================
  // Highlights State (only in library mode)
  // ============================================================================
  const {
    highlights,
    loading: highlightsLoading,
    processing: highlightsProcessing,
    enableSkimming,
  } = useSkimmingHighlights()
  
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    new Set(["objective", "method", "result"])
  )
  const [hiddenHighlightIds, setHiddenHighlightIds] = useState<Set<number>>(new Set())
  const [activeHighlightIds, setActiveHighlightIds] = useState<Set<number>>(new Set())
  const [skimmingEnabled, setSkimmingEnabled] = useState(false)

  // ============================================================================
  // Handle enabling skimming (library mode only)
  // ============================================================================
  const handleEnableSkimming = async () => {
    if (mode !== 'library') return

    if (!isChatReady) {
      console.warn(`[SinglePDFReader:${tabId}] Cannot enable skimming - embeddings not ready (status: ${embeddingStatus})`)
      return
    }

    try {
      console.log(`[SinglePDFReader:${tabId}] Enabling skimming with default 50% density`)
      await enableSkimming(file, documentId, "medium")
      setSkimmingEnabled(true)
    } catch (error) {
      console.error(`[SinglePDFReader:${tabId}] Failed to enable skimming:`, error)
    }
  }

  const handleDisableSkimming = () => {
    console.log(`[SinglePDFReader:${tabId}] Disabling skimming`)
    setSkimmingEnabled(false)
    setActiveHighlightIds(new Set())
  }

  // ============================================================================
  // Auto-activate all highlights when loaded (library mode only)
  // ============================================================================
  useEffect(() => {
    if (mode !== 'library') return

    if (!skimmingEnabled) {
      setActiveHighlightIds(new Set())
      console.log(`[SinglePDFReader:${tabId}] Skimming disabled, cleared active highlights`)
    } else if (highlights.length > 0) {
      const allHighlightIds = new Set(highlights.map((h) => h.id))
      setActiveHighlightIds(allHighlightIds)
      console.log(`[SinglePDFReader:${tabId}] Auto-activated ${highlights.length} highlights`)
    }
  }, [highlights.length, skimmingEnabled, tabId, mode])

  // ============================================================================
  // Reset states when file or mode changes
  // ============================================================================
  useEffect(() => {
    console.log(`[SinglePDFReader:${tabId}] File or mode changed, resetting states`)
    setNavigationTarget(undefined)
    setCurrentPage(1)
    setActiveHighlightIds(new Set())
    setSkimmingEnabled(false)
    setHiddenHighlightIds(new Set())
  }, [file.name, file.size, file.lastModified, mode, tabId])

  // ============================================================================
  // Handle page changes from PDF viewer
  // ============================================================================
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // ============================================================================
  // Handle highlight click (library mode only)
  // ============================================================================
  const handleHighlightClick = (highlight: SkimmingHighlight) => {
    if (mode !== 'library') return

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
  // Handle citation click from QA - navigate to citation page
  // This is for QA citations, NOT reference popup citations
  // ============================================================================
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

  const handleNavigationComplete = () => {
    console.log(`[SinglePDFReader:${tabId}] Navigation completed, clearing target`)
    setNavigationTarget(undefined)
  }

  console.log(
    `[SinglePDFReader:${tabId}] Render - mode: ${mode}, file: ${file.name}, ` +
    `page: ${currentPage}, active: ${isActive}, sidebarOpen: ${sidebarOpen}, ` +
    `skimming: ${skimmingEnabled}, highlights: ${highlights.length}`
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
          hiddenHighlightIds={mode === 'library' ? hiddenHighlightIds : new Set()}
          activeHighlightIds={mode === 'library' ? activeHighlightIds : new Set()}
          highlights={mode === 'library' ? highlights : []}
          enableInteractions={mode === 'library'}
        />
      </div>

      {/* Sidebar - Conditional based on mode */}
      {isActive && (
        <>
          {mode === 'preview' ? (
            <PreviewSidebar
              file={file}
              documentId={documentId}
              tabId={tabId}
              totalPages={numPages}
              currentPage={currentPage}
              isOpen={sidebarOpen}
              onToggle={() => onSidebarToggle(!sidebarOpen)}
            />
          ) : (
            <RightSidebar
              tabId={tabId}
              pdfFile={file}
              documentId={documentId}
              onCitationClick={handleCitationClick}
              totalPages={numPages}
              pdfUrl={pdfUrl}
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
                isAllReady,
                isProcessing,
                overallProgress,
                stage,
                message,
                isChatReady,
                isSummaryReady,
                isSkimmingReady,
                embeddingStatus,
                summaryStatus,
                skimmingStatus,
                availableFeatures,
                chunkCount,
                hasErrors,
                errors,
                getTaskMessage: (task: 'embedding' | 'summary' | 'skimming') => {
                  return getTaskMessage(task as any)
                },
                getCompletedTasks,
                getProcessingTasks,
                isFeatureAvailable: (feature: 'chat' | 'summary' | 'skimming') => {
                  return isFeatureAvailable(feature as any)
                },
                embeddingUpdatedAt,
                summaryUpdatedAt,
                skimmingUpdatedAt,
              }}
            />
          )}
        </>
      )}
    </div>
  )
}