"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Search, AlertCircle, RefreshCw, ExternalLink, Info, ChevronDown, ChevronUp, Zap, Sparkles, List } from "lucide-react"
import { cn } from "@/lib/utils"
import { useKeywordExtraction, type RefinedConcept } from "@/hooks/useKeywordExtraction"
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
  onKeywordClick?: (keyword: ExtractedKeyword | RefinedConcept, event: React.MouseEvent) => void
  /** Additional CSS classes */
  className?: string
  /** Show refined concepts by default (default: true) */
  defaultShowRefined?: boolean
}

/**
 * Category colors for visual distinction
 * Updated to include more categories from the draft concepts
 */
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; hover: string; accent: string }> = {
  'Machine Learning': {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-700 dark:text-purple-300',
    hover: 'hover:bg-purple-100 dark:hover:bg-purple-900/50',
    accent: 'bg-purple-500'
  },
  'Neural Architectures': {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/50',
    accent: 'bg-blue-500'
  },
  'NLP & Language Models': {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-300',
    hover: 'hover:bg-green-100 dark:hover:bg-green-900/50',
    accent: 'bg-green-500'
  },
  'Computer Vision': {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-700 dark:text-orange-300',
    hover: 'hover:bg-orange-100 dark:hover:bg-orange-900/50',
    accent: 'bg-orange-500'
  },
  'Data & Statistics': {
    bg: 'bg-cyan-50 dark:bg-cyan-950/30',
    border: 'border-cyan-200 dark:border-cyan-800',
    text: 'text-cyan-700 dark:text-cyan-300',
    hover: 'hover:bg-cyan-100 dark:hover:bg-cyan-900/50',
    accent: 'bg-cyan-500'
  },
  'Science & Research': {
    bg: 'bg-indigo-50 dark:bg-indigo-950/30',
    border: 'border-indigo-200 dark:border-indigo-800',
    text: 'text-indigo-700 dark:text-indigo-300',
    hover: 'hover:bg-indigo-100 dark:hover:bg-indigo-900/50',
    accent: 'bg-indigo-500'
  },
  'Health & Medicine': {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    hover: 'hover:bg-red-100 dark:hover:bg-red-900/50',
    accent: 'bg-red-500'
  },
  'Engineering & Technology': {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
    hover: 'hover:bg-amber-100 dark:hover:bg-amber-900/50',
    accent: 'bg-amber-500'
  },
  'AI Concepts': {
    bg: 'bg-pink-50 dark:bg-pink-950/30',
    border: 'border-pink-200 dark:border-pink-800',
    text: 'text-pink-700 dark:text-pink-300',
    hover: 'hover:bg-pink-100 dark:hover:bg-pink-900/50',
    accent: 'bg-pink-500'
  },
  'Deep Learning': {
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    border: 'border-violet-200 dark:border-violet-800',
    text: 'text-violet-700 dark:text-violet-300',
    hover: 'hover:bg-violet-100 dark:hover:bg-violet-900/50',
    accent: 'bg-violet-500'
  },
  'NLP': {
    bg: 'bg-teal-50 dark:bg-teal-950/30',
    border: 'border-teal-200 dark:border-teal-800',
    text: 'text-teal-700 dark:text-teal-300',
    hover: 'hover:bg-teal-100 dark:hover:bg-teal-900/50',
    accent: 'bg-teal-500'
  },
  'Knowledge Representation': {
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    border: 'border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-300',
    hover: 'hover:bg-rose-100 dark:hover:bg-rose-900/50',
    accent: 'bg-rose-500'
  },
  'Extracted': {
    bg: 'bg-slate-50 dark:bg-slate-950/30',
    border: 'border-slate-200 dark:border-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    hover: 'hover:bg-slate-100 dark:hover:bg-slate-900/50',
    accent: 'bg-slate-500'
  },
  'Other': {
    bg: 'bg-gray-50 dark:bg-gray-950/30',
    border: 'border-gray-200 dark:border-gray-800',
    text: 'text-gray-700 dark:text-gray-300',
    hover: 'hover:bg-gray-100 dark:hover:bg-gray-900/50',
    accent: 'bg-gray-500'
  }
}

/**
 * Get color classes for a category
 */
function getCategoryColors(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['Other']
}

/**
 * Truncate text to a maximum length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Unified display item for both keywords and refined concepts
 */
interface DisplayItem {
  keyword: string
  count: number
  category: string
  url?: string
  shortDefinition?: string
  isOntologyAligned: boolean
  score?: number
}


/**
 * KeywordPanel - displays all keywords extracted from a PDF
 * 
 * Features:
 * - Automatic keyword extraction when PDF loads using Trie-based matching
 * - Keywords grouped by category with color coding
 * - Clickable keyword chips with occurrence counts
 * - Short definitions shown on hover/expand
 * - Links to concept pages
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
  className,
  defaultShowRefined = true
}: KeywordPanelProps) {
  const { keywords, refinedConcepts, loading, error, stats, extractKeywords, extractKeywordsBackend, reset, useBackend, setUseBackend } = useKeywordExtraction()
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null)
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [showRefined, setShowRefined] = useState(defaultShowRefined)
  const [pdfText, setPdfText] = useState<string>('')

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

  // Get display items based on mode
  const displayItems: DisplayItem[] = useMemo(() => {
    if (showRefined && refinedConcepts.length > 0) {
      return refinedConcepts.map(c => ({
        keyword: c.concept,
        count: c.frequency,
        category: c.category,
        url: c.url,
        shortDefinition: c.shortDefinition,
        isOntologyAligned: c.isOntologyAligned,
        score: c.score,
      }))
    }
    return keywords.map(kw => ({
      ...kw,
      isOntologyAligned: !!kw.url,
      score: undefined as number | undefined,
    }))
  }, [showRefined, refinedConcepts, keywords])

  // Group keywords by category
  const groupedKeywords = useMemo(() => {
    return displayItems.reduce<Record<string, DisplayItem[]>>((acc, kw) => {
      const category = kw.category || 'Other'
      if (!acc[category]) acc[category] = []
      acc[category].push(kw)
      return acc
    }, {})
  }, [displayItems])

  // Sort categories by keyword count
  const sortedCategories = useMemo(() => {
    return Object.entries(groupedKeywords)
      .sort(([, a], [, b]) => (b as DisplayItem[]).length - (a as DisplayItem[]).length)
      .map(([category]) => category)
  }, [groupedKeywords])

  // Limit categories shown initially
  const visibleCategories = showAllCategories
    ? sortedCategories
    : sortedCategories.slice(0, 5)

  // Handle retry
  const handleRetry = () => {
    if (pdfUrl) {
      extractKeywords(pdfUrl)
    }
  }

  // Toggle keyword expansion
  const toggleKeywordExpansion = (keyword: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedKeyword(expandedKeyword === keyword ? null : keyword)
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header with stats */}
      <div className="border-b px-4 py-3 bg-gradient-to-r from-primary/5 to-accent/5">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI-Detected Keywords</h3>
            {!loading && !error && keywords.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Click to explore concepts
              </p>
            )}
          </div>
        </div>

        {/* Statistics */}
        {!loading && !error && keywords.length > 0 && (
          <div className="flex gap-4 text-xs text-muted-foreground mt-2">
            <span>
              <strong className="text-foreground">{keywords.length}</strong> concepts
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
            <p className="text-sm text-muted-foreground">Analyzing document...</p>
            <p className="text-xs text-muted-foreground">Using AI-powered concept matching</p>
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
              No concepts found in this document
            </p>
          </div>
        )}

        {/* Keywords by category */}
        {!loading && !error && keywords.length > 0 && (
          <div className="space-y-6">
            {visibleCategories.map((category) => {
              const categoryKeywords = groupedKeywords[category]
              const colors = getCategoryColors(category)

              return (
                <div key={category} className="space-y-3">
                  {/* Category header */}
                  <div className="flex items-center gap-2 sticky top-0 bg-background py-1 z-10">
                    <div className={cn("h-2 w-2 rounded-full", colors.accent)} />
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
                  <div className="space-y-2">
                    {categoryKeywords.map((kw) => {
                      const isExpanded = expandedKeyword === kw.keyword
                      const hasDefinition = !!kw.shortDefinition

                      return (
                        <div
                          key={kw.keyword}
                          className={cn(
                            "rounded-lg border transition-all",
                            colors.bg,
                            colors.border,
                            isExpanded && "shadow-sm"
                          )}
                        >
                          {/* Main keyword button */}
                          <button
                            onClick={(e) => onKeywordClick?.(kw, e)}
                            className={cn(
                              "flex items-center gap-2 w-full px-3 py-2 text-left transition-colors rounded-t-lg",
                              colors.hover
                            )}
                          >
                            <span className={cn(
                              "font-medium text-sm flex-1",
                              colors.text
                            )}>
                              {kw.keyword}
                            </span>

                            {/* Count badge */}
                            <span className={cn(
                              "px-1.5 py-0.5 rounded-full text-xs font-bold min-w-[1.5rem] text-center",
                              "bg-black/5 dark:bg-white/10"
                            )}>
                              {kw.count}
                            </span>

                            {/* External link icon if URL available */}
                            {kw.url && (
                              <ExternalLink className="h-3 w-3 opacity-50" />
                            )}

                            {/* Expand/collapse for definition */}
                            {hasDefinition && (
                              <button
                                onClick={(e) => toggleKeywordExpansion(kw.keyword, e)}
                                className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                              </button>
                            )}
                          </button>

                          {/* Expanded definition */}
                          {isExpanded && hasDefinition && (
                            <div className={cn(
                              "px-3 pb-3 pt-1 text-xs border-t",
                              colors.border
                            )}>
                              <div className="flex items-start gap-2">
                                <Info className="h-3 w-3 mt-0.5 opacity-50 shrink-0" />
                                <p className="text-muted-foreground leading-relaxed">
                                  {kw.shortDefinition}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Show more categories button */}
            {sortedCategories.length > 5 && (
              <button
                onClick={() => setShowAllCategories(!showAllCategories)}
                className="w-full py-2 text-sm text-primary hover:underline flex items-center justify-center gap-1"
              >
                {showAllCategories ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Show fewer categories
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Show {sortedCategories.length - 5} more categories
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default KeywordPanel
