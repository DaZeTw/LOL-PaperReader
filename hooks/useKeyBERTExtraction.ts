/**
 * useKeyBERTExtraction Hook
 * 
 * Extracts keywords from document text using the backend KeyBERT API.
 * Provides semantic, context-aware keyword extraction with BERT embeddings.
 */

import { useState, useCallback } from 'react'

// Types matching backend response
export interface KeyBERTKeyword {
    concept: string
    score: number
    is_ontology_aligned: boolean
    frequency: number
    category: string
    url?: string
    short_definition?: string
}

export interface KeyBERTExtractionResult {
    keywords: KeyBERTKeyword[]
    raw_count: number
    refined_count: number
    model: string
}

export interface KeyBERTExtractionOptions {
    top_n?: number
    use_mmr?: boolean
    diversity?: number
    min_ngram?: number
    max_ngram?: number
    exclude_generic?: boolean
}

export interface UseKeyBERTExtractionReturn {
    keywords: KeyBERTKeyword[]
    isLoading: boolean
    error: string | null
    model: string | null
    rawCount: number
    refinedCount: number
    extractKeywords: (text: string, options?: KeyBERTExtractionOptions) => Promise<KeyBERTKeyword[]>
    reset: () => void
}

const DEFAULT_OPTIONS: KeyBERTExtractionOptions = {
    top_n: 20,
    use_mmr: true,
    diversity: 0.7,
    min_ngram: 2,
    max_ngram: 5,
    exclude_generic: true,
}

/**
 * Hook for extracting keywords using the backend KeyBERT API.
 * 
 * @param apiBaseUrl - Base URL for the backend API (default: auto-detect)
 * @returns Extraction state and functions
 * 
 * @example
 * ```tsx
 * const { keywords, isLoading, extractKeywords } = useKeyBERTExtraction()
 * 
 * const handleExtract = async () => {
 *   await extractKeywords(documentText, { top_n: 15 })
 * }
 * ```
 */
export function useKeyBERTExtraction(
    apiBaseUrl?: string
): UseKeyBERTExtractionReturn {
    const [keywords, setKeywords] = useState<KeyBERTKeyword[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [model, setModel] = useState<string | null>(null)
    const [rawCount, setRawCount] = useState(0)
    const [refinedCount, setRefinedCount] = useState(0)

    // Determine API base URL
    const getApiUrl = useCallback(() => {
        if (apiBaseUrl) return apiBaseUrl
        // Auto-detect: use same origin in production, localhost in dev
        if (typeof window !== 'undefined') {
            const isLocalhost = window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1'
            if (isLocalhost) {
                return 'http://localhost:8080'
            }
            return window.location.origin
        }
        return 'http://localhost:8080'
    }, [apiBaseUrl])

    const extractKeywords = useCallback(async (
        text: string,
        options?: KeyBERTExtractionOptions
    ): Promise<KeyBERTKeyword[]> => {
        if (!text || text.length < 50) {
            setError('Text too short for keyword extraction (min 50 characters)')
            return []
        }

        setIsLoading(true)
        setError(null)

        try {
            const mergedOptions = { ...DEFAULT_OPTIONS, ...options }
            const apiUrl = getApiUrl()

            const response = await fetch(`${apiUrl}/api/keywords/extract`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    ...mergedOptions,
                }),
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`API error: ${response.status} - ${errorText}`)
            }

            const result: KeyBERTExtractionResult = await response.json()

            setKeywords(result.keywords)
            setModel(result.model)
            setRawCount(result.raw_count)
            setRefinedCount(result.refined_count)

            console.log(`[KeyBERT] Extracted ${result.refined_count} keywords (from ${result.raw_count} raw)`)

            return result.keywords
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error'
            console.error('[KeyBERT] Extraction failed:', errorMessage)
            setError(errorMessage)
            return []
        } finally {
            setIsLoading(false)
        }
    }, [getApiUrl])

    const reset = useCallback(() => {
        setKeywords([])
        setError(null)
        setModel(null)
        setRawCount(0)
        setRefinedCount(0)
    }, [])

    return {
        keywords,
        isLoading,
        error,
        model,
        rawCount,
        refinedCount,
        extractKeywords,
        reset,
    }
}

/**
 * Check if the KeyBERT API is available.
 */
export async function checkKeyBERTHealth(apiBaseUrl = 'http://localhost:8080'): Promise<{
    status: string
    keybert_available: boolean
    ontology_loaded: boolean
    ontology_count: number
}> {
    const response = await fetch(`${apiBaseUrl}/api/keywords/health`)
    if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`)
    }
    return response.json()
}
