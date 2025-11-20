"use client"

import { useState } from 'react'
import { useSession } from 'next-auth/react'

interface UseDeleteReferenceReturn {
  deleteReference: (id: string) => Promise<void>
  deleteReferences: (ids: string[]) => Promise<void>
  isDeleting: boolean
  error: Error | null
  reset: () => void
}

export function useDeleteReference(): UseDeleteReferenceReturn {
  const { data: session } = useSession()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const deleteReferences = async (ids: string[]): Promise<void> => {
    if (!session?.user) {
      throw new Error('Authentication required')
    }

    if (!ids || ids.length === 0) {
      throw new Error('No document IDs provided')
    }

    setIsDeleting(true)
    setError(null)

    try {
      console.log('Deleting references with IDs:', ids)
      
      const response = await fetch('/api/documents/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentIds: ids }), // Changed to documentIds array
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