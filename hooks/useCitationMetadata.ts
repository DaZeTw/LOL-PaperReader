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
   * Supports multiple citation formats including numbered references
   */
  const parseCitationText = useCallback((text: string): { title?: string; authors?: string[]; year?: number } => {
    const result: { title?: string; authors?: string[]; year?: number } = {}

    // Remove citation number prefix like "[21]" for cleaner parsing
    const cleanText = text.replace(/^\[\d+\]\s*/, '')

    // Extract year (4-digit number, typically 19xx or 20xx)
    const yearMatch = cleanText.match(/\b(19\d{2}|20\d{2})\b/)
    if (yearMatch) {
      result.year = parseInt(yearMatch[1])
    }

    // Extract authors - split by periods and take the first part (before year)
    const parts = cleanText.split('.')
    if (parts.length > 0) {
      const authorsText = parts[0].trim()
      // Split by commas or "and"
      const authorList = authorsText.split(/,\s*(?:and\s+)?|(?:\s+and\s+)/i)
      result.authors = authorList.map(a => a.trim()).filter(a => a.length > 0).slice(0, 5)
    }

    // Extract title - it's typically after the year and before the venue
    // Pattern: "Year. Title. Venue/Journal"
    if (result.year) {
      // Find text after first occurrence of year
      const yearIndex = cleanText.indexOf(result.year.toString())
      if (yearIndex !== -1) {
        const afterYear = cleanText.substring(yearIndex + 4).trim()
        // Remove leading period and whitespace
        const titlePart = afterYear.replace(/^[.\s]+/, '')

        // Extract title - look for the pattern where title ends before a capitalized single-word venue
        // that is likely a journal name (e.g., "Science", "Nature", "Nature Machine Intelligence")
        // or before common venue indicators like "In Proceedings", "arXiv", URLs
        
        // Try to find where title ends by looking for a pattern like: title. Journal Name (or similar venue)
        // The title can have multiple sentences (periods), so we need to find where the venue starts
        
        // Pattern: Title can have multiple sentences, but venue is typically followed by numbers
        // Look for the pattern where a capitalized word (venue name) is followed by digits
        // Examples: "title. Science 13", "title. Nature Machine Intelligence 5"
        // Also look for: "In ", "Proceedings", "arXiv", URLs
        
        // Split by periods and identify title vs venue segments
        const segments = titlePart.split('.').map(s => s.trim()).filter(s => s.length > 0)
        
        if (segments.length >= 2) {
          // Find where venue starts by looking for segments followed by numbers or venue keywords
          let venueStartIndex = -1
          
          for (let i = 0; i < segments.length; i++) {
            const segment = segments[i]
            
            // Check if segment looks like a venue:
            // 1. Contains common venue keywords
            // 2. Contains volume/page numbers (e.g., "Science 13, 10", "Nature 5")
            // 3. Starts with capitalized word(s) followed by numbers
            const nextSegment = i + 1 < segments.length ? segments[i + 1] : ''
            
            const isVenueKeyword = /^(In|Proceedings|arXiv|http|https|www)/i.test(segment)
            const hasVolumeInfo = /\s+\d+\s*[,\s]+\d+\s*\(/.test(segment) // "Science 13, 10 (2020)"
            const isFollowedByNumber = /^\d+\s*[,(]/.test(nextSegment)
            const startsWithCapitalAndHasNumber = /^[A-Z][a-z]+\s+\d+/.test(segment) // "Science 13"
            const looksLikeVenue = (isVenueKeyword || hasVolumeInfo || (startsWithCapitalAndHasNumber && segment.length < 30))
            
            if (looksLikeVenue) {
              venueStartIndex = i
              break
            }
          }
          
          if (venueStartIndex > 0) {
            // Title is all segments before the venue
            result.title = segments.slice(0, venueStartIndex).join('. ').trim()
          } else if (segments.length >= 3) {
            // Fallback: assume last 1-2 segments are venue info
            // Keep first segments as title
            result.title = segments.slice(0, -2).join('. ').trim()
          } else {
            // Take first segment as title
            result.title = segments[0]
          }
        } else if (segments.length === 1) {
          result.title = segments[0]
        }
      }
    }

    // If title extraction failed, try alternative pattern for numbered citations
    if (!result.title) {
      // Pattern: "[N] Authors. Year. Title..."
      const altTitleMatch = cleanText.match(/\d{4}\.\s*([^.]+(?:\.[^.]*?)?)\./)
      if (altTitleMatch) {
        result.title = altTitleMatch[1].trim()
      }
    }

    console.log("[parseCitationText] Parsed:", { text: text.substring(0, 100), result })
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

        // IMPROVED: Build comprehensive search query from citation text
        let searchTitle = parsed.title || ''
        
        console.log("[useCitationMetadata] Initial parsed title:", searchTitle)
        
        // Always try to extract full title from citation text for better search
        const cleanText = citationText.replace(/^\[\d+\]\s*/, '')
        
        // Strategy 1: Try to find title between year and venue using regex
        // Pattern: Year. TITLE SEGMENTS. [Venue with number]
        const titleMatch = cleanText.match(/\d{4}\.\s*(.+?)(?:\.\s*[A-Z][^.]*\s+\d+[,\s])/)
        if (titleMatch && titleMatch[1]) {
          const extractedTitle = titleMatch[1].trim()
          // Use extracted title if it's longer and more descriptive
          if (extractedTitle.length > searchTitle.length && extractedTitle.length > 20) {
            searchTitle = extractedTitle
            console.log("[useCitationMetadata] Using regex extracted title:", searchTitle.substring(0, 100))
          }
        }
        
        // Strategy 2: If regex didn't work well, use segment-based extraction
        if (!searchTitle || searchTitle.length < 15 || searchTitle.length < 30) {
          const segments = cleanText.split('.').filter(s => s.trim().length > 0)
          console.log("[useCitationMetadata] Segments:", segments.length, segments)
          
          // Authors is segment[0], Year is in segment[1], Title starts from segment[2]
          if (segments.length >= 3) {
            // Find where venue starts - look for segments with journal/conference name followed by numbers
            let venueIndex = -1
            for (let i = 3; i < segments.length; i++) {
              const segment = segments[i]
              // Check if this looks like a venue: has capitalized words and numbers
              if (segment.match(/[A-Z][a-z]+\s+[A-Z]/) && /\d+/.test(segment)) {
                venueIndex = i
                console.log("[useCitationMetadata] Found venue at index", venueIndex, ":", segment)
                break
              }
            }
            
            if (venueIndex > 2) {
              searchTitle = segments.slice(2, venueIndex).join('. ').trim()
            } else if (segments.length > 2) {
              // Take everything from segment[2] to the end except last 2 segments
              searchTitle = segments.slice(2, -2).join('. ').trim()
            }
            
            if (searchTitle && searchTitle.length > 15) {
              console.log("[useCitationMetadata] Using segment-based title:", searchTitle.substring(0, 100))
            }
          }
        }
        
        // Strategy 3: Final fallback - take substantial part of citation after authors/year
        if (!searchTitle || searchTitle.length < 30) {
          const afterYear = cleanText.replace(/^[^0-9]+\d{4}\.\s*/, '').split('.')[0]
          if (afterYear && afterYear.length > 30) {
            // Get multiple segments if available
            const allAfterYear = cleanText.replace(/^[^0-9]+\d{4}\.\s*/, '')
            const titleSegments = allAfterYear.split('.').slice(0, -2).join('.').trim()
            if (titleSegments.length > searchTitle.length) {
              searchTitle = titleSegments
              console.log("[useCitationMetadata] Using fallback title:", searchTitle.substring(0, 100))
            }
          }
        }
        
        console.log("[useCitationMetadata] Final search title:", searchTitle)

        // Call API to fetch metadata
        const response = await fetch("/api/references/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: searchTitle,
            authors: parsed.authors?.join(", "),
            year: parsed.year?.toString(),
            fullCitation: citationText, // Include full citation for better search
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
