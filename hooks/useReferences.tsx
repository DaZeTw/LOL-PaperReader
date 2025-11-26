"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

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
  const { user } = useAuth()
  const [references, setReferences] = useState<Reference[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [total, setTotal] = useState(0)
  
  // Track if we've already fetched for this combination
  const lastFetchParams = useRef<string>('')
  const hasFetchedInitially = useRef(false)

  const fetchReferences = useCallback(async () => {
    if (!user || !enabled) return

    // Create a cache key for current params
    const cacheKey = `${collection || ''}-${search || ''}-${user.id}`
    
    // Skip if we already fetched with these exact params
    if (lastFetchParams.current === cacheKey && hasFetchedInitially.current) {
      console.log('Skipping duplicate fetch for:', cacheKey)
      return
    }

    console.log('Fetching references for:', { collection, search, userId: user.id })
    
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (collection) params.append('collection', collection)
      if (search) params.append('search', search)

      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/documents`
      const userId = user.dbId ? String(user.dbId) : user.id

      const response = await fetch(`${baseUrl}?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        cache: 'no-store',
        credentials: 'include',
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
  }, [user?.id, collection, search, enabled])

  // Only fetch when collection or search changes, not when fetchReferences changes
  useEffect(() => {
    if (user && enabled) {
      fetchReferences()
    }
  }, [collection, search, user?.id, enabled]) // Don't include fetchReferences here

  return {
    references,
    isLoading,
    error,
    refetch: fetchReferences,
    total
  }
}