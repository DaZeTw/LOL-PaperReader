"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'

export interface Reference {
  id: string
  title: string
  authors: string[]
  year: number
  source: string
  doi?: string
  abstract?: string
  fileName: string
  fileSize: number
  uploadedAt: string
  updatedAt: string
  collections?: string[]
  tags?: string[]
}

interface UseReferencesOptions {
  collection?: string | null
  search?: string
  enabled?: boolean
}

interface UseReferencesReturn {
  references: Reference[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
  total: number
}

export function useReferences(options: UseReferencesOptions = {}): UseReferencesReturn {
  const { collection, search, enabled = true } = options
  const { data: session } = useSession()
  const [references, setReferences] = useState<Reference[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [total, setTotal] = useState(0)
  
  // Track if we've already fetched for this combination
  const lastFetchParams = useRef<string>('')
  const hasFetchedInitially = useRef(false)

  const fetchReferences = useCallback(async () => {
    if (!session?.user || !enabled) return

    // Create a cache key for current params
    const cacheKey = `${collection || ''}-${search || ''}-${session.user.id}`
    
    // Skip if we already fetched with these exact params
    if (lastFetchParams.current === cacheKey && hasFetchedInitially.current) {
      console.log('Skipping duplicate fetch for:', cacheKey)
      return
    }

    console.log('Fetching references for:', { collection, search, userId: session.user.id })
    
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (collection) params.append('collection', collection)
      if (search) params.append('search', search)

      const response = await fetch(`/api/documents?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch references: ${response.statusText}`)
      }

      const data = await response.json()
      setReferences(data.documents || [])
      setTotal(data.total || data.documents?.length || 0)
      
      // Update cache tracking
      lastFetchParams.current = cacheKey
      hasFetchedInitially.current = true
      
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
      setReferences([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [session?.user?.id, collection, search, enabled])

  // Only fetch when collection or search changes, not when fetchReferences changes
  useEffect(() => {
    if (session?.user && enabled) {
      fetchReferences()
    }
  }, [collection, search, session?.user?.id, enabled]) // Don't include fetchReferences here

  return {
    references,
    isLoading,
    error,
    refetch: fetchReferences,
    total
  }
}