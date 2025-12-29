"use client"
/**
 * THIS CONTEXT IS DEPRECATED
 * USE CollectionsContext INSTEAD contexts\CollectionsContext.tsx
 */
import { useState } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'
import type { Collection } from '@/hooks/useCollections'

interface CreateCollectionData {
  name: string
  description?: string
}

interface UseCreateCollectionReturn {
  createCollection: (data: CreateCollectionData) => Promise<Collection>
  isCreating: boolean
  error: Error | null
  reset: () => void
}

export function useCreateCollection(): UseCreateCollectionReturn {
  const { user, login } = useAuth()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createCollection = async (data: CreateCollectionData): Promise<Collection> => {
    if (!user) {
      login()
      throw new Error('Authentication required')
    }

    setIsCreating(true)
    setError(null)

    try {
      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/collections`
      const userId = user.dbId ? String(user.dbId) : user.id

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        body: JSON.stringify(data),
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `Failed to create collection: ${response.statusText}`)
      }

      const result = await response.json()
      return result.collection
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setIsCreating(false)
    }
  }

  const reset = () => {
    setError(null)
  }

  return {
    createCollection,
    isCreating,
    error,
    reset
  }
}