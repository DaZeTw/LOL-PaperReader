"use client"

import type React from "react"

import { useState } from "react"
import { FileText, MessageSquare, X, Plus, Download, Keyboard } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { PDFUpload } from "@/components/pdf-upload"
import { PDFViewer } from "@/components/pdf-viewer"
import { ParsedSidebar } from "@/components/parsed-sidebar"
import { CitationSidebar } from "@/components/citation-sidebar"
import { AnnotationToolbar } from "@/components/annotation-toolbar"
import { QAInterface } from "@/components/qa-interface"
import { BookmarkPanel, type BookmarkItem } from "@/components/bookmark-panel"
import { KeyboardShortcutsPanel, useKeyboardShortcuts } from "@/components/keyboard-shortcuts-panel"
import { ExportDialog } from "@/components/export-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PDFTab {
  id: string
  file: File
  parsedData: any
  selectedSection: string | null
  bookmarks: BookmarkItem[]
  qaHistory: Array<{
    question: string
    answer: string
    timestamp: Date
  }>
}

export function PDFReader() {
  const [tabs, setTabs] = useState<PDFTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [selectedCitation, setSelectedCitation] = useState<any>(null)
  const [highlightColor, setHighlightColor] = useState("#fef08a")
  const [annotationMode, setAnnotationMode] = useState<"highlight" | "erase" | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [citationSidebarOpen, setCitationSidebarOpen] = useState(true)
  const [qaOpen, setQaOpen] = useState(false)
  const [bookmarkPanelOpen, setBookmarkPanelOpen] = useState(false)
  const [shortcutsPanelOpen, setShortcutsPanelOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pdfViewerHandlers, setPdfViewerHandlers] = useState<any>(null)

  const activeTab = tabs.find((tab) => tab.id === activeTabId)

  const handleFileSelect = (file: File, parsedData: any) => {
    console.log("[v0] Creating new tab for file:", file.name)
    console.log("[v0] Parsed data:", parsedData)

    const newTab: PDFTab = {
      id: Date.now().toString(),
      file,
      parsedData,
      selectedSection: null,
      bookmarks: [],
      qaHistory: [],
    }

    setTabs((prev) => {
      const newTabs = [...prev, newTab]
      console.log("[v0] Updated tabs:", newTabs.length)
      return newTabs
    })
    setActiveTabId(newTab.id)
    console.log("[v0] Set active tab to:", newTab.id)
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

  const handleSectionSelect = (sectionId: string) => {
    if (!activeTabId) return
    setTabs((prev) => prev.map((tab) => (tab.id === activeTabId ? { ...tab, selectedSection: sectionId } : tab)))
  }

  // Bookmark handlers
  const handleAddBookmark = (bookmark: Omit<BookmarkItem, "id" | "timestamp">) => {
    if (!activeTabId) return
    const newBookmark: BookmarkItem = {
      ...bookmark,
      id: Date.now().toString(),
      timestamp: new Date(),
    }
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId ? { ...tab, bookmarks: [...tab.bookmarks, newBookmark] } : tab
      )
    )
  }

  const handleRemoveBookmark = (bookmarkId: string) => {
    if (!activeTabId) return
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId
          ? { ...tab, bookmarks: tab.bookmarks.filter((b) => b.id !== bookmarkId) }
          : tab
      )
    )
  }

  const handleUpdateBookmark = (bookmarkId: string, note: string) => {
    if (!activeTabId) return
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId
          ? {
              ...tab,
              bookmarks: tab.bookmarks.map((b) => (b.id === bookmarkId ? { ...b, note } : b)),
            }
          : tab
      )
    )
  }

  const handleJumpToBookmark = (page: number) => {
    pdfViewerHandlers?.jumpToPage?.(page)
  }

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNextPage: () => pdfViewerHandlers?.handleNextPage?.(),
    onPrevPage: () => pdfViewerHandlers?.handlePrevPage?.(),
    onZoomIn: () => pdfViewerHandlers?.handleZoomIn?.(),
    onZoomOut: () => pdfViewerHandlers?.handleZoomOut?.(),
    onResetZoom: () => pdfViewerHandlers?.handleResetZoom?.(),
    onFitWidth: () => pdfViewerHandlers?.handleFitWidth?.(),
    onSearch: () => pdfViewerHandlers?.handleOpenSearch?.(),
    onAddBookmark: () => setBookmarkPanelOpen(true),
    onShowBookmarks: () => setBookmarkPanelOpen(!bookmarkPanelOpen),
    onOpenQA: () => setQaOpen(!qaOpen),
    onToggleLeftSidebar: () => setSidebarOpen(!sidebarOpen),
    onToggleRightSidebar: () => setCitationSidebarOpen(!citationSidebarOpen),
    onShowShortcuts: () => setShortcutsPanelOpen(true),
    onExportAnnotations: () => setExportDialogOpen(true),
    onGoToPage: () => pdfViewerHandlers?.focusPageInput?.(),
  })

  console.log("[v0] Render - tabs:", tabs.length, "activeTab:", activeTab?.file.name)

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
          {activeTab && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExportDialogOpen(true)}
                className="gap-2"
                title="Export annotations (Ctrl+E)"
              >
                <Download className="h-4 w-4" />
                <span className="hidden md:inline">Export</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShortcutsPanelOpen(true)}
                className="h-8 w-8"
                title="Keyboard shortcuts (?)"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </>
          )}
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
            <ParsedSidebar
              parsedData={activeTab.parsedData}
              selectedSection={activeTab.selectedSection}
              onSectionSelect={handleSectionSelect}
              isOpen={sidebarOpen}
              onToggle={() => setSidebarOpen(!sidebarOpen)}
            />

            {/* Center - PDF Viewer with Annotation Toolbar */}
            <div className="relative flex flex-1 flex-col">
              <PDFViewer
                file={activeTab.file}
                selectedSection={activeTab.selectedSection}
                highlightColor={highlightColor}
                annotationMode={annotationMode}
                onCitationClick={setSelectedCitation}
                parsedData={activeTab.parsedData}
                onPageChange={setCurrentPage}
                onHandlersReady={setPdfViewerHandlers}
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

            {/* Bookmark Panel */}
            <BookmarkPanel
              bookmarks={activeTab.bookmarks}
              currentPage={currentPage}
              onAddBookmark={handleAddBookmark}
              onRemoveBookmark={handleRemoveBookmark}
              onUpdateBookmark={handleUpdateBookmark}
              onJumpToBookmark={handleJumpToBookmark}
              isOpen={bookmarkPanelOpen}
              onToggle={() => setBookmarkPanelOpen(!bookmarkPanelOpen)}
            />

            {/* Keyboard Shortcuts Panel */}
            <KeyboardShortcutsPanel
              isOpen={shortcutsPanelOpen}
              onClose={() => setShortcutsPanelOpen(false)}
            />

            {/* Export Dialog */}
            <ExportDialog
              isOpen={exportDialogOpen}
              onClose={() => setExportDialogOpen(false)}
              bookmarks={activeTab.bookmarks}
              pdfFileName={activeTab.file.name}
              qaHistory={activeTab.qaHistory}
            />
          </>
        )}
      </div>
    </div>
  )
}
