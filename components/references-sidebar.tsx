"use client"

import React from "react"
import { ChevronLeft, ChevronRight, ExternalLink, BookOpen, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PaperReference } from "@/hooks/usePaperReferences"

interface ReferencesSidebarProps {
  references: PaperReference[]
  loading?: boolean
  error?: string | null
  isOpen?: boolean
  onToggle?: () => void
  onOpenReferencePDF?: (url: string, title: string) => void
}

const LINK_TYPE_INFO = {
  doi: {
    color: "bg-purple-100 border-purple-300 text-purple-900",
    label: "DOI",
    icon: "🔗",
  },
  arxiv: {
    color: "bg-blue-100 border-blue-300 text-blue-900",
    label: "arXiv",
    icon: "📄",
  },
  url: {
    color: "bg-green-100 border-green-300 text-green-900",
    label: "URL",
    icon: "🌐",
  },
  scholar: {
    color: "bg-gray-100 border-gray-300 text-gray-900",
    label: "Scholar",
    icon: "🎓",
  },
} as const

export function ReferencesSidebar({
  references,
  loading = false,
  error = null,
  isOpen = true,
  onToggle,
  onOpenReferencePDF,
}: ReferencesSidebarProps) {
  const handleOpenReference = (ref: PaperReference, event: React.MouseEvent) => {
    // IMPORTANT: Prevent any default behavior and stop propagation
    event.preventDefault()
    event.stopPropagation()
    
    if (!ref.link) {
      console.warn(`[ReferencesSidebar] Reference ${ref.id} has no link`)
      return
    }
    
    const title = ref.title || `Reference ${ref.id}`
    
    console.log(`[ReferencesSidebar] Processing reference click:`, {
      id: ref.id,
      link: ref.link,
      link_type: ref.link_type,
      hasCallback: !!onOpenReferencePDF
    })
    
    // If we have the callback and it's not a Scholar link, try to open in app
    if (onOpenReferencePDF && ref.link_type !== 'scholar') {
      console.log(`[ReferencesSidebar] Opening reference in app via callback:`, ref.link, ref.link_type)
      try {
        onOpenReferencePDF(ref.link, title)
      } catch (error) {
        console.error(`[ReferencesSidebar] Error calling onOpenReferencePDF:`, error)
        // Fallback to external link on error
        window.open(ref.link, "_blank", "noopener,noreferrer")
      }
    } else {
      // Fallback to external link for Scholar or if no callback
      console.log(`[ReferencesSidebar] Opening external link:`, ref.link)
      window.open(ref.link, "_blank", "noopener,noreferrer")
    }
  }

  return (
    <>
      {!isOpen && onToggle && (
        <button
          onClick={onToggle}
          className="absolute right-0 top-1/2 z-10 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-border bg-background shadow-md transition-colors hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
      <aside
        className={cn(
          "relative flex flex-col border-l border-border bg-sidebar transition-all duration-300 h-full",
          isOpen ? "w-96" : "w-0 overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/5 to-accent/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-mono text-lg font-semibold text-foreground">References</h2>
              <p className="font-mono text-xs text-muted-foreground">
                {references.length} {references.length === 1 ? "reference" : "references"}
              </p>
            </div>
          </div>
          {onToggle && (
            <button onClick={onToggle} className="rounded p-1.5 transition-colors hover:bg-muted">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading references...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-6">
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          ) : references.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-6">
              <BookOpen className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground text-center">
                No references found in this paper
              </p>
            </div>
          ) : (
            <div className="space-y-4 p-6">
              {references.map((ref) => {
                const linkInfo = ref.link_type
                  ? LINK_TYPE_INFO[ref.link_type]
                  : LINK_TYPE_INFO.scholar

                return (
                  <div
                    key={ref.id}
                    className="group rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md"
                  >
                    {/* Reference Number */}
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span className="flex-shrink-0 font-mono text-sm font-semibold text-primary">
                        [{ref.id}]
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          "ml-auto flex-shrink-0 h-7 gap-1.5 text-xs",
                          linkInfo.color
                        )}
                        onClick={(e) => handleOpenReference(ref, e)}
                      >
                        <span>{linkInfo.icon}</span>
                        <span>{linkInfo.label}</span>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Title */}
                    {ref.title && (
                      <h3 className="mb-2 font-mono text-sm font-semibold text-foreground line-clamp-2">
                        {ref.title}
                      </h3>
                    )}

                    {/* Authors and Year */}
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {ref.authors && ref.authors.length > 0 && (
                        <span className="font-mono">
                          {ref.authors.slice(0, 3).join(", ")}
                          {ref.authors.length > 3 && " et al."}
                        </span>
                      )}
                      {ref.year && (
                        <span className="font-mono font-semibold">({ref.year})</span>
                      )}
                    </div>

                    {/* Venue */}
                    {ref.venue && (
                      <p className="mb-2 font-mono text-xs italic text-muted-foreground line-clamp-1">
                        {ref.venue}
                      </p>
                    )}

                    {/* Metadata badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {ref.doi && (
                        <span className="rounded-md bg-purple-100 px-2 py-0.5 font-mono text-xs text-purple-900">
                          DOI: {ref.doi.slice(0, 20)}
                          {ref.doi.length > 20 ? "..." : ""}
                        </span>
                      )}
                      {ref.arxiv_id && (
                        <span className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs text-blue-900">
                          arXiv: {ref.arxiv_id}
                        </span>
                      )}
                    </div>

                    {/* Raw text fallback (only if no title) */}
                    {!ref.title && (
                      <p className="mt-2 font-mono text-xs text-muted-foreground line-clamp-3">
                        {ref.raw_text.substring(0, 200)}
                        {ref.raw_text.length > 200 ? "..." : ""}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
