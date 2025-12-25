"use client"

import React, { useEffect, useMemo } from "react"
import { Search, AlertCircle, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useKeywordExtraction } from "@/hooks/useKeywordExtraction"
import type { ExtractedKeyword } from "@/lib/keyword-extractor"

/**
 * Props for the KeywordPanel component
 */
interface KeywordPanelProps {
  /** URL of the PDF to extract keywords from */
  pdfUrl: string
  /** Document ID for tracking */
  documentId: string
  /** Callback when a keyword chip is clicked */
  onKeywordClick?: (keyword: ExtractedKeyword, event: React.MouseEvent) => void
  /** Additional CSS classes */
  className?: string
}

/**
 * Category colors for visual distinction
 */
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; hover: string }> = {
  'Machine Learning': {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-700 dark:text-purple-300',
    hover: 'hover:bg-purple-100 dark:hover:bg-purple-900/50'
  },
  'Neural Architectures': {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/50'
  },
  'NLP & Language Models': {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-300',
    hover: 'hover:bg-green-100 dark:hover:bg-green-900/50'
  },
  'Computer Vision': {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-700 dark:text-orange-300',
    hover: 'hover:bg-orange-100 dark:hover:bg-orange-900/50'
  },
  'AI Concepts': {
    bg: 'bg-pink-50 dark:bg-pink-950/30',
    border: 'border-pink-200 dark:border-pink-800',
    text: 'text-pink-700 dark:text-pink-300',
    hover: 'hover:bg-pink-100 dark:hover:bg-pink-900/50'
  },
  'Other': {
    bg: 'bg-gray-50 dark:bg-gray-950/30',
    border: 'border-gray-200 dark:border-gray-800',
    text: 'text-gray-700 dark:text-gray-300',
    hover: 'hover:bg-gray-100 dark:hover:bg-gray-900/50'
  }
}

/**
 * Get color classes for a category
 */
function getCategoryColors(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['Other']
}

/**
 * KeywordPanel - displays all keywords extracted from a PDF
 * 
 * Features:
 * - Automatic keyword extraction when PDF loads
 * - Keywords grouped by category
 * - Clickable keyword chips with occurrence counts
 * - Extraction statistics display
 * - Loading and error states
 * 
 * @example
 * ```tsx
 * <KeywordPanel
 *   pdfUrl="/path/to/document.pdf"
 *   documentId="doc-123"
 *   onKeywordClick={(keyword, event) => handleKeywordClick(keyword, event)}
 * />
 * ```
 */
export function KeywordPanel({
  pdfUrl,
  documentId,
  onKeywordClick,
  className
}: KeywordPanelProps) {
  const { keywords, loading, error, stats, extractKeywords, reset } = useKeywordExtraction()

  // Extract keywords when PDF URL changes
  useEffect(() => {
    if (pdfUrl) {
      extractKeywords(pdfUrl)
    }
  }, [pdfUrl, extractKeywords])

  // Reset when document ID changes
  useEffect(() => {
    reset()
  }, [documentId, reset])

  // Group keywords by category
  const groupedKeywords = useMemo(() => {
    return keywords.reduce((acc, kw) => {
      const category = kw.category || 'Other'
      if (!acc[category]) acc[category] = []
      acc[category].push(kw)
      return acc
    }, {} as Record<string, ExtractedKeyword[]>)
  }, [keywords])

  // Sort categories alphabetically
  const sortedCategories = useMemo(() => {
    return Object.keys(groupedKeywords).sort()
  }, [groupedKeywords])

  // Handle retry
  const handleRetry = () => {
    if (pdfUrl) {
      extractKeywords(pdfUrl)
    }
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header with stats */}
      <div className="border-b px-4 py-3 bg-gradient-to-r from-primary/5 to-accent/5">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Search className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Extracted Keywords</h3>
            {!loading && !error && keywords.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Click a keyword to explore
              </p>
            )}
          </div>
        </div>

        {/* Statistics */}
        {!loading && !error && keywords.length > 0 && (
          <div className="flex gap-4 text-xs text-muted-foreground mt-2">
            <span>
              <strong className="text-foreground">{keywords.length}</strong> unique
            </span>
            <span>
              <strong className="text-foreground">{stats.total}</strong> occurrences
            </span>
            <span>
              <strong className="text-foreground">{stats.numPages}</strong> pages
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Extracting keywords...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <p className="text-sm text-destructive text-center">{error}</p>
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && keywords.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No keywords found in this document
            </p>
          </div>
        )}

        {/* Keywords by category */}
        {!loading && !error && keywords.length > 0 && (
          <div className="space-y-6">
            {sortedCategories.map((category) => {
              const categoryKeywords = groupedKeywords[category]
              const colors = getCategoryColors(category)

              return (
                <div key={category} className="space-y-3">
                  {/* Category header */}
                  <div className="flex items-center gap-2 sticky top-0 bg-background py-1 z-10">
                    <h4 className={cn(
                      "text-xs font-semibold uppercase tracking-wide",
                      colors.text
                    )}>
                      {category}
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      ({categoryKeywords.length})
                    </span>
                  </div>

                  {/* Keyword chips */}
                  <div className="flex flex-wrap gap-2">
                    {categoryKeywords.map((kw) => (
                      <button
                        key={kw.keyword}
                        onClick={(e) => onKeywordClick?.(kw, e)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                          colors.bg,
                          colors.border,
                          colors.text,
                          colors.hover,
                          "hover:shadow-sm active:scale-95"
                        )}
                        title={`${kw.keyword} (${kw.count} occurrences)`}
                      >
                        <span className="whitespace-nowrap">{kw.keyword}</span>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-full text-xs font-bold min-w-[1.5rem] text-center",
                          "bg-black/5 dark:bg-white/10"
                        )}>
                          {kw.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default KeywordPanel
