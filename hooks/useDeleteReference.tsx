"use client"

import { useState } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

interface UseDeleteReferenceReturn {
  deleteReference: (id: string) => Promise<void>
  deleteReferences: (ids: string[]) => Promise<void>
  isDeleting: boolean
  error: Error | null
  reset: () => void
}

export function useDeleteReference(): UseDeleteReferenceReturn {
  const { user, login } = useAuth()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const deleteReferences = async (ids: string[]): Promise<void> => {
    if (!user) {
      login()
      throw new Error('Authentication required')
    }

    if (!ids || ids.length === 0) {
      throw new Error('No document IDs provided')
    }

    setIsDeleting(true)
    setError(null)

    try {
      console.log('Deleting references with IDs:', ids)
      
      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/documents/delete`
      const userId = user.dbId ? String(user.dbId) : user.id

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        body: JSON.stringify({ documentIds: ids }), // Changed to documentIds array
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Delete failed: ${response.statusText}`)
      }

      const result = await response.json()
      console.log('Delete result:', result)
      
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setIsDeleting(false)
    }
  }

  // Single reference deletion - convenience wrapper
  const deleteReference = async (id: string): Promise<void> => {
    return deleteReferences([id])
  }

  const reset = () => {
    setError(null)
  }

  return {
    deleteReference,
    deleteReferences, // Also expose bulk delete
    isDeleting,
    error,
    reset
  }
}