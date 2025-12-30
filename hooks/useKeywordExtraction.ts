import { useState, useCallback } from 'react'
import {
  extractKeywordsFromPDF,
  ExtractedKeyword,
  ExtractionResult,
} from '@/lib/keyword-extractor'

/**
 * Statistics about the keyword extraction
 */
export interface ExtractionStats {
  total: number
  numPages: number
  matcherStats?: {
    numTerms: number
    maxDepth: number
    buildTimeMs: number
  }
}

/**
 * Return type for the useKeywordExtraction hook
 */
export interface UseKeywordExtractionReturn {
  keywords: ExtractedKeyword[]
  loading: boolean
  error: string | null
  stats: ExtractionStats
  extractKeywords: (pdfUrl: string) => Promise<void>
  reset: () => void
}

/**
 * Initial state for extraction stats
 */
const initialStats: ExtractionStats = {
  total: 0,
  numPages: 0,
}

/**
 * React hook for managing keyword extraction state.
 * 
 * Uses Trie-based term matching with draft concepts from Concepedia
 * for efficient, accurate keyword recognition.
 * 
 * Provides functionality to:
 * - Extract keywords from a PDF document using Trie-based matching
 * - Track loading and error states
 * - Reset state when switching documents
 * 
 * @returns Object containing keywords, loading state, error, stats, and control functions
 * 
 * @example
 * ```tsx
 * const { keywords, loading, error, stats, extractKeywords, reset } = useKeywordExtraction()
 * 
 * // Extract keywords when PDF loads
 * useEffect(() => {
 *   if (pdfUrl) {
 *     extractKeywords(pdfUrl)
 *   }
 * }, [pdfUrl, extractKeywords])
 * 
 * // Reset when switching documents
 * useEffect(() => {
 *   reset()
 * }, [documentId, reset])
 * ```
 */
export function useKeywordExtraction(): UseKeywordExtractionReturn {
  const [keywords, setKeywords] = useState<ExtractedKeyword[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<ExtractionStats>(initialStats)

  /**
   * Extract keywords from a PDF document
   * @param pdfUrl - URL or path to the PDF file
   */
  const extractKeywords = useCallback(async (pdfUrl: string) => {
    setLoading(true)
    setError(null)

    try {
      console.log('[useKeywordExtraction] Starting extraction for:', pdfUrl)
      const result: ExtractionResult = await extractKeywordsFromPDF(pdfUrl)

      setKeywords(result.keywords)
      setStats({
        total: result.totalKeywords,
        numPages: result.numPages,
        matcherStats: result.matcherStats,
      })

      console.log(
        `[useKeywordExtraction] Extracted ${result.keywords.length} unique keywords ` +
        `(${result.totalKeywords} total occurrences) from ${result.numPages} pages`
      )

      if (result.matcherStats) {
        console.log(
          `[useKeywordExtraction] Trie stats: ${result.matcherStats.numTerms} terms, ` +
          `max depth ${result.matcherStats.maxDepth}, built in ${result.matcherStats.buildTimeMs.toFixed(2)}ms`
        )
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to extract keywords'
      console.error('[useKeywordExtraction] Error extracting keywords:', err)
      setError(errorMessage)
      setKeywords([])
      setStats(initialStats)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Reset the extraction state
   * Used when switching between documents
   */
  const reset = useCallback(() => {
    setKeywords([])
    setLoading(false)
    setError(null)
    setStats(initialStats)
  }, [])

  return {
    keywords,
    loading,
    error,
    stats,
    extractKeywords,
    reset,
  }
}
