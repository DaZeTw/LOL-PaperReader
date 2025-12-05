import { useState, useEffect, useCallback } from 'react'

export interface Reference {
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

export function useReferences() {
  const [references, setReferences] = useState<Reference[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReferences = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/pdf/references')

      if (!response.ok) {
        throw new Error(`Failed to fetch references: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error occurred')
      }

      setReferences(data.references || [])
    } catch (err: any) {
      console.error('[useReferences] Error fetching references:', err)
      setError(err.message || 'Failed to load references')
      setReferences([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-fetch on mount
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
