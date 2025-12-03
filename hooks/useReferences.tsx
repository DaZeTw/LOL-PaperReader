"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

export interface Reference {
  id: string // Maps from backend _id
  userId: string // Maps from backend user_id
  workspaceId?: string // Maps from backend workspace_id
  title: string
  originalFilename: string // Maps from backend original_filename
  storedPath: string // Maps from backend stored_path
  numPages: number // Maps from backend num_pages
  status: string
  source: string
  previewImage?: string // Maps from backend preview_image
  createdAt: string // Maps from backend created_at
  updatedAt: string // Maps from backend updated_at
  fileSize: number // Maps from backend file_size
  fileType: string // Maps from backend file_type ('pdf' | 'docx' | 'url')

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
  const isRefetching = useRef(false)

  const fetchReferences = useCallback(async (force = false) => {
    if (!user || !enabled) return

    // Create a cache key for current params
    const cacheKey = `${collection || ''}-${search || ''}-${user.id}`
    
    // Skip if we already fetched with these exact params and it's not a forced refetch
    if (!force && lastFetchParams.current === cacheKey && hasFetchedInitially.current && !isRefetching.current) {
      console.log('🔵 Skipping duplicate fetch for:', cacheKey)
      return
    }

    console.log('🔵 Fetching references for:', { collection, search, userId: user.id, force })
    
    setIsLoading(true)
    setError(null)
    isRefetching.current = true

    try {
      const params = new URLSearchParams()
      if (collection) params.append('collection', collection)
      if (search) params.append('search', search)

      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/documents`
      const userId = user.dbId ? String(user.dbId) : user.id

      console.log('🔵 Fetching from:', `${baseUrl}?${params.toString()}`)

      const response = await fetch(`${baseUrl}?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        cache: 'no-store',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch references: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      console.log('🔵 Raw API response:', data)

      // Map backend response to frontend camelCase Reference interface
      const mappedReferences = (data.documents || data || []).map((doc: any) => ({
        id: doc._id || doc.id, // Single id field from backend _id
        userId: doc.user_id,
        workspaceId: doc.workspace_id,
        title: doc.title,
        originalFilename: doc.original_filename,
        storedPath: doc.stored_path,
        numPages: doc.num_pages || 0,
        status: doc.status,
        source: doc.source || 'upload',
        previewImage: doc.preview_image,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
        fileSize: doc.file_size,
        fileType: doc.file_type,
      }))

      console.log('🔵 Mapped references:', mappedReferences.length, mappedReferences)
      
      setReferences(mappedReferences)
      setTotal(data.total || mappedReferences.length || 0)
      
      // Update cache tracking
      lastFetchParams.current = cacheKey
      hasFetchedInitially.current = true
      
    } catch (err) {
      console.error('🔴 Failed to fetch references:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
      setReferences([])
      setTotal(0)
    } finally {
      setIsLoading(false)
      isRefetching.current = false
    }
  }, [user?.id, collection, search, enabled])

  // Create a refetch function that forces a fetch
  const refetch = useCallback(async () => {
    console.log('🔵 Refetch called')
    await fetchReferences(true)
  }, [fetchReferences])

  // Only fetch when collection or search changes, not when fetchReferences changes
  useEffect(() => {
    if (user && enabled) {
      console.log('🔵 useEffect triggered - fetching references')
      fetchReferences(false)
    }
  }, [collection, search, user?.id, enabled])

  console.log('🔵 useReferences returning:', {
    referencesCount: references.length,
    isLoading,
    total,
    error: error?.message
  })

  return {
    references,
    isLoading,
    error,
    refetch,
    total
  }
}
