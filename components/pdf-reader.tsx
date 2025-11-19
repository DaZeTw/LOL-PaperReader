"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { PDFViewer } from "@/components/pdf-viewer"
import { AnnotationToolbar } from "@/components/annotation-toolbar"
import { QAInterface } from "@/components/qa-interface"
import { DocumentHistorySidebar } from "@/components/document-history-sidebar"
import { useToast } from "@/hooks/use-toast"
import type { UploadedDocument } from "@/components/pdf-upload"

interface NavigationTarget {
  page: number
  yPosition: number
}

interface SinglePDFReaderProps {
  file: File
  tabId: string
  isActive: boolean
  onOpenDocument?: (document: UploadedDocument) => Promise<void>
}

export function SinglePDFReader({ file, tabId, isActive, onOpenDocument }: SinglePDFReaderProps) {
  // PDF Navigation State
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)

  // Annotation State
  const [highlightColor, setHighlightColor] = useState("#fef08a")
  const [annotationMode, setAnnotationMode] = useState<"highlight" | "erase" | null>(null)

  // QA State - only keep the open/close state
  const [qaOpen, setQaOpen] = useState(false)

  // History Sidebar State
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyDocuments, setHistoryDocuments] = useState<UploadedDocument[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const { toast } = useToast()
  const historyLoadingRef = useRef(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

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

  // Track if this tab has loaded documents before
  const hasLoadedOnceRef = useRef(false)

  // Load document history - exactly like pdf-upload.tsx
  const loadHistoryDocuments = useCallback(async (force = false) => {
    // Don't reload if already loaded and not forcing, or if already loading
    if (!force && (historyLoadingRef.current || hasLoadedOnceRef.current)) {
      return
    }
    
    historyLoadingRef.current = true
    
    try {
      setHistoryLoading(true)
      setHistoryError(null)

      const response = await fetch("/api/documents", { cache: "no-store" })
      if (!response.ok) {
        throw new Error("Failed to fetch documents")
      }
      const data = (await response.json()) as { documents?: UploadedDocument[] }
      setHistoryDocuments(data.documents ?? [])
    } catch (error) {
      console.error(`[SinglePDFReader:${tabId}] Failed to load uploaded documents:`, error)
      setHistoryError("Unable to load uploaded PDFs.")
      toast({
        title: "Failed to load PDFs",
        description: "Could not load your uploaded documents. Please try again.",
        variant: "destructive",
      })
    } finally {
      historyLoadingRef.current = false
      setHistoryLoading(false)
      setHistoryLoaded(true)
      hasLoadedOnceRef.current = true
    }
  }, [tabId, toast])

  // Load documents once when component mounts (like pdf-upload.tsx)
  useEffect(() => {
    if (!hasLoadedOnceRef.current) {
      void loadHistoryDocuments()
    }
  }, [loadHistoryDocuments])

  // Listen for PDF upload events to refresh documents list
  useEffect(() => {
    const handlePdfUploaded = () => {
      // Only refresh if this tab has already loaded documents before
      if (hasLoadedOnceRef.current) {
        console.log(`[SinglePDFReader:${tabId}] PDF uploaded event received, refreshing documents`)
        void loadHistoryDocuments(true)
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("pdf-uploaded", handlePdfUploaded)
      return () => {
        window.removeEventListener("pdf-uploaded", handlePdfUploaded)
      }
    }
  }, [tabId, loadHistoryDocuments])

  const handleOpenHistoryDocument = useCallback(
    async (document: UploadedDocument) => {
      if (!onOpenDocument) {
        toast({
          title: "Action unavailable",
          description: "Cannot open documents from history in this view.",
          variant: "destructive",
        })
        return
      }

      try {
        setOpeningDocumentId(document._id)
        await onOpenDocument(document)
      } catch (error) {
        console.error(`[SinglePDFReader:${tabId}] Failed to open document:`, error)
        const description =
          error instanceof Error && error.message
            ? error.message
            : "Could not open the selected document. Please try again."
        toast({
          title: "Failed to open PDF",
          description,
          variant: "destructive",
        })
      } finally {
        setOpeningDocumentId(null)
      }
    },
    [onOpenDocument, tabId, toast],
  )

  console.log(`[SinglePDFReader:${tabId}] Render - file: ${file.name}, page: ${currentPage}, active: ${isActive}`)

  return (
    <div className="relative flex h-full">
      {isActive && (
        <DocumentHistorySidebar
          documents={historyDocuments}
          loading={historyLoading}
          hasLoaded={historyLoaded}
          error={historyError}
          isOpen={historyOpen}
          side="right"
          onToggle={() => setHistoryOpen((prev: boolean) => !prev)}
          onRefresh={() => {
            void loadHistoryDocuments(true)
          }}
          onOpenDocument={handleOpenHistoryDocument}
          activeFileName={file.name}
          openingDocumentId={openingDocumentId}
        />
      )}
      {/* Main PDF Viewer Section */}
      <div className="flex min-h-0 flex-1 flex-col">
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