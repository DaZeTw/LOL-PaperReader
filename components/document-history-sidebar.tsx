"use client"

import { useMemo } from "react"
import { ChevronRight, ChevronLeft, FileText, RefreshCw, Loader2, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { UploadedDocument } from "@/components/pdf-upload"

interface DocumentHistorySidebarProps {
  documents: UploadedDocument[]
  loading: boolean
  error?: string | null
  hasLoaded: boolean
  isOpen: boolean
  onToggle: () => void
  onRefresh: () => void
  onOpenDocument: (document: UploadedDocument) => void
  activeFileName?: string
  openingDocumentId?: string | null
  side?: "left" | "right"
}

export function DocumentHistorySidebar({
  documents,
  loading,
  error,
  hasLoaded,
  isOpen,
  onToggle,
  onRefresh,
  onOpenDocument,
  activeFileName,
  openingDocumentId,
  side = "left",
}: DocumentHistorySidebarProps) {
  const listContent = useMemo(() => {
    // Only show full loading screen on initial load, not on refresh
    if (!hasLoaded) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading documents...
          </div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="font-mono text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            Try again
          </Button>
        </div>
      )
    }

    if (documents.length === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="font-mono text-sm text-muted-foreground">No uploaded PDFs yet.</p>
          <p className="font-mono text-xs text-muted-foreground/70">
            Upload a document to quickly access it here.
          </p>
        </div>
      )
    }

    return (
      <div className="flex-1 overflow-y-auto px-4 py-3 relative">
        {loading && (
          <div className="absolute top-2 right-4 z-10 flex items-center gap-2 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
            <Loader2 className="h-3 w-3 animate-spin" />
            Refreshing...
          </div>
        )}
        <div className="space-y-2">
          {documents.map((doc) => {
            const isActive = activeFileName && doc.original_filename === activeFileName
            const isOpening = openingDocumentId === doc._id
            return (
              <button
                key={doc._id}
                onClick={() => onOpenDocument(doc)}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-left transition hover:border-primary/60 hover:bg-primary/5",
                  isActive && "border-primary bg-primary/10 text-primary-foreground",
                  isOpening && "pointer-events-none opacity-70",
                )}
                disabled={isOpening}
              >
                <div className={cn("mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-muted/60")}>
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-medium text-foreground">
                    {doc.title || doc.original_filename}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{doc.original_filename}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {doc.num_pages && doc.num_pages > 0 && <span>{doc.num_pages} pages</span>}
                    {doc.file_size && <span>{`${(doc.file_size / (1024 * 1024)).toFixed(2)} MB`}</span>}
                  </div>
                </div>
                {isOpening && <Loader2 className="mt-1 h-4 w-4 animate-spin text-primary" />}
              </button>
            )
          })}
        </div>
      </div>
    )
  }, [documents, activeFileName, loading, error, hasLoaded, onOpenDocument, onRefresh, openingDocumentId])

  return (
    <div
      className={cn(
        "relative h-full",
        side === "right" && "order-last",
      )}
    >
      {!isOpen && (
        <button
          onClick={onToggle}
          className={cn(
            "absolute z-20 flex h-20 w-9 items-center justify-center rounded border border-border bg-background shadow-lg transition hover:bg-muted",
            side === "left"
              ? "left-0 top-1/3 -translate-y-1/2 -translate-x-full rounded-r-xl"
              : "right-0 top-1/3 -translate-y-1/2 rounded-l-xl",
          )}
          aria-label="Open uploaded PDFs panel"
        >
          <span className="flex flex-col items-center gap-1">
            <History className="h-4 w-4 text-primary" />
            {side === "left" ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            )}
          </span>
        </button>
      )}

      <aside
        className={cn(
          "relative flex h-full w-80 flex-col bg-sidebar transition-all duration-300",
          side === "left" ? "border-r border-border" : "border-l border-border",
          isOpen ? "opacity-100" : "w-0 overflow-hidden opacity-0",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between border-b border-border px-5 py-4",
            side === "left"
              ? "bg-gradient-to-r from-accent/5 to-primary/10"
              : "bg-gradient-to-l from-accent/5 to-primary/10",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <History className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-mono text-lg font-semibold text-foreground">Uploaded PDFs</h2>
              <p className="font-mono text-xs text-muted-foreground">Access your saved documents anytime</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh uploaded PDFs"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <button
              onClick={onToggle}
              className="rounded p-1.5 transition-colors hover:bg-muted"
              aria-label="Close uploaded PDFs panel"
            >
              {side === "left" ? (
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>

        {listContent}
      </aside>
    </div>
  )
}

