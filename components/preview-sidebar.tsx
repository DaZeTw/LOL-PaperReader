"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ChevronRight, ChevronLeft, FileText, Upload, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/contexts/WorkspaceContext"

interface PreviewSidebarProps {
  file: File
  documentId?: string
  tabId: string
  totalPages: number
  currentPage: number
  isOpen: boolean
  onToggle: () => void
  // Removed: onImportSuccess - not needed, updateTabMode handles it
}

export function PreviewSidebar({
  file,
  documentId,
  tabId,
  totalPages,
  currentPage,
  isOpen,
  onToggle,
}: PreviewSidebarProps) {
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { importToLibrary } = useWorkspace()

  const handleImport = async () => {
    setImporting(true)
    setError(null)

    try {
      console.log('[PreviewSidebar] Starting import:', { 
        tabId, 
        fileName: file.name,
        fileSize: file.size 
      })

      // Extract title from filename (remove .pdf extension)
      const title = file.name.replace(/\.pdf$/i, '').trim()

      // Call workspace context to import
      // This will automatically call updateTabMode when successful
      const newDocumentId = await importToLibrary(tabId, file, title)

      if (newDocumentId) {
        console.log('[PreviewSidebar] Import successful:', newDocumentId)
        setImported(true)
        // No need for onImportSuccess callback - updateTabMode already called
      } else {
        throw new Error('Import failed - no document ID returned')
      }
    } catch (err) {
      console.error("[PreviewSidebar] Import failed:", err)
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className={cn(
          "absolute right-0 top-1/2 z-20 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-border bg-background shadow-md transition-all hover:w-8",
          isOpen && "right-96"
        )}
        aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
      >
        {isOpen ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      {/* Sidebar Panel */}
      <div
        className={cn(
          "absolute right-0 top-0 z-10 h-full w-96 border-l border-border bg-background shadow-lg transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Preview Mode</h2>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* File Info */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">File Name</h3>
                <p className="mt-1 text-sm break-words">{file.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Pages</h3>
                  <p className="mt-1 text-sm">{totalPages}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Current</h3>
                  <p className="mt-1 text-sm">{currentPage}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Size</h3>
                <p className="mt-1 text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>

              {documentId && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Document ID</h3>
                  <p className="mt-1 text-xs font-mono text-muted-foreground/70 break-all">
                    {documentId}
                  </p>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="my-6 border-t border-border" />

            {/* Import Section */}
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">Import to Library</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add this document to your library to unlock advanced features:
                </p>
              </div>

              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  <span>AI-powered Q&A chat</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  <span>Smart skimming highlights</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  <span>Automatic summaries</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  <span>Reference extraction</span>
                </li>
              </ul>

              <Button
                onClick={handleImport}
                disabled={importing || imported}
                className="w-full"
                size="lg"
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : imported ? (
                  <>
                    ✓ Imported Successfully
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import to Library
                  </>
                )}
              </Button>

              {imported && (
                <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3">
                  <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                    ✓ Document imported successfully!
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Processing will begin shortly. You can now access all advanced features.
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3">
                  <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                    ✗ Import failed
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {error}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}