"use client"

import { useState, useEffect, useRef } from "react"
import { X, ExternalLink, Copy, BookOpen, MapPin, Calendar, Users, FileText, Loader2, ChevronDown, ChevronUp, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/contexts/WorkspaceContext"
interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Target {
  page: number
  x: number
  y: number
}

interface AnnotationMetadata {
  id: string
  ref_id: string
  title?: string
  authors?: string[]
  year?: number
  venue?: string
  doi?: string
  arxiv_id?: string
  bib_box?: {
    page: number
    left: number
    top: number
    width: number
    height: number
  }
}

interface Annotation {
  dest: string
  source: BoundingBox
  target: Target | null
  metadata?: AnnotationMetadata
}

interface EnrichedMetadata extends AnnotationMetadata {
  abstract?: string
  url?: string
  citationCount?: number
  influentialCitationCount?: number
  openAccessPdf?: string
  useFallback?: boolean
}

interface CitationPopupProps {
  annotation: Annotation | null
  isOpen: boolean
  onClose: () => void
  onViewReference?: (annotation: Annotation) => void
  onCopyText: (text: string) => void
  position?: { x: number; y: number }
  citationCache?: { set: (key: string, value: any) => void, get: (key: string) => any }
}

export function CitationPopup({
  annotation,
  isOpen,
  onClose,
  onViewReference,
  onCopyText,
  position,
  citationCache
}: CitationPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [enrichedMetadata, setEnrichedMetadata] = useState<EnrichedMetadata | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFullAbstract, setShowFullAbstract] = useState(false)
  const [isOpeningPaper, setIsOpeningPaper] = useState(false)
  const [hasValidPdf, setHasValidPdf] = useState(false)
  const [isValidatingPdf, setIsValidatingPdf] = useState(false)

  // Get workspace context to open papers
  const { openReferencePDF } = useWorkspace()

  const normalizeToPdfUrl = (url: string): string => {
    if (!url) return "";

    let normalized = url.trim();

    // Convert ArXiv abstract links to PDF links
    // https://arxiv.org/abs/2307.09288 -> https://arxiv.org/pdf/2307.09288.pdf
    if (normalized.includes("arxiv.org/abs/")) {
      normalized = normalized.replace("arxiv.org/abs/", "arxiv.org/pdf/") + ".pdf";
    }

    // Convert OpenReview forum links to PDF links
    if (normalized.includes("openreview.net/forum?id=")) {
      normalized = normalized.replace("openreview.net/forum?id=", "openreview.net/pdf?id=");
    }

    return normalized;
  };

  const validatePdfUrl = async (url: string): Promise<boolean> => {
    try {
      console.log('[CitationPopup] Validating PDF URL:', url)

      // Check common direct PDF URL patterns
      const directPdfPatterns = [
        /arxiv\.org\/pdf\//i,              // arxiv.org/pdf/... (with trailing content)
        /arxiv\.org\/pdf$/i,               // arxiv.org/pdf (exact match)
        /\.pdf$/i,                         // ends with .pdf
        /\.pdf\?/i,                        // .pdf with query params
        /\/pdf\//i,                        // contains /pdf/ path
        /openreview\.net\/pdf/i,           // openreview.net/pdf
        /semanticscholar\.org.*\.pdf$/i,   // semantic scholar PDFs
        /proceedings\..*\.pdf$/i,          // conference proceedings
        /arxiv\.org\/pdf\/[\d.]+/i,        // arxiv.org/pdf/1234.5678 (specific pattern)
      ]

      const isDirectPdfUrl = directPdfPatterns.some(pattern => {
        const matches = pattern.test(url)
        console.log(`[CitationPopup] Testing pattern ${pattern}: ${matches}`)
        return matches
      })

      if (!isDirectPdfUrl) {
        console.log('[CitationPopup] URL does not match direct PDF patterns')
        return false
      }

      console.log('[CitationPopup] URL matches direct PDF pattern ✓')

      return true
    } catch (error) {
      console.error('[CitationPopup] PDF validation failed:', error)
      return false
    }
  }

  // Fetch enriched metadata when popup opens
  useEffect(() => {
    if (!isOpen || !annotation?.metadata) {
      setEnrichedMetadata(null)
      setError(null)
      setShowFullAbstract(false)
      setHasValidPdf(false)
      return
    }

    const fetchEnrichedMetadata = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const metadata = annotation.metadata!

        console.log('[CitationPopup] Fetching enriched metadata for:', metadata.title)
        console.log('[CitationPopup] Metadata:', metadata)

        // check cache before fetching
        const cachedMetadata = citationCache?.get(metadata.ref_id)
        if (cachedMetadata && !cachedMetadata.useFallback) {
          console.log('[CitationPopup] Using cached metadata')
          setEnrichedMetadata(cachedMetadata)

          // FIX: Validate PDF again for cached data logic
          if (cachedMetadata.openAccessPdf) {
            setIsValidatingPdf(true)
            const isValid = await validatePdfUrl(cachedMetadata.openAccessPdf)
            setHasValidPdf(isValid)
            setIsValidatingPdf(false)
          } else {
            setHasValidPdf(false)
          }
          setIsLoading(false)
          return
        }

        const response = await fetch("/api/references/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: metadata.title,
            authors: metadata.authors?.join(", "),
            year: metadata.year?.toString(),
            doi: metadata.doi,
            arxivId: metadata.arxiv_id,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }))
          throw new Error(errorData.error || `Failed to fetch metadata: ${response.status}`)
        }

        const data = await response.json()
        console.log('[CitationPopup] Fetched enriched metadata:', data)

        let rawUrl = "";
        if (typeof data.openAccessPdf === 'string') {
          rawUrl = data.openAccessPdf;
        } else if (data.openAccessPdf?.url) {
          rawUrl = data.openAccessPdf.url;
        } else if (!data.fallback && data.url) {
          rawUrl = data.url;
        }

        // check if fallback = true, but metadata.doi is not empty -> instead of using google scholar search for VIEW PAPER, we use doi link instead
        let doiURL = "";
        if (data.fallback && metadata.doi) {
          doiURL = `https://doi.org/${metadata.doi}`;
        }
        if (data.fallback && metadata.arxiv_id) {
          doiURL = `https://arxiv.org/pdf/${metadata.arxiv_id.match(/:(.+)$/)?.[1]}`;
        }

        const normalizedUrl = normalizeToPdfUrl(rawUrl);
        console.log('[CitationPopup] Normalized URL:', normalizedUrl)
        const enriched = {
          ...metadata,
          abstract: data.abstract,
          url: doiURL.trim() || data.url, // Keep the landing page URL for external links
          citationCount: data.citationCount,
          influentialCitationCount: data.influentialCitationCount,
          openAccessPdf: normalizedUrl, // Use the normalized direct PDF URL here
          useFallback: data.fallback || false,
        };

        setEnrichedMetadata(enriched)
        citationCache?.set(metadata.ref_id, enriched)
        // Validate PDF URL if present
        if (data.openAccessPdf) {
          setIsValidatingPdf(true)
          const isValid = await validatePdfUrl(normalizedUrl)
          setHasValidPdf(isValid)
          setIsValidatingPdf(false)
          console.log('[CitationPopup] PDF validation result:', isValid)
        }
      } catch (err) {
        console.error('[CitationPopup] Failed to fetch enriched metadata:', err)
        setError(err instanceof Error ? err.message : 'Failed to load additional metadata')
        setEnrichedMetadata(annotation.metadata || null)
      } finally {
        setIsLoading(false)
      }
    }

    if (annotation.metadata?.title) {
      fetchEnrichedMetadata()
    } else {
      setEnrichedMetadata(annotation.metadata || null)
    }
  }, [isOpen, annotation])

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen, onClose])

  // Close popup on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      return () => document.removeEventListener("keydown", handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen || !annotation) return null

  const metadata = enrichedMetadata || annotation.metadata

  const handleCopyText = () => {
    const textToCopy = metadata?.title || annotation.dest
    onCopyText(textToCopy)
    navigator.clipboard.writeText(textToCopy)
  }

  const handleViewReference = () => {
    if (onViewReference) {
      onViewReference(annotation)
    } else if (annotation.target) {
      console.log(`Navigate to page ${annotation.target.page}`)
    }
  }

  // Handle opening paper in PDF viewer (only if valid PDF)
  const handleOpenPaper = async () => {
    if (!enrichedMetadata?.openAccessPdf || !metadata?.title || !hasValidPdf) {
      console.warn('[CitationPopup] Cannot open paper - invalid or missing PDF URL')
      return
    }

    setIsOpeningPaper(true)
    try {
      console.log('[CitationPopup] Opening paper in preview mode:', {
        url: enrichedMetadata.openAccessPdf,
        title: metadata.title
      })

      await openReferencePDF(enrichedMetadata.openAccessPdf, metadata.title)
      onClose()
    } catch (error) {
      console.error('[CitationPopup] Failed to open paper:', error)
      setError('Failed to open paper')
    } finally {
      setIsOpeningPaper(false)
    }
  }

  // Handle opening external link (fallback when no valid PDF)
  const handleOpenExternalLink = () => {
    console.log('[CitationPopup] Opening external link:', enrichedMetadata)
    if (enrichedMetadata?.url) {
      window.open(enrichedMetadata.url, "_blank", "noopener,noreferrer")
    }
  }

  const truncateText = (text: string, maxLength: number = 200) => {
    if (!text || text.length <= maxLength) return text
    return text.substring(0, maxLength).trim() + "..."
  }

  const formatAuthors = (authors: string[]) => {
    if (!authors || authors.length === 0) return null
    if (authors.length <= 2) return authors.join(", ")
    return `${authors.slice(0, 2).join(", ")} et al.`
  }

  const abstractLength = enrichedMetadata?.abstract?.length || 0
  const shouldTruncateAbstract = abstractLength > 200

  return (
    <div
      ref={popupRef}
      className="fixed z-50 w-96 rounded-lg border border-gray-200 bg-white shadow-xl animate-in fade-in-0 zoom-in-95 duration-200"
      style={{
        left: position ? Math.min(position.x, window.innerWidth - 384) : '50%',
        top: position ? Math.max(position.y - 10, 10) : '50%',
        transform: position && position.y > window.innerHeight / 2
          ? "translateY(-100%)"
          : position ? "translateY(10px)" : "translate(-50%, -50%)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-800">Reference</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600 rounded-full transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="max-h-[450px]">
        <div className="p-4 space-y-3">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <span className="ml-2 text-sm text-gray-600">Loading...</span>
            </div>
          )}

          {/* No Metadata */}
          {!isLoading && !metadata && (
            <div className="text-center py-6">
              <p className="text-sm text-gray-600">No metadata found</p>
              <p className="text-xs text-gray-500 mt-2 font-mono">{annotation.dest}</p>
            </div>
          )}

          {/* Metadata Content */}
          {!isLoading && metadata && (
            <>
              {/* Title */}
              {metadata.title && (
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-gray-900 leading-snug">
                    {metadata.title}
                  </h3>

                </div>
              )}

              {/* Authors */}
              {metadata.authors && metadata.authors.length > 0 && (
                <div className="flex items-start gap-2">
                  <Users className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {formatAuthors(metadata.authors)}
                  </p>
                </div>
              )}

              {/* Year, Venue & Citations - Single Line */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                {metadata.year && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-gray-400" />
                    <span>{metadata.year}</span>
                  </div>
                )}

                {metadata.venue && (
                  <>
                    <span className="text-gray-300">•</span>
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3 text-gray-400" />
                      <span className="truncate max-w-[140px]" title={metadata.venue}>
                        {truncateText(metadata.venue, 30)}
                      </span>
                    </div>
                  </>
                )}

                {enrichedMetadata?.citationCount !== undefined && (
                  <>
                    <span className="text-gray-300">•</span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium bg-blue-50 text-blue-700 border-blue-200">
                      {enrichedMetadata.citationCount} cited
                    </Badge>
                  </>
                )}

                {enrichedMetadata?.influentialCitationCount !== undefined && enrichedMetadata.influentialCitationCount > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium bg-amber-50 text-amber-700 border-amber-200">
                    {enrichedMetadata.influentialCitationCount} influential
                  </Badge>
                )}
              </div>

              {/* Abstract with View More */}
              {enrichedMetadata?.abstract && (
                <div className="space-y-1.5 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Abstract
                    </p>
                    {shouldTruncateAbstract && (
                      <button
                        onClick={() => setShowFullAbstract(!showFullAbstract)}
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                      >
                        {showFullAbstract ? (
                          <>
                            Less <ChevronUp className="h-3 w-3" />
                          </>
                        ) : (
                          <>
                            More <ChevronDown className="h-3 w-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {showFullAbstract || !shouldTruncateAbstract
                      ? enrichedMetadata.abstract
                      : truncateText(enrichedMetadata.abstract, 200)}
                  </p>
                </div>
              )}

              {/* Identifiers */}
              {(metadata.doi || metadata.arxiv_id) && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100">
                  {metadata.doi && (
                    <Badge variant="outline" className="text-[10px] font-mono h-5 px-1.5 border-gray-300 text-gray-600">
                      DOI {metadata.doi}
                    </Badge>
                  )}
                  {metadata.arxiv_id && (
                    <Badge variant="outline" className="text-[10px] font-mono h-5 px-1.5 border-orange-300 text-orange-700 bg-orange-50">
                      {metadata.arxiv_id}
                    </Badge>
                  )}
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer Actions */}
      <div className="border-t border-gray-100 p-3 bg-gray-50 rounded-b-lg">
        <div className="flex items-center justify-between gap-2">
          {/* Left side actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyText}
              className="h-8 px-3 text-xs hover:bg-gray-200"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy
            </Button>

            {annotation.target && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleViewReference}
                className="h-8 px-3 text-xs hover:bg-gray-200"
              >
                <MapPin className="h-3.5 w-3.5 mr-1.5" />
                Bibliography
              </Button>
            )}
          </div>

          {/* Right side - Conditional button based on PDF validity */}
          <div className="flex items-center gap-2">
            {hasValidPdf ? (
              // Mode 1: Valid PDF - Open in PDF Viewer
              <Button
                variant="default"
                size="sm"
                onClick={handleOpenPaper}
                disabled={isOpeningPaper}
                className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isOpeningPaper ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    View Paper
                  </>
                )}
              </Button>
            ) : enrichedMetadata?.url ? (
              // Mode 2: No valid PDF - Open external link
              <Button
                variant="default"
                size="sm"
                onClick={handleOpenExternalLink}
                className="h-8 px-3 text-xs bg-gray-600 hover:bg-gray-700 text-white"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                View Paper
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}