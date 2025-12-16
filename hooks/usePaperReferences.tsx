"use client"

import { useState, useEffect, useCallback } from 'react'
import { BACKEND_API_URL } from '@/lib/config'

/**
 * Interface for extracted reference from a PDF's References section
 * Different from the document library Reference which represents uploaded documents
 */
export interface PaperReference {
  id: number
  raw_text: string
  title?: string
  authors?: string[]
  year?: number
  doi?: string
  arxiv_id?: string
  url?: string
  venue?: string
  link?: string
  link_type?: 'doi' | 'arxiv' | 'url' | 'scholar'
}

interface UsePaperReferencesReturn {
  references: PaperReference[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Hook for fetching extracted references from a specific PDF document.
 * This is different from useReferences which manages the document library.
 * 
 * @param documentId - The ID of the document to fetch references for
 */
export function usePaperReferences(documentId: string | null): UsePaperReferencesReturn {
  const [references, setReferences] = useState<PaperReference[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReferences = useCallback(async () => {
    if (!documentId) {
      setReferences([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const baseUrl = BACKEND_API_URL.replace(/\/$/, '')
      const response = await fetch(`${baseUrl}/api/pdf/references?document_id=${encodeURIComponent(documentId)}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch references: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error occurred')
      }

      setReferences(data.references || [])
    } catch (err: any) {
      console.error('[usePaperReferences] Error fetching references:', err)
      setError(err.message || 'Failed to load references')
      setReferences([])
    } finally {
      setLoading(false)
    }
  }, [documentId])

  // Auto-fetch when documentId changes
  useEffect(() => {
    fetchReferences()
  }, [fetchReferences])

  return {
    references,
    loading,
    error,
    refetch: fetchReferences
  }
}
