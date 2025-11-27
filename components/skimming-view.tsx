"use client"

import { useState, useEffect } from "react"
import { ChevronDown, ChevronRight, FileText, Loader2, Eye, AlertCircle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface BackendChunk {
  doc_id: string
  title: string
  page: number
  text: string
}

interface SectionData {
  title: string
  page: number
  chunks: BackendChunk[]
  isExpanded: boolean
  totalChars: number
}

interface SkimmingViewProps {
  file: File
  numPages: number
  onNavigateToPage?: (page: number) => void
  onExitSkimming?: () => void
}

export function SkimmingView({
  file,
  numPages,
  onNavigateToPage,
  onExitSkimming,
}: SkimmingViewProps) {
  const [sections, setSections] = useState<SectionData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set())

  // Fetch chunks from backend
  useEffect(() => {
    const fetchChunks = async () => {
      setIsLoading(true)
      setError(null)

      try {
        console.log("[SkimmingView] Fetching chunks from backend...")
        const response = await fetch("/api/pdf/chunks")

        if (!response.ok) {
          throw new Error(`Failed to fetch chunks: ${response.statusText}`)
        }

        const data = await response.json()
        console.log("[SkimmingView] Received data:", data)

        if (data.status === "empty" || !data.chunks || data.chunks.length === 0) {
          setError("No content available yet. Please wait for the PDF to finish processing.")
          setSections([])
          return
        }

        if (data.status === "error") {
          throw new Error(data.error || "Failed to load chunks")
        }

        // Group chunks by section title
        const sectionMap = new Map<string, { page: number; chunks: BackendChunk[] }>()

        data.chunks.forEach((chunk: BackendChunk) => {
          const title = chunk.title || "Untitled Section"

          if (!sectionMap.has(title)) {
            sectionMap.set(title, {
              page: chunk.page || 1,
              chunks: [],
            })
          }

          sectionMap.get(title)!.chunks.push(chunk)
        })

        // Convert to sections array
        const sectionsArray: SectionData[] = Array.from(sectionMap.entries()).map(
          ([title, data]) => ({
            title,
            page: data.page,
            chunks: data.chunks,
            isExpanded: false,
            totalChars: data.chunks.reduce((sum, c) => sum + (c.text?.length || 0), 0),
          })
        )

        // Sort by page number
        sectionsArray.sort((a, b) => a.page - b.page)

        console.log("[SkimmingView] Created", sectionsArray.length, "sections from", data.chunks.length, "chunks")
        setSections(sectionsArray)

        // Auto-expand first 3 sections
        setExpandedSections(new Set([0, 1, 2].filter(i => i < sectionsArray.length)))

      } catch (err: any) {
        console.error("[SkimmingView] Error fetching chunks:", err)
        setError(err.message || "Failed to load document structure")
      } finally {
        setIsLoading(false)
      }
    }

    fetchChunks()
  }, [file])

  // Toggle section expansion
  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(index)) {
        newExpanded.delete(index)
      } else {
        newExpanded.add(index)
      }
      return newExpanded
    })
  }

  // Navigate to section
  const handleNavigateToSection = (section: SectionData) => {
    onNavigateToPage?.(section.page)
    onExitSkimming?.()
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'e' || e.key === 'E') {
        setExpandedSections(new Set(sections.map((_, idx) => idx)))
      }
      if (e.key === 'c' || e.key === 'C') {
        setExpandedSections(new Set())
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sections])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-12 w-12 animate-spin text-primary" />
          <p className="font-mono text-sm font-medium text-foreground">
            Loading document structure...
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Fetching parsed sections from backend
          </p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-destructive" />
          <p className="font-mono text-sm font-medium text-foreground mb-2">
            Failed to load document structure
          </p>
          <p className="font-mono text-xs text-muted-foreground mb-4">
            {error}
          </p>
          <Button variant="outline" onClick={onExitSkimming}>
            Exit Skimming Mode
          </Button>
        </div>
      </div>
    )
  }

  // Empty state
  if (sections.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <FileText className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <p className="font-mono text-sm text-muted-foreground">
            No sections found in document
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-r from-primary/5 to-accent/5 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 ring-2 ring-primary/20">
              <Eye className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-mono text-lg font-semibold text-foreground">
                Skimming Mode
              </h2>
              <p className="font-mono text-xs text-muted-foreground">
                {sections.length} sections · {numPages} pages · Press <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs">E</kbd> to expand all, <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs">C</kbd> to collapse
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const allIndices = new Set(sections.map((_, idx) => idx))
                setExpandedSections(allIndices)
                sections.forEach((section, idx) => {
                  if (!section.preview) extractPreview(idx)
                })
              }}
              className="gap-2 text-xs h-8"
            >
              Expand All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpandedSections(new Set())}
              className="gap-2 text-xs h-8"
            >
              Collapse All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onExitSkimming}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Exit
            </Button>
          </div>
        </div>
      </div>

      {/* Sections List */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-4">
          {sections.map((section, index) => {
            const isExpanded = expandedSections.has(index)
            const preview = section.chunks[0]?.text?.slice(0, 100) || ""
            const chunkCount = section.chunks.length

            return (
              <div
                key={index}
                className={cn(
                  "rounded-lg border border-border bg-card transition-all duration-300 ease-in-out",
                  isExpanded && "shadow-lg ring-2 ring-primary/10",
                  "hover:shadow-md hover:border-primary/30"
                )}
              >
                {/* Section Header */}
                <div className="flex w-full items-start gap-3 p-4 transition-colors hover:bg-muted/50">
                  <button
                    onClick={() => toggleSection(index)}
                    className="mt-0.5 flex-shrink-0 hover:opacity-70 transition-opacity"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  <div
                    onClick={() => toggleSection(index)}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <h3 className="font-mono text-sm font-medium text-foreground line-clamp-2">
                      {section.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                        Page {section.page}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                        {chunkCount} chunk{chunkCount !== 1 ? 's' : ''}
                      </span>
                      {!isExpanded && preview && (
                        <span className="font-mono text-xs text-muted-foreground line-clamp-1">
                          {preview}...
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleNavigateToSection(section)
                    }}
                    className="flex-shrink-0 h-8"
                  >
                    Jump
                  </Button>
                </div>

                {/* Section Content (Expanded) */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-3">
                      {section.chunks.map((chunk, chunkIdx) => (
                        <div key={chunkIdx} className="space-y-1">
                          {chunkCount > 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">
                                Chunk {chunkIdx + 1} of {chunkCount}
                              </span>
                            </div>
                          )}
                          <p className="font-mono text-sm leading-relaxed text-foreground">
                            {chunk.text}
                          </p>
                          {chunkIdx < section.chunks.length - 1 && (
                            <div className="border-t border-border/50 my-2" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
