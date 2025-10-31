"use client"

import { useState, useEffect, useRef } from "react"
import { X, ExternalLink, Copy, BookOpen, Link, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useCitationMetadata, CitationMetadata } from "@/hooks/useCitationMetadata"

interface Citation {
  id: string
  type: "inline" | "reference" | "doi" | "url"
  text: string
  authors?: string[]
  title?: string
  journal?: string
  year?: number
  doi?: string
  url?: string
  page?: number
  position?: { x: number; y: number }
  confidence?: number
  extractedText?: string // Full reference text from PDF extraction
  extractionConfidence?: number
  extractionMethod?: string
}

interface CitationPopupProps {
  citation: Citation | null
  isOpen: boolean
  onClose: () => void
  onViewReference: (citation: Citation) => void
  onCopyText: (text: string) => void
}

export function CitationPopup({
  citation,
  isOpen,
  onClose,
  onViewReference,
  onCopyText,
}: CitationPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const { fetchMetadata, loading, getCachedMetadata } = useCitationMetadata()
  const [enrichedMetadata, setEnrichedMetadata] = useState<CitationMetadata | null>(null)

  // Fetch metadata when citation changes
  useEffect(() => {
    if (citation && isOpen) {
      // Use extracted text if available, otherwise use citation text
      const textToSearch = citation.extractedText || citation.text

      // Check if we already have metadata cached
      const cached = getCachedMetadata(textToSearch)
      if (cached) {
        setEnrichedMetadata(cached)
      } else {
        // Fetch metadata from API
        fetchMetadata(textToSearch, {
          title: citation.title,
          authors: citation.authors,
          year: citation.year,
        }).then((metadata) => {
          if (metadata) {
            setEnrichedMetadata(metadata)
          }
        })
      }
    }
  }, [citation, isOpen, fetchMetadata, getCachedMetadata])

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

  if (!isOpen || !citation) return null

  // Merge citation data with enriched metadata
  const displayData = {
    title: enrichedMetadata?.title || citation.title,
    authors: enrichedMetadata?.authors || citation.authors,
    year: enrichedMetadata?.year || citation.year,
    doi: enrichedMetadata?.doi || citation.doi,
    url: enrichedMetadata?.url || citation.url,
    abstract: enrichedMetadata?.abstract,
    venue: enrichedMetadata?.venue,
    extractedText: citation.extractedText,
    extractionConfidence: citation.extractionConfidence,
    extractionMethod: citation.extractionMethod,
  }

  // Use extracted reference text for fetching metadata if available
  const textForMetadata = citation.extractedText || citation.text

  const handleCopyText = () => {
    const textToCopy = displayData.title || citation.text
    onCopyText(textToCopy)
    navigator.clipboard.writeText(textToCopy)
  }

  const getTypeIcon = () => {
    switch (citation.type) {
      case "doi":
        return <Link className="h-4 w-4" />
      case "url":
        return <ExternalLink className="h-4 w-4" />
      default:
        return <BookOpen className="h-4 w-4" />
    }
  }

  const getTypeColor = () => {
    switch (citation.type) {
      case "doi":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "url":
        return "bg-green-100 text-green-800 border-green-200"
      case "reference":
        return "bg-purple-100 text-purple-800 border-purple-200"
      default:
        return "bg-orange-100 text-orange-800 border-orange-200"
    }
  }

  return (
    <div
      ref={popupRef}
      className="fixed z-50 w-80 rounded-lg border border-gray-200 bg-white shadow-lg animate-in fade-in-0 zoom-in-95 duration-200"
      style={{
        left: Math.min(citation.position?.x || 0, window.innerWidth - 320),
        top: Math.max(citation.position?.y || 0 - 10, 10),
        transform: citation.position?.y && citation.position.y > window.innerHeight / 2
          ? "translateY(-100%)"
          : "translateY(10px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 bg-gray-50">
        <div className="flex items-center gap-2">
          {getTypeIcon()}
          <span className="text-sm font-medium text-gray-800">Citation</span>
          <Badge variant="outline" className={cn("text-xs", getTypeColor())}>
            {citation.type}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="max-h-96">
        <div className="p-3 space-y-3">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
              <span className="ml-2 text-sm text-gray-600">Fetching metadata...</span>
            </div>
          )}

          {/* Extracted Reference Text (if available) */}
          {displayData.extractedText && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-600">Extracted Reference</p>
                <Badge variant="outline" className="text-xs">
                  {Math.round((displayData.extractionConfidence || 0) * 100)}% confidence
                </Badge>
              </div>
              <p className="text-xs text-gray-800 bg-green-50 p-2 rounded leading-relaxed border border-green-200">
                {displayData.extractedText}
              </p>
            </div>
          )}

          {/* Citation Text */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-600">
              {displayData.extractedText ? "Inline Citation" : "Citation Text"}
            </p>
            <p className="text-xs text-gray-800 bg-gray-50 p-2 rounded font-mono leading-relaxed">
              {citation.text}
            </p>
          </div>

          {/* Reference Details */}
          {(displayData.title || displayData.authors || displayData.venue) && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Reference Details</p>

              {displayData.title && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Title</p>
                  <p className="text-sm font-medium text-gray-900 leading-tight">{displayData.title}</p>
                </div>
              )}

              {displayData.authors && displayData.authors.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Authors</p>
                  <p className="text-sm text-gray-800">
                    {displayData.authors.slice(0, 3).join(", ")}
                    {displayData.authors.length > 3 && " et al."}
                  </p>
                </div>
              )}

              {displayData.venue && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Venue</p>
                  <p className="text-sm text-gray-800 italic">{displayData.venue}</p>
                </div>
              )}

              <div className="flex items-center gap-4">
                {displayData.year && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Year</p>
                    <p className="text-sm text-gray-800 font-medium">{displayData.year}</p>
                  </div>
                )}

                {citation.page && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Page</p>
                    <p className="text-sm text-gray-800 font-medium">{citation.page}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Abstract */}
          {displayData.abstract && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-600">Abstract</p>
              <p className="text-xs text-gray-800 bg-gray-50 p-2 rounded leading-relaxed">
                {displayData.abstract}
              </p>
            </div>
          )}

          {/* Confidence Score */}
          {citation.confidence && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-600">Detection Confidence</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      citation.confidence > 0.8 ? "bg-green-500" :
                      citation.confidence > 0.6 ? "bg-yellow-500" : "bg-red-500"
                    )}
                    style={{ width: `${citation.confidence * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-600 font-mono">
                  {Math.round(citation.confidence * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 bg-gray-50">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleCopyText} className="h-7 text-xs">
            <Copy className="h-3 w-3 mr-1" />
            Copy
          </Button>

          {displayData.url && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(displayData.url, "_blank")}
              className="h-7 text-xs"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Link
            </Button>
          )}

          {displayData.doi && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(`https://doi.org/${displayData.doi}`, "_blank")}
              className="h-7 text-xs"
            >
              <FileText className="h-3 w-3 mr-1" />
              DOI
            </Button>
          )}
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={() => onViewReference(citation)}
          className="h-7 text-xs"
        >
          View Reference
        </Button>
      </div>
    </div>
  )
}