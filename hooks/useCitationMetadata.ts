"use client"

import { useState, useCallback, useRef } from "react"

export interface CitationMetadata {
  title?: string
  authors?: string[]
  year?: number
  abstract?: string
  url?: string
  doi?: string
  arxivId?: string
  pmid?: string
  semanticScholarId?: string
  fallback?: boolean
  searchQuery?: string
}

interface CitationMetadataCache {
  [key: string]: CitationMetadata
}

/**
 * Hook for fetching citation metadata from Semantic Scholar API
 * Includes automatic caching and parsing of citation text
 */
export function useCitationMetadata() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef<CitationMetadataCache>({})

  /**
   * Parse citation text to extract title, authors, and year
   * Supports multiple citation formats
   */
  const parseCitationText = useCallback((text: string): { title?: string; authors?: string[]; year?: number } => {
    const result: { title?: string; authors?: string[]; year?: number } = {}

    // Extract year (4-digit number, typically 19xx or 20xx)
    const yearMatch = text.match(/\b(19\d{2}|20\d{2})\b/)
    if (yearMatch) {
      result.year = parseInt(yearMatch[1])
    }

    // Extract authors (names before year or at the beginning)
    // Pattern: "FirstName LastName, FirstName LastName, and FirstName LastName"
    const authorPattern = /([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+(?:\s+(?:and|&)\s+[A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)?)/g
    const authorMatches = text.match(authorPattern)
    if (authorMatches && authorMatches.length > 0) {
      result.authors = authorMatches.slice(0, 3) // Take first 3 author names
    }

    // Extract title (text between period after authors and period before year/venue)
    // This is a heuristic and may need refinement
    const titleMatch = text.match(/\.\s*([A-Z][^.]+(?:\.[^.]+)?)\.\s*(?:In\s+|[A-Z][a-z]+\s+\d+|https?:)/)
    if (titleMatch) {
      result.title = titleMatch[1].trim()
    } else {
      // Fallback: try to find text after first period
      const fallbackTitleMatch = text.match(/\]\s*([^.]+)\.\s*/)
      if (fallbackTitleMatch) {
        result.title = fallbackTitleMatch[1].trim()
      }
    }

    return result
  }, [])

  /**
   * Fetch metadata for a citation
   * Automatically caches results to avoid redundant API calls
   */
  const fetchMetadata = useCallback(
    async (citationText: string, existingData?: { title?: string; authors?: string[]; year?: number }): Promise<CitationMetadata | null> => {
      // Create cache key
      const cacheKey = citationText.toLowerCase().trim()

      // Check cache first
      if (cacheRef.current[cacheKey]) {
        console.log("[useCitationMetadata] Using cached metadata for:", citationText.substring(0, 50))
        return cacheRef.current[cacheKey]
      }

      setLoading(true)
      setError(null)

      try {
        // Parse citation text if no existing data provided
        const parsed = existingData || parseCitationText(citationText)

        if (!parsed.title) {
          console.warn("[useCitationMetadata] Could not extract title from citation text:", citationText.substring(0, 100))
          setLoading(false)
          return null
        }

        console.log("[useCitationMetadata] Fetching metadata for:", parsed.title)

        // Call API to fetch metadata
        const response = await fetch("/api/references/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: parsed.title,
            authors: parsed.authors?.join(", "),
            year: parsed.year?.toString(),
          }),
        })

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const metadata: CitationMetadata = await response.json()

        // Cache the result
        cacheRef.current[cacheKey] = metadata

        setLoading(false)
        return metadata
      } catch (err) {
        console.error("[useCitationMetadata] Error fetching metadata:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch metadata")
        setLoading(false)
        return null
      }
    },
    [parseCitationText]
  )

  /**
   * Clear the metadata cache
   */
  const clearCache = useCallback(() => {
    cacheRef.current = {}
  }, [])

  /**
   * Get cached metadata without fetching
   */
  const getCachedMetadata = useCallback((citationText: string): CitationMetadata | null => {
    const cacheKey = citationText.toLowerCase().trim()
    return cacheRef.current[cacheKey] || null
  }, [])

  return {
    fetchMetadata,
    loading,
    error,
    clearCache,
    getCachedMetadata,
    parseCitationText,
  }
}
