"use client"
/**
 * THIS CONTEXT IS DEPRECATED
 * USE CollectionsContext INSTEAD contexts\CollectionsContext.tsx
 */
import { useState } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

interface UseAddToCollectionReturn {
  addToCollection: (collectionId: string, referenceIds: string[]) => Promise<void>
  isAdding: boolean
  error: Error | null
  reset: () => void
}

export function useAddToCollection(): UseAddToCollectionReturn {
  const { user } = useAuth()
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const addToCollection = async (collectionId: string, referenceIds: string[]): Promise<void> => {
    if (!user) {
      throw new Error('Authentication required')
    }

    setIsAdding(true)
    setError(null)

    try {
      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/collections`
      const userId = user.dbId ? String(user.dbId) : user.id

      // Add documents one by one since your API expects single documentId
      const promises = referenceIds.map(async (documentId) => {
        const response = await fetch(`${baseUrl}/${collectionId}/documents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
          },
          body: JSON.stringify({
            documentId: documentId // Match the backend's AddDocumentRequest model
          }),
          credentials: 'include',
        })

        if (!response.ok) {
          let errorMessage = `Failed to add document to collection: ${response.statusText}`

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
      setIsAdding(false)
    }
  }

  const reset = () => {
    setError(null)
  }

  return {
    addToCollection,
    isAdding,
    error,
    reset
  }
}