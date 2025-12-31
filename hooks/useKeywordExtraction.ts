import { useState, useCallback } from 'react'
import {
  extractKeywordsFromPDF,
  ExtractedKeyword,
  ExtractionResult,
  ExtractionOptions,
} from '@/lib/keyword-extractor'
import type { RefinedConcept, RefinerOptions } from '@/lib/concept-refiner'
import { extractKeywordsFromPdfUrl, YakeKeyword } from '@/lib/yake-api'

/**
 * Extraction mode
 */
export type ExtractionMode = 'client' | 'yake'

/**
 * Statistics about the keyword extraction
 */
export interface ExtractionStats {
  total: number
  numPages: number
  method?: string
  matcherStats?: {
    numTerms: number
    maxDepth: number
    buildTimeMs: number
  }
}

/**
 * Extended extraction options including mode selection
 */
export interface ExtendedExtractionOptions extends ExtractionOptions {
  /** Extraction mode: 'client' for Trie-based, 'yake' for backend YAKE */
  mode?: ExtractionMode
  /** Number of keywords to extract (for YAKE mode) */
  topN?: number
  /** Document ID for caching (for YAKE mode) */
  documentId?: string
}

/**
 * Return type for the useKeywordExtraction hook
 */
export interface UseKeywordExtractionReturn {
  /** Raw extracted keywords */
  keywords: ExtractedKeyword[]
  /** Refined academic concepts (post-processed) */
  refinedConcepts: RefinedConcept[]
  loading: boolean
  error: string | null
  stats: ExtractionStats
  /** Current extraction mode */
  mode: ExtractionMode
  extractKeywords: (pdfUrl: string, options?: ExtendedExtractionOptions) => Promise<void>
  /** Set the extraction mode */
  setMode: (mode: ExtractionMode) => void
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
 * Convert YAKE keyword to ExtractedKeyword format
 */
function yakeToExtractedKeyword(yakeKw: YakeKeyword): ExtractedKeyword {
  return {
    keyword: yakeKw.keyword,
    count: Math.round(yakeKw.score * 100), // Convert score to pseudo-count for display
    category: yakeKw.category,
  }
}

/**
 * React hook for managing keyword extraction state.
 *
 * Supports two extraction modes:
 * - 'client': Trie-based term matching with draft concepts (default)
 * - 'yake': Backend YAKE keyword extraction
 *
 * Provides functionality to:
 * - Extract keywords from a PDF document using Trie-based matching or YAKE
 * - Refine keywords into academic concepts with scoring and ranking
 * - Track loading and error states
 * - Reset state when switching documents
 *
 * @returns Object containing keywords, refinedConcepts, loading state, error, stats, and control functions
 *
 * @example
 * ```tsx
 * const { keywords, refinedConcepts, loading, error, stats, mode, extractKeywords, setMode, reset } = useKeywordExtraction()
 *
 * // Extract keywords when PDF loads (using current mode)
 * useEffect(() => {
 *   if (pdfUrl) {
 *     extractKeywords(pdfUrl)
 *   }
 * }, [pdfUrl, extractKeywords])
 *
 * // Switch to YAKE mode
 * setMode('yake')
 *
 * // Use refinedConcepts for display (high-precision academic terms)
 * // Use keywords for full list (all matched terms)
 * ```
 */
export function useKeywordExtraction(): UseKeywordExtractionReturn {
  const [keywords, setKeywords] = useState<ExtractedKeyword[]>([])
  const [refinedConcepts, setRefinedConcepts] = useState<RefinedConcept[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<ExtractionStats>(initialStats)
  const [mode, setMode] = useState<ExtractionMode>('yake') // Default to YAKE

  /**
   * Extract keywords from a PDF document
   * @param pdfUrl - URL or path to the PDF file
   * @param options - Extraction options (mode, refinement settings, etc.)
   */
  const extractKeywords = useCallback(async (
    pdfUrl: string,
    options: ExtendedExtractionOptions = {}
  ) => {
    setLoading(true)
    setError(null)

    const extractionMode = options.mode || mode

    try {
      console.log(`[useKeywordExtraction] Starting ${extractionMode} extraction for:`, pdfUrl)

      if (extractionMode === 'yake') {
        // Use backend YAKE extraction
        const topN = options.topN || 20
        const yakeResult = await extractKeywordsFromPdfUrl(pdfUrl, topN, options.documentId)

        // Convert YAKE keywords to ExtractedKeyword format
        const extractedKeywords = yakeResult.keywords.map(yakeToExtractedKeyword)

        setKeywords(extractedKeywords)
        setRefinedConcepts([]) // YAKE doesn't provide refined concepts
        setStats({
          total: yakeResult.count,
          numPages: 0, // YAKE doesn't provide page count
          method: 'YAKE',
        })

        console.log(
          `[useKeywordExtraction] YAKE extracted ${extractedKeywords.length} keywords`
        )
      } else {
        // Use client-side Trie-based extraction
        const result: ExtractionResult = await extractKeywordsFromPDF(pdfUrl, options)

        setKeywords(result.keywords)
        setRefinedConcepts(result.refinedConcepts || [])
        setStats({
          total: result.totalKeywords,
          numPages: result.numPages,
          method: 'Trie',
          matcherStats: result.matcherStats,
        })

        console.log(
          `[useKeywordExtraction] Extracted ${result.keywords.length} unique keywords ` +
          `(${result.totalKeywords} total occurrences) from ${result.numPages} pages`
        )

        if (result.refinedConcepts) {
          console.log(
            `[useKeywordExtraction] Refined to ${result.refinedConcepts.length} academic concepts`
          )
        }

        if (result.matcherStats) {
          console.log(
            `[useKeywordExtraction] Trie stats: ${result.matcherStats.numTerms} terms, ` +
            `max depth ${result.matcherStats.maxDepth}, built in ${result.matcherStats.buildTimeMs.toFixed(2)}ms`
          )
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to extract keywords'
      console.error('[useKeywordExtraction] Error extracting keywords:', err)
      setError(errorMessage)
      setKeywords([])
      setRefinedConcepts([])
      setStats(initialStats)
    } finally {
      setLoading(false)
    }
  }, [mode])

  /**
   * Reset the extraction state
   * Used when switching between documents
   */
  const reset = useCallback(() => {
    setKeywords([])
    setRefinedConcepts([])
    setLoading(false)
    setError(null)
    setStats(initialStats)
  }, [])

  return {
    keywords,
    refinedConcepts,
    loading,
    error,
    stats,
    mode,
    extractKeywords,
    setMode,
    reset,
  }
}

// Re-export types for convenience
export type { RefinedConcept, RefinerOptions, ExtractionMode }
