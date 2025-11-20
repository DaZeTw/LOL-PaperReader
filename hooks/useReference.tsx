"use client"

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Reference } from './useReferences'

interface UseReferenceReturn {
  reference: Reference | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useReference(id: string | undefined): UseReferenceReturn {
  const { data: session } = useSession()
  const [reference, setReference] = useState<Reference | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchReference = async () => {
    if (!session?.user || !id) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/documents/${id}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Reference not found')
        }
        throw new Error(`Failed to fetch reference: ${response.statusText}`)
      }

      const data = await response.json()
      setReference(data.document)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
      setReference(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchReference()
  }, [session?.user, id])

  return {
    reference,
    isLoading,
    error,
    refetch: fetchReference
  }
}