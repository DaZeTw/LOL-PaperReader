"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, RotateCcw, Type, FileText, Loader2, AlertCircle } from "lucide-react"
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

// Constants
const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 32
const DEFAULT_FONT_SIZE = 16
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.0
const DEFAULT_ZOOM = 1.0
const ZOOM_STEP = 0.1
const FONT_STEP = 2
const DEFAULT_LINE_HEIGHT = 1.8
const SCROLL_THROTTLE_MS = 150
const SCROLL_RESTORE_DELAY_MS = 100
const MIN_TERM_LENGTH = 2

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
  const [fontSize, setFontSize] = useState(viewState?.semanticFontSize || DEFAULT_FONT_SIZE)
  const [zoom, setZoom] = useState(viewState?.semanticZoom || DEFAULT_ZOOM)
  const [lineHeight, setLineHeight] = useState(DEFAULT_LINE_HEIGHT)
  const [definitionPopup, setDefinitionPopup] = useState<DefinitionPopupState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<{ [key: string]: HTMLElement | null }>({})
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollViewportRef = useRef<HTMLDivElement | null>(null)
  const isRestoringScroll = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout>()

  // Determine which mode we're in
  const isPdf2HtmlMode = !!htmlContent

  // Sanitize HTML content for security (client-side only)
  const sanitizedHtmlContent = useMemo(() => {
    if (!htmlContent) return ""

    // Only sanitize in browser environment
    if (typeof window === "undefined") return htmlContent

    try {
      // Dynamically import DOMPurify for client-side
      const DOMPurify = require("dompurify")
      return DOMPurify.sanitize(htmlContent, {
        ADD_TAGS: ["style"],
        ADD_ATTR: ["style", "class", "id", "data-page-no"],
        ALLOW_DATA_ATTR: true,
      })
    } catch (err) {
      console.error("Failed to sanitize HTML:", err)
      setError("Failed to sanitize HTML content")
      return htmlContent // Fallback to unsanitized if DOMPurify fails
    }
  }, [htmlContent])

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

  // Save scroll position when scrolling (memoized handler)
  const handleScrollThrottled = useCallback(() => {
    if (isRestoringScroll.current || !onViewStateChange || !scrollViewportRef.current) return

    const scrollTop = scrollViewportRef.current.scrollTop
    onViewStateChange({ semanticScrollTop: scrollTop })
  }, [onViewStateChange])

  useEffect(() => {
    const viewport = scrollViewportRef.current
    if (!viewport || !onViewStateChange) return

    const throttledScroll = () => {
      clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = setTimeout(handleScrollThrottled, SCROLL_THROTTLE_MS)
    }

    viewport.addEventListener("scroll", throttledScroll, { passive: true })
    return () => {
      viewport.removeEventListener("scroll", throttledScroll)
      clearTimeout(scrollTimeoutRef.current)
    }
  }, [onViewStateChange, handleScrollThrottled])

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

  // Handle citation clicks in pdf2htmlEX HTML (memoized handler)
  const handleCitationClick = useCallback(
    (e: MouseEvent) => {
      if (!onCitationClick) return

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
    },
    [onCitationClick]
  )

  useEffect(() => {
    if (isPdf2HtmlMode && contentRef.current && onCitationClick) {
      const container = contentRef.current
      container.addEventListener("click", handleCitationClick)
      return () => {
        container.removeEventListener("click", handleCitationClick)
      }
    }
  }, [isPdf2HtmlMode, onCitationClick, handleCitationClick])

  // Handle term selection for definitions (ScholarPhi-style) - memoized
  const handleDoubleClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement

    // Don't show definition popup if clicking on citation links
    if (target.closest('a[href^="#"]')) {
      return
    }

    // Get selected text
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim()

    if (!selectedText || selectedText.length < MIN_TERM_LENGTH) return

    // Filter out non-word selections (like punctuation only)
    if (!/[a-zA-Z]/.test(selectedText)) return

    // Clean the selected term (remove punctuation at start/end)
    const cleanedTerm = selectedText.replace(/^[^\w]+|[^\w]+$/g, "")

    if (cleanedTerm.length < MIN_TERM_LENGTH) return

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

    // Clear text selection after a brief delay to ensure popup shows
    setTimeout(() => {
      selection?.removeAllRanges()
    }, 50)
  }, [])

  useEffect(() => {
    if (!contentRef.current) return

    const container = contentRef.current
    container.addEventListener("dblclick", handleDoubleClick)

    return () => {
      container.removeEventListener("dblclick", handleDoubleClick)
    }
  }, [handleDoubleClick])

  // Zoom controls - memoized
  const handleZoomIn = useCallback(() => {
    if (isPdf2HtmlMode) {
      const newZoom = Math.min(zoom + ZOOM_STEP, MAX_ZOOM)
      setZoom(newZoom)
      onViewStateChange?.({ semanticZoom: newZoom })
    } else {
      const newFontSize = Math.min(fontSize + FONT_STEP, MAX_FONT_SIZE)
      setFontSize(newFontSize)
      onViewStateChange?.({ semanticFontSize: newFontSize })
    }
  }, [isPdf2HtmlMode, zoom, fontSize, onViewStateChange])

  const handleZoomOut = useCallback(() => {
    if (isPdf2HtmlMode) {
      const newZoom = Math.max(zoom - ZOOM_STEP, MIN_ZOOM)
      setZoom(newZoom)
      onViewStateChange?.({ semanticZoom: newZoom })
    } else {
      const newFontSize = Math.max(fontSize - FONT_STEP, MIN_FONT_SIZE)
      setFontSize(newFontSize)
      onViewStateChange?.({ semanticFontSize: newFontSize })
    }
  }, [isPdf2HtmlMode, zoom, fontSize, onViewStateChange])

  const handleResetZoom = useCallback(() => {
    if (isPdf2HtmlMode) {
      setZoom(DEFAULT_ZOOM)
      onViewStateChange?.({ semanticZoom: DEFAULT_ZOOM })
    } else {
      setFontSize(DEFAULT_FONT_SIZE)
      setLineHeight(DEFAULT_LINE_HEIGHT)
      onViewStateChange?.({ semanticFontSize: DEFAULT_FONT_SIZE })
    }
  }, [isPdf2HtmlMode, onViewStateChange])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Plus/Equal: Zoom in
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
        e.preventDefault()
        handleZoomIn()
      }
      // Ctrl/Cmd + Minus: Zoom out
      else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault()
        handleZoomOut()
      }
      // Ctrl/Cmd + 0: Reset zoom
      else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault()
        handleResetZoom()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleZoomIn, handleZoomOut, handleResetZoom])

  const { title = "", sections = [], references = [], metadata } = parsedData || {}

  // Check if we have any content to display
  const hasContent = isPdf2HtmlMode ? !!sanitizedHtmlContent : (sections.length > 0 || !!title)

  return (
    <div className={cn("flex h-full flex-col bg-warm-bg", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-warm-border bg-warm-surface px-4 py-2 shadow-sm" role="toolbar" aria-label="Viewer controls">
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
        {error ? (
          // Error state
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <p className="text-warm-foreground font-medium">Failed to load content</p>
              <p className="text-sm text-warm-muted-foreground">{error}</p>
            </div>
          </div>
        ) : isLoading ? (
          // Loading state
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 text-warm-accent animate-spin mx-auto" />
              <p className="text-warm-muted-foreground">Loading content...</p>
            </div>
          </div>
        ) : !hasContent ? (
          // Empty state
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-center space-y-4">
              <FileText className="h-12 w-12 text-warm-muted-foreground mx-auto" />
              <p className="text-warm-foreground font-medium">No content available</p>
              <p className="text-sm text-warm-muted-foreground">
                Upload a PDF to view its content
              </p>
            </div>
          </div>
        ) : isPdf2HtmlMode ? (
          // pdf2htmlEX mode - render raw HTML with improved zoom handling
          <div
            ref={contentRef}
            className="pdf2htmlex-container w-full overflow-x-auto"
            role="document"
            aria-label="PDF content"
          >
            <div
              className="pdf2htmlex-content bg-white p-8 mx-auto"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top center",
                minWidth: "fit-content",
                width: zoom < 1 ? "100%" : "auto",
              }}
              dangerouslySetInnerHTML={{ __html: sanitizedHtmlContent }}
            />
          </div>
        ) : (
          // Semantic mode - original parsed data rendering
          <article
            ref={contentRef}
            className="mx-auto max-w-4xl px-8 py-12"
            style={{ fontSize: `${fontSize}px`, lineHeight }}
            role="article"
            aria-label="Document content"
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
              {sections.map((section) => (
                <SectionContent
                  key={section.id}
                  section={section}
                  selectedSection={selectedSection}
                  sectionRefs={sectionRefs}
                />
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

// Helper function to format content with basic HTML support - memoized
const formatContent = (() => {
  const cache = new Map<string, string>()

  return (content: string): string => {
    if (cache.has(content)) {
      return cache.get(content)!
    }

    // Convert newlines to paragraphs
    const paragraphs = content.split("\n\n").filter((p) => p.trim())

    const result = paragraphs
      .map((p) => {
        // Preserve existing HTML tags
        if (p.trim().startsWith("<")) {
          return p
        }
        // Wrap plain text in paragraph tags
        return `<p>${p.trim()}</p>`
      })
      .join("")

    cache.set(content, result)
    return result
  }
})()

// Memoized Section Component for better performance
const SectionContent = memo(({
  section,
  selectedSection,
  sectionRefs,
}: {
  section: Section
  selectedSection: string | null
  sectionRefs: React.MutableRefObject<{ [key: string]: HTMLElement | null }>
}) => {
  return (
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
  )
})

SectionContent.displayName = "SectionContent"
