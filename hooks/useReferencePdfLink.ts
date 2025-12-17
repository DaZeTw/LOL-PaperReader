"use client"

import { useState, useCallback, useRef } from "react"

export interface PdfLinkMetadata {
    doi?: string
    arxivId?: string
    title?: string
    authors?: string[]
    year?: number
}

export interface PdfLinkResult {
    pdfUrl: string | null
    source: "arxiv" | "unpaywall" | "semantic_scholar" | "crossref" | "doi" | null
    isOpenAccess: boolean
}

interface PdfLinkCache {
    [key: string]: PdfLinkResult
}

/**
 * Hook for resolving PDF links from paper metadata.
 * 
 * Uses multiple sources with fallback strategy:
 * - arXiv (direct PDF link)
 * - Unpaywall (legal open access)
 * - Semantic Scholar
 * - CrossRef
 * 
 * @example
 * ```tsx
 * const { resolvePdfLink, loading, error } = useReferencePdfLink()
 * 
 * const handleClick = async () => {
 *   const result = await resolvePdfLink({
 *     doi: "10.1145/3491102.3501968",
 *     title: "Paper Title"
 *   })
 *   if (result.pdfUrl) {
 *     window.open(result.pdfUrl, '_blank')
 *   }
 * }
 * ```
 */
export function useReferencePdfLink() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const cacheRef = useRef<PdfLinkCache>({})

    /**
     * Generate cache key from metadata
     */
    const getCacheKey = useCallback((metadata: PdfLinkMetadata): string => {
        if (metadata.arxivId) return `arxiv:${metadata.arxivId}`
        if (metadata.doi) return `doi:${metadata.doi}`
        if (metadata.title) return `title:${metadata.title.toLowerCase().substring(0, 100)}`
        return ""
    }, [])

    /**
     * Resolve PDF link from paper metadata
     */
    const resolvePdfLink = useCallback(
        async (metadata: PdfLinkMetadata): Promise<PdfLinkResult> => {
            const emptyResult: PdfLinkResult = {
                pdfUrl: null,
                source: null,
                isOpenAccess: false,
            }

            // Validate input
            if (!metadata.doi && !metadata.arxivId && !metadata.title) {
                setError("At least one of doi, arxivId, or title must be provided")
                return emptyResult
            }

            // Check cache
            const cacheKey = getCacheKey(metadata)
            if (cacheKey && cacheRef.current[cacheKey]) {
                console.log("[useReferencePdfLink] Cache hit:", cacheKey)
                return cacheRef.current[cacheKey]
            }

            setLoading(true)
            setError(null)

            try {
                const response = await fetch("/api/references/pdf-link", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(metadata),
                })

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`)
                }

                const data = await response.json()

                const result: PdfLinkResult = {
                    pdfUrl: data.pdfUrl || null,
                    source: data.source || null,
                    isOpenAccess: data.isOpenAccess ?? false,
                }

                // Cache successful result
                if (cacheKey && result.pdfUrl) {
                    cacheRef.current[cacheKey] = result
                }

                return result
            } catch (err) {
                console.error("[useReferencePdfLink] Error:", err)
                const errorMessage = err instanceof Error ? err.message : "Failed to resolve PDF link"
                setError(errorMessage)
                return emptyResult
            } finally {
                setLoading(false)
            }
        },
        [getCacheKey]
    )

    /**
     * Get cached PDF link result without fetching
     */
    const getCachedPdfLink = useCallback(
        (metadata: PdfLinkMetadata): PdfLinkResult | null => {
            const cacheKey = getCacheKey(metadata)
            return cacheKey ? cacheRef.current[cacheKey] || null : null
        },
        [getCacheKey]
    )

    /**
     * Clear the cache
     */
    const clearCache = useCallback(() => {
        cacheRef.current = {}
    }, [])

    return {
        resolvePdfLink,
        getCachedPdfLink,
        clearCache,
        loading,
        error,
    }
}
