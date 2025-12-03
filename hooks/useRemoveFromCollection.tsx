"use client"

import { useState } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

interface UseRemoveFromCollectionReturn {
  removeFromCollection: (collectionId: string, referenceIds: string[]) => Promise<void>
  isRemoving: boolean
  error: Error | null
  reset: () => void
}

export function useRemoveFromCollection(): UseRemoveFromCollectionReturn {
  const { user } = useAuth()
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const removeFromCollection = async (collectionId: string, referenceIds: string[]): Promise<void> => {
    if (!user) {
      throw new Error('Authentication required')
    }

    setIsRemoving(true)
    setError(null)

    try {
      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/collections`
      const userId = user.dbId ? String(user.dbId) : user.id

      // Remove documents one by one since your API expects individual document_id in URL
      const promises = referenceIds.map(async (documentId) => {
        const response = await fetch(`${baseUrl}/${collectionId}/documents/${documentId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
          },
          credentials: 'include',
        })

        if (!response.ok) {
          let errorMessage = `Failed to remove document from collection: ${response.statusText}`
          
          try {
            const errorData = await response.json()
            if (errorData.detail) {
              errorMessage = errorData.detail
            }
          } catch (parseError) {
            console.warn('Could not parse error response:', parseError)
          }
          
          throw new Error(errorMessage)
        }

        return response.json()
      })

      await Promise.all(promises)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setIsRemoving(false)
    }
  }

  const reset = () => {
    setError(null)
  }

  return {
    removeFromCollection,
    isRemoving,
    error,
    reset
  }
}