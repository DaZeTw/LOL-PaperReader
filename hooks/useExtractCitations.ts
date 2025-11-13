"use client"

import { useState, useCallback, useRef } from "react"

export interface ExtractedCitation {
  id: string
  text: string
  confidence: number
  method: string
  spansPages: boolean
  destPage: number
}

interface ExtractionResult {
  citations: ExtractedCitation[]
  totalCitations: number
  highConfidenceCount: number
}

interface ExtractionsCache {
  [cacheKey: string]: ExtractionResult
}

/**
 * Hook for extracting citation references from PDF files
 * Uses the extraction API to get full reference text from PDF
 * Cache is isolated per-tab to prevent collisions
 */
export function useExtractCitations() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string>("")
  const cacheRef = useRef<ExtractionsCache>({})

  /**
   * Extract citations from a PDF file
   * Returns cached result if available
   * @param file - The PDF file to extract citations from
   * @param tabId - Tab ID for cache isolation (optional, but recommended)
   */
  const extractCitations = useCallback(async (file: File, tabId?: string): Promise<ExtractionResult | null> => {
    // Check cache first - include tabId in cache key for complete isolation
    const cacheKey = tabId ? `${tabId}_${file.name}_${file.size}` : `${file.name}_${file.size}`
    if (cacheRef.current[cacheKey]) {
      console.log("[useExtractCitations] Using cached extraction for:", file.name, "tab:", tabId || "global")
      return cacheRef.current[cacheKey]
    }

    setLoading(true)
    setError(null)
    setProgress("Uploading PDF...")

    try {
      const formData = new FormData()
      formData.append("file", file)

      setProgress("Extracting citations...")

      const response = await fetch("/api/citations/extract", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Extraction failed: ${response.status}`)
      }

      const result: ExtractionResult = await response.json()

      console.log("[useExtractCitations] Extracted", result.totalCitations, "citations from", file.name, "tab:", tabId || "global")

      // Cache the result with tab-specific key
      cacheRef.current[cacheKey] = result

      setProgress("Complete!")
      setLoading(false)
      return result
    } catch (err) {
      console.error("[useExtractCitations] Error:", err)
      setError(err instanceof Error ? err.message : "Failed to extract citations")
      setProgress("")
      setLoading(false)
      return null
    }
  }, [])

  /**
   * Get extracted citation by ID
   * @param fileName - Name of the PDF file
   * @param fileSize - Size of the PDF file
   * @param citationId - ID of the citation to retrieve
   * @param tabId - Optional tab ID for cache lookup
   */
  const getCitationById = useCallback(
    (fileName: string, fileSize: number, citationId: string, tabId?: string): ExtractedCitation | null => {
      const cacheKey = tabId ? `${tabId}_${fileName}_${fileSize}` : `${fileName}_${fileSize}`
      const extraction = cacheRef.current[cacheKey]
      if (!extraction) return null

      return extraction.citations.find((c) => c.id === citationId) || null
    },
    []
  )

  /**
   * Get all extracted citations for a file
   * @param fileName - Name of the PDF file
   * @param fileSize - Size of the PDF file
   * @param tabId - Optional tab ID for cache lookup
   */
  const getCitationsForFile = useCallback((fileName: string, fileSize: number, tabId?: string): ExtractedCitation[] => {
    const cacheKey = tabId ? `${tabId}_${fileName}_${fileSize}` : `${fileName}_${fileSize}`
    const extraction = cacheRef.current[cacheKey]
    return extraction?.citations || []
  }, [])

  /**
   * Clear the extraction cache
   */
  const clearCache = useCallback(() => {
    cacheRef.current = {}
  }, [])

  return {
    extractCitations,
    getCitationById,
    getCitationsForFile,
    loading,
    error,
    progress,
    clearCache,
  }
}