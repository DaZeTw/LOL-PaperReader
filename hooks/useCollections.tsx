"use client"

/**
 * THIS CONTEXT IS DEPRECATED
 * USE CollectionsContext INSTEAD contexts\CollectionsContext.tsx
 */
import { useState, useEffect, useCallback } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

export interface Collection {
  id: string
  name: string
  description: string
  documentCount: number
  createdAt: string
  updatedAt: string
  documentIds: string[]
}

interface UseCollectionsReturn {
  collections: Collection[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useCollections(): UseCollectionsReturn {
  const { user } = useAuth()
  const [collections, setCollections] = useState<Collection[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchCollections = useCallback(async () => {
    if (!user) return

    setIsLoading(true)
    setError(null)

    try {
      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/collections`
      const userId = user.dbId ? String(user.dbId) : user.id

      const response = await fetch(baseUrl, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch collections: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('Raw collections response:', data) // Add this debug line

      // Map the response to ensure proper ID field
      const mappedCollections = (data.collections || []).map((collection: any) => ({
        id: collection._id || collection.id, // Handle both _id and id
        name: collection.name,
        description: collection.description,
        documentCount: collection.document_count || collection.documentCount || 0,
        createdAt: collection.created_at || collection.createdAt,
        updatedAt: collection.updated_at || collection.updatedAt,
        documentIds: collection.document_ids || collection.documentIds || []
      }))

      console.log('Mapped collections:', mappedCollections) // Add this debug line
      setCollections(mappedCollections)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
      setCollections([])
    } finally {
      setIsLoading(false)
    }
  }, [user])

  const refetch = useCallback(async () => {
    await fetchCollections()
  }, [fetchCollections])

  useEffect(() => {
    if (user) {
      fetchCollections()
    }
  }, [fetchCollections, user])

  return {
    collections,
    isLoading,
    error,
    refetch
  }
}