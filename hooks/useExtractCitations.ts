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
  [fileName: string]: ExtractionResult
}

/**
 * Hook for extracting citation references from PDF files
 * Uses the extraction API to get full reference text from PDF
 */
export function useExtractCitations() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string>("")
  const cacheRef = useRef<ExtractionsCache>({})

  /**
   * Extract citations from a PDF file
   * Returns cached result if available
   */
  const extractCitations = useCallback(async (file: File): Promise<ExtractionResult | null> => {
    // Check cache first
    const cacheKey = `${file.name}-${file.size}`
    if (cacheRef.current[cacheKey]) {
      console.log("[useExtractCitations] Using cached extraction for:", file.name)
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

      console.log("[useExtractCitations] Extracted", result.totalCitations, "citations from", file.name)

      // Cache the result
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
   */
  const getCitationById = useCallback(
    (fileName: string, fileSize: number, citationId: string): ExtractedCitation | null => {
      const cacheKey = `${fileName}-${fileSize}`
      const extraction = cacheRef.current[cacheKey]
      if (!extraction) return null

      return extraction.citations.find((c) => c.id === citationId) || null
    },
    []
  )

  /**
   * Get all extracted citations for a file
   */
  const getCitationsForFile = useCallback((fileName: string, fileSize: number): ExtractedCitation[] => {
    const cacheKey = `${fileName}-${fileSize}`
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
