"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, RotateCcw, Type, FileText } from "lucide-react"
import { DefinitionPopup } from "@/components/definition-popup"
import { cn } from "@/lib/utils"

interface Section {
  id: string
  title: string
  content: string
  page: number
}

interface SemanticHTMLViewerProps {
  // Option 1: Use parsed data (original behavior)
  parsedData?: {
    title?: string
    sections?: Section[]
    references?: Array<{
      id: string
      number: number
      text: string
      authors?: string
      title?: string
      year?: string
      journal?: string
      doi?: string
      url?: string
    }>
    metadata?: {
      pages?: number
      author?: string
      date?: string
    }
  }
  // Option 2: Use pdf2htmlEX HTML output
  htmlContent?: string
  cssContent?: string
  selectedSection?: string | null
  onCitationClick?: (citation: any) => void
  className?: string
  // State persistence
  viewState?: {
    semanticScrollTop?: number
    semanticFontSize?: number
    semanticZoom?: number
  }
  onViewStateChange?: (updates: {
    semanticScrollTop?: number
    semanticFontSize?: number
    semanticZoom?: number
  }) => void
}

interface DefinitionPopupState {
  term: string
  position: { x: number; y: number }
}

export function SemanticHTMLViewer({
  parsedData,
  htmlContent,
  cssContent,
  selectedSection = null,
  onCitationClick,
  className,
  viewState,
  onViewStateChange,
}: SemanticHTMLViewerProps) {
  const [fontSize, setFontSize] = useState(viewState?.semanticFontSize || 16)
  const [zoom, setZoom] = useState(viewState?.semanticZoom || 1.0)
  const [lineHeight, setLineHeight] = useState(1.8)
  const [definitionPopup, setDefinitionPopup] = useState<DefinitionPopupState | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<{ [key: string]: HTMLElement | null }>({})
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollViewportRef = useRef<HTMLDivElement | null>(null)
  const isRestoringScroll = useRef(false)

  // Determine which mode we're in
  const isPdf2HtmlMode = !!htmlContent

  // Get scroll viewport reference
  useEffect(() => {
    if (scrollAreaRef.current) {
      // ScrollArea component wraps content in a viewport div
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement
      if (viewport) {
        scrollViewportRef.current = viewport
      }
    }
  }, [])

  // Restore scroll position when component mounts or viewState changes
  useEffect(() => {
    if (viewState?.semanticScrollTop !== undefined && scrollViewportRef.current && !isRestoringScroll.current) {
      isRestoringScroll.current = true
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (scrollViewportRef.current) {
          scrollViewportRef.current.scrollTop = viewState.semanticScrollTop
        }
        // Reset flag after a short delay
        setTimeout(() => {
          isRestoringScroll.current = false
        }, 100)
      })
    }
  }, [viewState?.semanticScrollTop])

  // Save scroll position when scrolling
  useEffect(() => {
    const viewport = scrollViewportRef.current
    if (!viewport || !onViewStateChange) return

    const handleScroll = () => {
      if (isRestoringScroll.current) return

      const scrollTop = viewport.scrollTop
      onViewStateChange({ semanticScrollTop: scrollTop })
    }

    // Throttle scroll events
    let timeoutId: NodeJS.Timeout
    const throttledScroll = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(handleScroll, 150)
    }

    viewport.addEventListener('scroll', throttledScroll)
    return () => {
      viewport.removeEventListener('scroll', throttledScroll)
      clearTimeout(timeoutId)
    }
  }, [onViewStateChange])

  // Scroll to selected section (takes priority over saved scroll position)
  useEffect(() => {
    if (selectedSection && sectionRefs.current[selectedSection]) {
      sectionRefs.current[selectedSection]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }
  }, [selectedSection])

  // Inject pdf2htmlEX CSS if provided
  useEffect(() => {
    if (cssContent && isPdf2HtmlMode) {
      const styleId = "pdf2htmlex-styles"
      let styleElement = document.getElementById(styleId) as HTMLStyleElement

      if (!styleElement) {
        styleElement = document.createElement("style")
        styleElement.id = styleId
        document.head.appendChild(styleElement)
      }

      styleElement.textContent = cssContent

      return () => {
        // Cleanup on unmount
        const element = document.getElementById(styleId)
        element?.remove()
      }
    }
  }, [cssContent, isPdf2HtmlMode])

  // Handle citation clicks in pdf2htmlEX HTML
  useEffect(() => {
    if (isPdf2HtmlMode && contentRef.current && onCitationClick) {
      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        // Look for citation links (pdf2htmlEX typically uses <a> tags)
        const citationLink = target.closest('a[href^="#"]')
        if (citationLink) {
          e.preventDefault()
          const href = citationLink.getAttribute("href")
          if (href) {
            onCitationClick({ id: href, element: citationLink })
          }
        }
      }

      contentRef.current.addEventListener("click", handleClick)
      return () => {
        contentRef.current?.removeEventListener("click", handleClick)
      }
    }
  }, [isPdf2HtmlMode, onCitationClick])

  // Handle term selection for definitions (ScholarPhi-style)
  useEffect(() => {
    if (!contentRef.current) return

    const handleDoubleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // Don't show definition popup if clicking on citation links
      if (target.closest('a[href^="#"]')) {
        return
      }

      // Get selected text
      const selection = window.getSelection()
      const selectedText = selection?.toString().trim()

      if (!selectedText || selectedText.length < 2) return

      // Filter out non-word selections (like punctuation only)
      if (!/[a-zA-Z]/.test(selectedText)) return

      // Clean the selected term (remove punctuation at start/end)
      const cleanedTerm = selectedText.replace(/^[^\w]+|[^\w]+$/g, "")

      if (cleanedTerm.length < 2) return

      // Get selection position for popup
      const range = selection?.getRangeAt(0)
      if (!range) return

      const rect = range.getBoundingClientRect()

      setDefinitionPopup({
        term: cleanedTerm,
        position: {
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        },
      })

      // Clear text selection
      selection?.removeAllRanges()
    }

    const container = contentRef.current
    container.addEventListener("dblclick", handleDoubleClick)

    return () => {
      container.removeEventListener("dblclick", handleDoubleClick)
    }
  }, [])

  const handleZoomIn = () => {
    if (isPdf2HtmlMode) {
      const newZoom = Math.min(zoom + 0.1, 2.0)
      setZoom(newZoom)
      onViewStateChange?.({ semanticZoom: newZoom })
    } else {
      const newFontSize = Math.min(fontSize + 2, 32)
      setFontSize(newFontSize)
      onViewStateChange?.({ semanticFontSize: newFontSize })
    }
  }

  const handleZoomOut = () => {
    if (isPdf2HtmlMode) {
      const newZoom = Math.max(zoom - 0.1, 0.5)
      setZoom(newZoom)
      onViewStateChange?.({ semanticZoom: newZoom })
    } else {
      const newFontSize = Math.max(fontSize - 2, 12)
      setFontSize(newFontSize)
      onViewStateChange?.({ semanticFontSize: newFontSize })
    }
  }

  const handleResetZoom = () => {
    if (isPdf2HtmlMode) {
      setZoom(1.0)
      onViewStateChange?.({ semanticZoom: 1.0 })
    } else {
      setFontSize(16)
      setLineHeight(1.8)
      onViewStateChange?.({ semanticFontSize: 16 })
    }
  }

  const { title = "", sections = [], references = [], metadata } = parsedData || {}

  return (
    <div className={cn("flex h-full flex-col bg-warm-bg", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-warm-border bg-warm-surface px-4 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          {isPdf2HtmlMode ? (
            <>
              <FileText className="h-4 w-4 text-warm-foreground" />
              <span className="font-mono text-sm font-medium text-warm-foreground">
                PDF2HTML View
              </span>
            </>
          ) : (
            <>
              <Type className="h-4 w-4 text-warm-foreground" />
              <span className="font-mono text-sm font-medium text-warm-foreground">
                Semantic View
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            title={isPdf2HtmlMode ? "Zoom out" : "Decrease font size"}
            className="h-8 w-8 text-warm-foreground hover:bg-warm-accent hover:text-warm-accent-foreground"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-[3rem] text-center font-mono text-sm text-warm-muted-foreground">
            {isPdf2HtmlMode ? `${Math.round(zoom * 100)}%` : `${fontSize}px`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            title={isPdf2HtmlMode ? "Zoom in" : "Increase font size"}
            className="h-8 w-8 text-warm-foreground hover:bg-warm-accent hover:text-warm-accent-foreground"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleResetZoom}
            title="Reset zoom"
            className="h-8 w-8 text-warm-foreground hover:bg-warm-accent hover:text-warm-accent-foreground"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        {isPdf2HtmlMode ? (
          // pdf2htmlEX mode - render raw HTML with zoom
          <div
            ref={contentRef}
            className="pdf2htmlex-container mx-auto origin-top"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
              width: `${100 / zoom}%`,
            }}
          >
            <div
              className="pdf2htmlex-content bg-white p-8"
              dangerouslySetInnerHTML={{ __html: htmlContent || "" }}
            />
          </div>
        ) : (
          // Semantic mode - original parsed data rendering
          <article
            className="mx-auto max-w-4xl px-8 py-12"
            style={{ fontSize: `${fontSize}px`, lineHeight }}
          >
            {/* Header with metadata */}
            <header className="mb-12 border-b border-warm-border pb-8">
              {title && (
                <h1 className="mb-4 font-serif text-4xl font-bold text-warm-heading">
                  {title}
                </h1>
              )}
              {metadata && (
                <div className="flex flex-wrap gap-4 text-sm text-warm-muted-foreground">
                  {metadata.author && (
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs uppercase tracking-wide text-warm-muted-foreground/70">
                        Author:
                      </span>
                      <span className="font-medium text-warm-foreground">
                        {metadata.author}
                      </span>
                    </div>
                  )}
                  {metadata.date && (
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs uppercase tracking-wide text-warm-muted-foreground/70">
                        Date:
                      </span>
                      <span className="font-medium text-warm-foreground">
                        {metadata.date}
                      </span>
                    </div>
                  )}
                  {metadata.pages && (
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs uppercase tracking-wide text-warm-muted-foreground/70">
                        Pages:
                      </span>
                      <span className="font-medium text-warm-foreground">
                        {metadata.pages}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </header>

            {/* Main Content Sections */}
            <main>
              {sections.map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  ref={(el) => {
                    sectionRefs.current[section.id] = el
                  }}
                  className={cn(
                    "mb-10 scroll-mt-4 rounded-lg transition-all",
                    selectedSection === section.id &&
                      "bg-warm-highlight/30 p-6 shadow-md ring-2 ring-warm-accent"
                  )}
                  aria-labelledby={`heading-${section.id}`}
                >
                  <h2
                    id={`heading-${section.id}`}
                    className="mb-4 font-serif text-2xl font-bold text-warm-heading"
                  >
                    {section.title}
                  </h2>
                  <div
                    className="prose prose-warm max-w-none space-y-4 text-warm-foreground"
                    dangerouslySetInnerHTML={{ __html: formatContent(section.content) }}
                  />
                  <div className="mt-2 text-right">
                    <a
                      href={`#page-${section.page}`}
                      className="font-mono text-xs text-warm-muted-foreground hover:text-warm-accent"
                    >
                      Page {section.page}
                    </a>
                  </div>
                </section>
              ))}
            </main>

            {/* References Section */}
            {references.length > 0 && (
              <aside className="mt-16 border-t border-warm-border pt-8" aria-labelledby="references-heading">
                <h2
                  id="references-heading"
                  className="mb-6 font-serif text-2xl font-bold text-warm-heading"
                >
                  References
                </h2>
                <ol className="space-y-4" role="list">
                  {references.map((ref) => (
                    <li
                      key={ref.id}
                      id={ref.id}
                      className="group relative pl-8 text-sm text-warm-foreground"
                      role="listitem"
                    >
                      <span className="absolute left-0 top-0 font-mono font-semibold text-warm-accent">
                        [{ref.number}]
                      </span>
                      <div className="space-y-1">
                        {ref.authors && (
                          <p className="font-medium text-warm-heading">{ref.authors}</p>
                        )}
                        {ref.title && (
                          <p className="italic text-warm-foreground">{ref.title}</p>
                        )}
                        {ref.journal && (
                          <p className="text-warm-muted-foreground">{ref.journal}</p>
                        )}
                        {(ref.doi || ref.url) && (
                          <div className="flex flex-wrap gap-3 pt-1">
                            {ref.doi && (
                              <a
                                href={`https://doi.org/${ref.doi}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs text-warm-accent underline decoration-warm-accent/30 underline-offset-2 hover:decoration-warm-accent"
                              >
                                DOI: {ref.doi}
                              </a>
                            )}
                            {ref.url && (
                              <a
                                href={ref.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs text-warm-accent underline decoration-warm-accent/30 underline-offset-2 hover:decoration-warm-accent"
                              >
                                View Paper
                              </a>
                              )}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </aside>
            )}
          </article>
        )}
      </ScrollArea>

      {/* Definition Popup - ScholarPhi-style term definitions */}
      {definitionPopup && (
        <DefinitionPopup
          term={definitionPopup.term}
          position={definitionPopup.position}
          onClose={() => setDefinitionPopup(null)}
        />
      )}
    </div>
  )
}

// Helper function to format content with basic HTML support
function formatContent(content: string): string {
  // Convert newlines to paragraphs
  const paragraphs = content.split("\n\n").filter((p) => p.trim())

  return paragraphs
    .map((p) => {
      // Preserve existing HTML tags
      if (p.trim().startsWith("<")) {
        return p
      }
      // Wrap plain text in paragraph tags
      return `<p>${p.trim()}</p>`
    })
    .join("")
}
