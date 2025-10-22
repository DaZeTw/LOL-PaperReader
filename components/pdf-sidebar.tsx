"use client"

import { useState } from "react"
import {
  ChevronRight,
  ChevronLeft,
  BookOpen,
  FileText,
  Target,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface PDFSidebarProps {
  pdfUrl: string
  numPages: number
  bookmarkPluginInstance: any
  thumbnailPluginInstance: any
  onClose: () => void
  onSectionSelect?: (bookmark: any) => void
}

export function PDFSidebar({
  pdfUrl,
  numPages,
  bookmarkPluginInstance,
  thumbnailPluginInstance,
  onClose,
}: PDFSidebarProps) {
  const { Bookmarks } = bookmarkPluginInstance
  const { Thumbnails } = thumbnailPluginInstance

  const [activeTab, setActiveTab] = useState<"outline" | "pages">("outline")
  const isOpen = !!pdfUrl

  // Loading UI
  if (!pdfUrl) {
    return (
      <>
        {!isOpen && (
          <button
            onClick={onClose}
            className="absolute left-0 top-1/2 z-10 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-border bg-background shadow-md transition-colors hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <aside
          className={cn(
            "flex flex-col border-r border-border bg-sidebar transition-all duration-300",
            isOpen ? "w-80" : "w-0 overflow-hidden",
          )}
        >
          <div className="flex h-full items-center justify-center p-6">
            <div className="text-center">
              <FileText className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
              <p className="font-mono text-sm text-muted-foreground">Loading PDF...</p>
            </div>
          </div>
        </aside>
      </>
    )
  }

  return (
    <>
      {!isOpen && (
        <button
          onClick={onClose}
          className="absolute left-0 top-1/2 z-10 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-border bg-background shadow-md transition-colors hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      )}      <aside className="flex flex-col h-full bg-background border-r border-border">
        {/* Header Toolbar */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2 flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab("outline")}
              className={cn(
                "rounded p-1.5 transition-colors",
                activeTab === "outline"
                  ? "bg-muted text-foreground"
                  : "hover:bg-muted text-muted-foreground",
              )}
              title="Document Outline"
            >
              <BookOpen className="h-4 w-4" />
            </button>

            <button
              onClick={() => setActiveTab("pages")}
              className={cn(
                "rounded p-1.5 transition-colors",
                activeTab === "pages"
                  ? "bg-muted text-foreground"
                  : "hover:bg-muted text-muted-foreground",
              )}
              title="Page Thumbnails"
            >
              <FileText className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1.5 transition-colors hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Document Info */}
        <div className="border-b border-border px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <p className="font-mono text-sm font-medium text-foreground">
              {activeTab === "outline" ? "Document Outline" : "Page Thumbnails"}
            </p>
            <Target className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Pages: {numPages}</p>
        </div>        {/* Scrollable content */}
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-2">
              {activeTab === "outline" ? (
                <div key={pdfUrl} className="outline-container">
                  <Bookmarks />
                </div>
              ) : (
                <div key={pdfUrl} className="thumbnails-container">
                  <Thumbnails />
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </aside>
    </>
  )
}
