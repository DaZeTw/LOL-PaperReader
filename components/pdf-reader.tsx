"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { FileText, MessageSquare, X, Plus } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { PDFUpload } from "@/components/pdf-upload"
import { PDFViewer } from "@/components/pdf-viewer"
import { CitationSidebar } from "@/components/citation-sidebar"
import { CitationPopup } from "@/components/citation-popup"
import { AnnotationToolbar } from "@/components/annotation-toolbar"
import { QAInterface } from "@/components/qa-interface"
import { BookmarkPanel, type BookmarkItem } from "@/components/bookmark-panel"
import { KeyboardShortcutsPanel, useKeyboardShortcuts } from "@/components/keyboard-shortcuts-panel"
import { ExportDialog } from "@/components/export-dialog"
import { ImageGallery, mockImages } from "@/components/image-gallery"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useExtractCitations, type ExtractedCitation } from "@/hooks/useExtractCitations"

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
}

export function PDFReader() {
  const [tabs, setTabs] = useState<PDFTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | undefined>(undefined)
  const [selectedCitation, setSelectedCitation] = useState<any>(null)
  const [highlightColor, setHighlightColor] = useState("#fef08a")
  const [annotationMode, setAnnotationMode] = useState<"highlight" | "erase" | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [citationSidebarOpen, setCitationSidebarOpen] = useState(false)
  const [qaOpen, setQaOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1) // Track current page for sidebar highlighting

  // Citation popup state
  const [popupCitation, setPopupCitation] = useState<any>(null)
  const [citationPopupOpen, setCitationPopupOpen] = useState(false)

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

  const handleFileSelect = async (file: File) => {
    console.log("[PDF Reader] Upload detected:", file.name)

    // Extract citations from the PDF in the background
    extractCitations(file).then((result) => {
      if (result) {
        console.log("[PDFReader] Extracted", result.totalCitations, "citations")
        // Update the tab with extracted citations
        setTabs((prevTabs) =>
          prevTabs.map((tab) =>
            tab.file.name === file.name ? { ...tab, extractedCitations: result.citations } : tab
          )
        )
      }
    })
  
    try {
      // Create a new tab without parsed data
      const newTab: PDFTab = {
        id: Date.now().toString(),
        file,
        selectedSection: null,
        bookmarks: [],
        qaHistory: []
      }
    
      setTabs((prev) => {
        const newTabs = [...prev, newTab]
        console.log("[PDF Reader] Updated tabs:", newTabs.length)
        return newTabs
      })
    
      setActiveTabId(newTab.id)
      console.log("[PDF Reader] Active tab set to:", newTab.id)
      
    } catch (error) {
      console.error("[PDF Reader] Error processing PDF:", error)
    }
  }

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
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

      {tabs.length > 0 && (
        <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1">
          <div className="flex flex-1 items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer",
                  activeTabId === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[150px] truncate font-mono text-xs">{tab.file.name}</span>
                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/20 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setActiveTabId(null)} className="h-7 gap-1.5 px-2 text-xs">
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {!activeTab ? (
          <PDFUpload onFileSelect={handleFileSelect} />
        ) : (
          <>
            {/* Center - PDF Viewer with Annotation Toolbar */}
            <div className="relative flex flex-1 flex-col">
              <PDFViewer
                file={activeTab.file}
                selectedSection={activeTab.selectedSection}
                navigationTarget={navigationTarget}
                onPageChange={handlePageChange}
                onSectionSelect={handleSectionSelect} // Pass the bookmark handler
                onCitationClick={handleCitationClick} // Pass citation click handler
              />

              <AnnotationToolbar
                highlightColor={highlightColor}
                onColorChange={setHighlightColor}
                annotationMode={annotationMode}
                onModeChange={setAnnotationMode}
              />

              {qaOpen && (
                <QAInterface
                  pdfFile={activeTab.file}
                  onHighlight={() => {}}
                  onClose={() => setQaOpen(false)}
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
              )}
            </div>

            {/* Right Sidebar - Citations/References */}
            <CitationSidebar
              selectedCitation={selectedCitation}
              onCitationSelect={setSelectedCitation}
              isOpen={citationSidebarOpen}
              onToggle={() => setCitationSidebarOpen(!citationSidebarOpen)}
            />

            {!qaOpen && (
              <button
                onClick={() => setQaOpen(true)}
                className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-110 hover:shadow-xl"
              >
                <MessageSquare className="h-6 w-6" />
              </button>
            )}

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