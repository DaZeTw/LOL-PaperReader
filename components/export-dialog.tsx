"use client"

import { useState } from "react"
import { Download, FileText, FileJson, Loader2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import type { BookmarkItem } from "@/components/bookmark-panel"

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
  bookmarks: BookmarkItem[]
  pdfFileName: string
  qaHistory?: Array<{
    question: string
    answer: string
    timestamp: Date
  }>
}

export function ExportDialog({
  isOpen,
  onClose,
  bookmarks,
  pdfFileName,
  qaHistory = [],
}: ExportDialogProps) {
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<"markdown" | "json">("markdown")
  const { toast } = useToast()

  const generateMarkdown = () => {
    const lines: string[] = []

    lines.push(`# Study Notes: ${pdfFileName}`)
    lines.push(``)
    lines.push(`Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`)
    lines.push(``)
    lines.push(`---`)
    lines.push(``)

    // Bookmarks section
    if (bookmarks.length > 0) {
      lines.push(`## 📑 Bookmarks (${bookmarks.length})`)
      lines.push(``)

      const sortedBookmarks = [...bookmarks].sort((a, b) => a.page - b.page)

      sortedBookmarks.forEach((bookmark, idx) => {
        lines.push(`### ${idx + 1}. Page ${bookmark.page}`)
        lines.push(``)
        lines.push(bookmark.note)
        lines.push(``)
        lines.push(`*Added on ${new Date(bookmark.timestamp).toLocaleDateString()} at ${new Date(bookmark.timestamp).toLocaleTimeString()}*`)
        lines.push(``)
      })

      lines.push(`---`)
      lines.push(``)
    }

    // Q&A History section
    if (qaHistory.length > 0) {
      lines.push(`## 💬 Q&A History (${qaHistory.length})`)
      lines.push(``)

      qaHistory.forEach((qa, idx) => {
        lines.push(`### Q${idx + 1}: ${qa.question}`)
        lines.push(``)
        lines.push(`**Answer:**`)
        lines.push(``)
        lines.push(qa.answer)
        lines.push(``)
        lines.push(`*Asked on ${new Date(qa.timestamp).toLocaleDateString()} at ${new Date(qa.timestamp).toLocaleTimeString()}*`)
        lines.push(``)
      })

      lines.push(`---`)
      lines.push(``)
    }

    // Summary statistics
    lines.push(`## 📊 Summary`)
    lines.push(``)
    lines.push(`- **Total Bookmarks:** ${bookmarks.length}`)
    lines.push(`- **Total Questions Asked:** ${qaHistory.length}`)
    lines.push(`- **Document:** ${pdfFileName}`)
    lines.push(``)
    lines.push(`---`)
    lines.push(``)
    lines.push(`*Exported from Scholar Reader*`)

    return lines.join('\n')
  }

  const generateJSON = () => {
    return JSON.stringify(
      {
        metadata: {
          fileName: pdfFileName,
          exportDate: new Date().toISOString(),
          totalBookmarks: bookmarks.length,
          totalQuestions: qaHistory.length,
        },
        bookmarks: bookmarks.map((b) => ({
          page: b.page,
          note: b.note,
          section: b.section,
          color: b.color,
          timestamp: b.timestamp,
        })),
        qaHistory: qaHistory.map((qa) => ({
          question: qa.question,
          answer: qa.answer,
          timestamp: qa.timestamp,
        })),
      },
      null,
      2
    )
  }

  const handleExport = async () => {
    setExporting(true)

    try {
      let content: string
      let filename: string
      let mimeType: string

      if (exportFormat === "markdown") {
        content = generateMarkdown()
        filename = `${pdfFileName.replace(".pdf", "")}_notes.md`
        mimeType = "text/markdown"
      } else {
        content = generateJSON()
        filename = `${pdfFileName.replace(".pdf", "")}_notes.json`
        mimeType = "application/json"
      }

      // Create blob and download
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Export successful",
        description: `Your notes have been exported as ${filename}`,
      })

      setTimeout(() => {
        onClose()
      }, 1000)
    } catch (error) {
      console.error("[v0] Export error:", error)
      toast({
        title: "Export failed",
        description: "There was an error exporting your notes",
        variant: "destructive",
      })
    } finally {
      setTimeout(() => setExporting(false), 1000)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-lg border-2 border-primary/20 bg-background shadow-2xl">
        {/* Header */}
        <div className="border-b border-border bg-gradient-to-r from-primary/5 to-accent/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-mono text-lg font-semibold text-foreground">Export Annotations</h2>
              <p className="font-mono text-xs text-muted-foreground">
                Download your bookmarks and Q&A history
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 p-6">
          {/* Summary */}
          <div className="rounded-lg bg-muted/30 p-4">
            <h3 className="mb-2 font-mono text-sm font-semibold text-foreground">Export Summary</h3>
            <div className="space-y-1 font-mono text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Document:</span>
                <span className="font-medium text-foreground">{pdfFileName}</span>
              </div>
              <div className="flex justify-between">
                <span>Bookmarks:</span>
                <span className="font-medium text-foreground">{bookmarks.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Q&A History:</span>
                <span className="font-medium text-foreground">{qaHistory.length}</span>
              </div>
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <label className="mb-2 block font-mono text-sm font-medium text-foreground">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setExportFormat("markdown")}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                  exportFormat === "markdown"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/30 hover:border-primary/50"
                }`}
              >
                <FileText className="h-8 w-8 text-primary" />
                <div className="text-center">
                  <p className="font-mono text-sm font-medium text-foreground">Markdown</p>
                  <p className="font-mono text-xs text-muted-foreground">.md file</p>
                </div>
                {exportFormat === "markdown" && (
                  <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />
                )}
              </button>

              <button
                onClick={() => setExportFormat("json")}
                className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                  exportFormat === "json"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/30 hover:border-primary/50"
                }`}
              >
                <FileJson className="h-8 w-8 text-primary" />
                <div className="text-center">
                  <p className="font-mono text-sm font-medium text-foreground">JSON</p>
                  <p className="font-mono text-xs text-muted-foreground">.json file</p>
                </div>
                {exportFormat === "json" && (
                  <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />
                )}
              </button>
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="mb-2 block font-mono text-sm font-medium text-foreground">
              Preview
            </label>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
              <pre className="font-mono text-xs text-muted-foreground">
                {exportFormat === "markdown"
                  ? generateMarkdown().split("\n").slice(0, 15).join("\n") + "\n..."
                  : generateJSON().split("\n").slice(0, 15).join("\n") + "\n..."}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting} className="gap-2">
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  )
}
