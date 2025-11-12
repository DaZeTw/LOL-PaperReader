"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { FileText } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { PDFUpload } from "@/components/pdf-upload"
import { PDFViewer } from "@/components/pdf-viewer"
import { CitationPopup } from "@/components/citation-popup"
import { AnnotationToolbar } from "@/components/annotation-toolbar"
import { QAInterface } from "@/components/qa-interface"
import { Homepage } from "@/components/homepage"
import { TabBar, type TabItem } from "@/components/tab-bar"
import { type BookmarkItem } from "@/components/bookmark-panel"
import { useExtractCitations, type ExtractedCitation } from "@/hooks/useExtractCitations"
import { CitationProvider, useCitationContext } from "@/contexts/CitationContext"

interface NavigationTarget {
  page: number
  yPosition: number
}

interface PDFTab {
  id: string
  file: File
  selectedSection: string | null
  bookmarks: BookmarkItem[]
  qaHistory: Array<{
    question: string
    answer: string
    timestamp: Date
  }>
  extractedCitations?: ExtractedCitation[]
  pdfId?: string
  parsedOutputs?: any
}

/**
 * Main PDF Reader component with multi-tab support
 * Wrapped with CitationProvider for per-tab citation state isolation
 */
function PDFReaderContent() {
  const [tabs, setTabs] = useState<PDFTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false) // Track if upload view should be shown
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | undefined>(undefined)
  const [highlightColor, setHighlightColor] = useState("#fef08a")
  const [annotationMode, setAnnotationMode] = useState<"highlight" | "erase" | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [qaOpen, setQaOpen] = useState(true)
  const [currentPage, setCurrentPage] = useState(1) // Track current page for sidebar highlighting

  // Citation popup state
  const [popupCitation, setPopupCitation] = useState<any>(null)
  const [citationPopupOpen, setCitationPopupOpen] = useState(false)

  // Get citation context for cleanup
  const citationContext = useCitationContext()

  // Citation extraction hook
  const { extractCitations, getCitationById, loading: extracting, progress } = useExtractCitations()

  const activeTab = tabs.find((tab) => tab.id === activeTabId)

  // Handle citation click from PDF viewer
  const handleCitationClick = (citation: any, event: MouseEvent) => {
    console.log("[PDFReader] Citation clicked:", citation)

    // Try to get extracted reference text for this citation
    if (activeTab && activeTab.extractedCitations) {
      const extractedCitation = activeTab.extractedCitations.find(
        (c) => c.id === citation.id || citation.text.includes(c.id.replace("cite.", ""))
      )

      if (extractedCitation) {
        console.log("[PDFReader] Found extracted reference:", extractedCitation)
        // Merge extracted reference with citation data
        citation = {
          ...citation,
          extractedText: extractedCitation.text,
          extractionConfidence: extractedCitation.confidence,
          extractionMethod: extractedCitation.method,
        }
      }
    }

    setPopupCitation(citation)
    setCitationPopupOpen(true)
  }

  // Handle closing citation popup
  const handleCloseCitationPopup = () => {
    setCitationPopupOpen(false)
    setPopupCitation(null)
  }

  // Handle viewing reference from popup
  const handleViewReference = (citation: any) => {
    console.log("[PDFReader] View reference for:", citation)
    // Could implement navigation to reference section
  }

  // Handle copying citation text
  const handleCopyText = (text: string) => {
    console.log("[PDFReader] Copied text:", text)
  }

  const handleFileSelect = async (file: File, parsedData?: any) => {
    console.log("[PDF Reader] Upload detected:", file.name, "parsed:", parsedData)

    // Create a new tab first to get the tab ID
    const newTab: PDFTab = {
      id: Date.now().toString(),
      file,
      selectedSection: null,
      bookmarks: [],
      qaHistory: [],
      pdfId: parsedData?.pdfId,
      parsedOutputs: parsedData?.outputs || parsedData?.backendResult?.results?.[0]?.outputs
    }

    setTabs((prev) => {
      const newTabs = [...prev, newTab]
      console.log("[PDF Reader] Updated tabs:", newTabs.length)
      return newTabs
    })

    setActiveTabId(newTab.id)
    setShowUpload(false) // Hide upload view after file is selected
    console.log("[PDF Reader] Active tab set to:", newTab.id)

    // Extract citations from the PDF in the background
    // Pass tabId for cache isolation
    extractCitations(file, newTab.id).then((result) => {
      if (result) {
        console.log("[PDFReader] Extracted", result.totalCitations, "citations for tab:", newTab.id)
        // Update the tab with extracted citations
        setTabs((prevTabs) =>
          prevTabs.map((tab) =>
            tab.id === newTab.id ? { ...tab, extractedCitations: result.citations } : tab
          )
        )
      }
    }).catch(error => {
      console.error("[PDF Reader] Error extracting citations:", error)
    })
  }

  // Function to update a tab's parsed data when API completes
  const handleParseComplete = useCallback((fileName: string, parsedData: any) => {
    console.log("[PDF Reader] Updating parsed data for:", fileName, parsedData)
    setTabs((prevTabs) =>
      prevTabs.map((tab) => {
        if (tab.file.name === fileName) {
          return {
            ...tab,
            pdfId: parsedData?.pdfId || tab.pdfId,
            parsedOutputs: parsedData?.backendResult?.results?.[0]?.outputs || parsedData?.outputs || tab.parsedOutputs,
          }
        }
        return tab
      })
    )
  }, [])

  /**
   * Handle closing a tab
   * Cleans up citation state to prevent memory leaks
   */
  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    // Cleanup citation state for this tab
    citationContext.cleanupTab(tabId)

    setTabs((prev) => {
      const newTabs = prev.filter((tab) => tab.id !== tabId)
      if (activeTabId === tabId && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id)
      } else if (newTabs.length === 0) {
        setActiveTabId(null)
      }
      return newTabs
    })
  }

  // Updated to handle bookmark navigation from PDF viewer
  const handleSectionSelect = (bookmark: any) => {
    if (!activeTabId) return
    
    console.log("[PDF Reader] Navigating to bookmark:", bookmark.title, "dest:", bookmark.dest)
    
    // Update selected section in tab
    setTabs((prev) => prev.map((tab) => 
      tab.id === activeTabId 
        ? { ...tab, selectedSection: bookmark.title } 
        : tab
    ))
    
    // Set navigation target if bookmark has destination
    if (bookmark.dest) {
      setNavigationTarget({ 
        page: bookmark.dest.pageIndex + 1, // Convert 0-based to 1-based
        yPosition: 0 // PDF bookmarks typically jump to top of page
      })
    }
  }

  // Reset navigation when tab changes
  useEffect(() => {
    setNavigationTarget(undefined)
    setCurrentPage(1) // Reset current page when switching tabs
  }, [activeTabId])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  console.log("[PDF Reader] Render - tabs:", tabs.length, "activeTab:", activeTab?.file.name)

  // Convert tabs to TabItem format for TabBar
  const tabItems: TabItem[] = tabs.map((tab) => ({
    id: tab.id,
    label: tab.file.name,
  }))

  // Handler for opening upload view
  const handleOpenUpload = () => {
    if (tabs.length === 0) {
      setShowUpload(true)
    } else {
      setActiveTabId(null)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <FileText className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="font-mono text-lg font-medium text-foreground">Scholar Reader</h1>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      <TabBar
        tabs={tabItems}
        activeTabId={activeTabId}
        onTabClick={setActiveTabId}
        onTabClose={handleCloseTab}
        onNewTab={handleOpenUpload}
        showNewButton={tabs.length > 0}
      />

      <div className="flex flex-1 overflow-hidden">
        {tabs.length === 0 && !showUpload ? (
          <Homepage onGetStarted={handleOpenUpload} />
        ) : tabs.length === 0 && showUpload ? (
          <PDFUpload onFileSelect={handleFileSelect} onParseComplete={handleParseComplete} />
        ) : !activeTab ? (
          <PDFUpload onFileSelect={handleFileSelect} onParseComplete={handleParseComplete} />
        ) : (
          <>
            {/* Center - PDF Viewer with Annotation Toolbar */}
            <div className="relative flex flex-1 flex-col">
              <PDFViewer
                tabId={activeTab.id} // Pass tabId for state isolation
                file={activeTab.file}
                selectedSection={activeTab.selectedSection}
                navigationTarget={navigationTarget}
                onPageChange={handlePageChange}
                onSectionSelect={handleSectionSelect} // Pass the bookmark handler
                onCitationClick={handleCitationClick} // Pass citation click handler
                extractedCitations={activeTab.extractedCitations || []} // Pass extracted citations
              />

              <AnnotationToolbar
                highlightColor={highlightColor}
                onColorChange={setHighlightColor}
                annotationMode={annotationMode}
                onModeChange={setAnnotationMode}
              />
            </div>

            {/* Right Sidebar - Q&A Interface */}
            <QAInterface
              tabId={activeTab.id} // Pass tabId for session isolation
              pdfFile={activeTab.file}
              onHighlight={() => {}}
              isOpen={qaOpen}
              onToggle={() => setQaOpen(!qaOpen)}
              onNewMessage={(question, answer) => {
                if (!activeTabId) return
                setTabs((prev) =>
                  prev.map((tab) =>
                    tab.id === activeTabId
                      ? {
                          ...tab,
                          qaHistory: [
                            ...tab.qaHistory,
                            { question, answer, timestamp: new Date() },
                          ],
                        }
                      : tab
                  )
                )
              }}
            />

            {/* Citation Popup with metadata fetching */}
            <CitationPopup
              citation={popupCitation}
              isOpen={citationPopupOpen}
              onClose={handleCloseCitationPopup}
              onViewReference={handleViewReference}
              onCopyText={handleCopyText}
            />

          </>
        )}
      </div>
    </div>
  )
}

/**
 * Wrapper component that provides CitationContext to all child components
 * This ensures per-tab state isolation for citations
 */
export function PDFReader() {
  return (
    <CitationProvider>
      <PDFReaderContent />
    </CitationProvider>
  )
}