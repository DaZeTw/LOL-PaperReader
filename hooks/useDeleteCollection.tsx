"use client"

import { useState } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

interface UseDeleteCollectionReturn {
  deleteCollection: (collectionId: string) => Promise<void>
  isDeleting: boolean
  error: Error | null
  reset: () => void
}

export function useDeleteCollection(): UseDeleteCollectionReturn {
  const { user } = useAuth()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const deleteCollection = async (collectionId: string): Promise<void> => {
    if (!user) {
      throw new Error('Authentication required')
    }

    setIsDeleting(true)
    setError(null)

    try {
      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/collections`
      const userId = user.dbId ? String(user.dbId) : user.id

      const response = await fetch(`${baseUrl}/${collectionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `Failed to delete collection: ${response.statusText}`)
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setIsDeleting(false)
    }
  }

  const reset = () => {
    setError(null)
  }

  return {
    deleteCollection,
    isDeleting,
    error,
    reset
  }
}