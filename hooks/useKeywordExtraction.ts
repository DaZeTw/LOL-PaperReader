import { useState, useCallback } from 'react'
import {
  extractKeywordsFromPDF,
  ExtractedKeyword,
  ExtractionResult,
  ExtractionOptions,
} from '@/lib/keyword-extractor'
import type { RefinedConcept, RefinerOptions } from '@/lib/concept-refiner'
import type { KeyBERTKeyword } from './useKeyBERTExtraction'

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
  model?: string // KeyBERT model used
  rawCount?: number // Raw keywords before refinement
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
  extractKeywords: (pdfUrl: string, options?: ExtractionOptions) => Promise<void>
  /** Extract using backend KeyBERT API (requires backend running) */
  extractKeywordsBackend: (text: string, options?: BackendExtractionOptions) => Promise<void>
  reset: () => void
  /** Whether using backend API or frontend extraction */
  useBackend: boolean
  setUseBackend: (use: boolean) => void
}

/**
 * Options for backend extraction
 */
export interface BackendExtractionOptions {
  top_n?: number
  use_mmr?: boolean
  diversity?: number
  min_ngram?: number
  max_ngram?: number
  exclude_generic?: boolean
  apiBaseUrl?: string
}

/**
 * Initial state for extraction stats
 */
const initialStats: ExtractionStats = {
  total: 0,
  numPages: 0,
}

/**
 * Convert KeyBERT response to RefinedConcept format
 */
function convertKeyBERTToRefined(keywords: KeyBERTKeyword[]): RefinedConcept[] {
  return keywords.map(kw => ({
    concept: kw.concept,
    score: kw.score,
    isOntologyAligned: kw.is_ontology_aligned,
    frequency: kw.frequency,
    category: kw.category,
    url: kw.url,
    shortDefinition: kw.short_definition,
  }))
}

/**
 * React hook for managing keyword extraction state.
 * 
 * Supports two extraction modes:
 * 1. Frontend (default): Uses Trie-based term matching with draft concepts
 * 2. Backend: Uses KeyBERT API for semantic, BERT-based extraction
 * 
 * @returns Object containing keywords, refinedConcepts, loading state, error, stats, and control functions
 * 
 * @example
 * ```tsx
 * const { keywords, refinedConcepts, loading, extractKeywords, extractKeywordsBackend } = useKeywordExtraction()
 * 
 * // Frontend extraction (from PDF URL)
 * await extractKeywords(pdfUrl)
 * 
 * // Backend extraction (from text, requires backend running)
 * await extractKeywordsBackend(documentText)
 * ```
 */
export function useKeywordExtraction(): UseKeywordExtractionReturn {
  const [keywords, setKeywords] = useState<ExtractedKeyword[]>([])
  const [refinedConcepts, setRefinedConcepts] = useState<RefinedConcept[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<ExtractionStats>(initialStats)
  const [useBackend, setUseBackend] = useState(false)

  /**
   * Extract keywords from a PDF document (frontend Trie-based)
   * @param pdfUrl - URL or path to the PDF file
   * @param options - Extraction options (refinement settings, etc.)
   */
  const extractKeywords = useCallback(async (
    pdfUrl: string,
    options: ExtractionOptions = {}
  ) => {
    setLoading(true)
    setError(null)

    try {
      console.log('[useKeywordExtraction] Starting extraction for:', pdfUrl)
      const result: ExtractionResult = await extractKeywordsFromPDF(pdfUrl, options)

      setKeywords(result.keywords)
      setRefinedConcepts(result.refinedConcepts || [])
      setStats({
        total: result.totalKeywords,
        numPages: result.numPages,
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
  }, [])

  /**
   * Extract keywords using backend KeyBERT API
   * @param text - Document text to extract keywords from
   * @param options - Backend extraction options
   */
  const extractKeywordsBackend = useCallback(async (
    text: string,
    options: BackendExtractionOptions = {}
  ) => {
    if (!text || text.length < 50) {
      setError('Text too short for keyword extraction (min 50 characters)')
      return
    }

    setLoading(true)
    setError(null)

    const apiBaseUrl = options.apiBaseUrl || getApiBaseUrl()

    try {
      console.log('[useKeywordExtraction] Starting KeyBERT extraction via API')

      const response = await fetch(`${apiBaseUrl}/api/keywords/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          top_n: options.top_n ?? 20,
          use_mmr: options.use_mmr ?? true,
          diversity: options.diversity ?? 0.7,
          min_ngram: options.min_ngram ?? 2,
          max_ngram: options.max_ngram ?? 5,
          exclude_generic: options.exclude_generic ?? true,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Backend API error: ${response.status} - ${errorText}`)
      }

      const result = await response.json()

      // Convert to RefinedConcept format
      const refined = convertKeyBERTToRefined(result.keywords)

      // Also create ExtractedKeyword format for compatibility
      const extracted: ExtractedKeyword[] = result.keywords.map((kw: KeyBERTKeyword) => ({
        keyword: kw.concept,
        count: kw.frequency,
        category: kw.category,
        url: kw.url,
        shortDefinition: kw.short_definition,
      }))

      setKeywords(extracted)
      setRefinedConcepts(refined)
      setStats({
        total: result.raw_count,
        numPages: 0, // Backend doesn't track pages
        model: result.model,
        rawCount: result.raw_count,
      })

      console.log(
        `[useKeywordExtraction] KeyBERT extracted ${result.refined_count} concepts ` +
        `(from ${result.raw_count} raw) using ${result.model}`
      )
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to extract keywords via backend'
      console.error('[useKeywordExtraction] Backend extraction error:', err)
      setError(errorMessage)
      setKeywords([])
      setRefinedConcepts([])
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
    extractKeywords,
    extractKeywordsBackend,
    reset,
    useBackend,
    setUseBackend,
  }
}

/**
 * Get the backend API base URL
 */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    if (isLocalhost) {
      return 'http://localhost:8080'
    }
    return window.location.origin
  }
  return 'http://localhost:8080'
}

// Re-export types for convenience
export type { RefinedConcept, RefinerOptions }
