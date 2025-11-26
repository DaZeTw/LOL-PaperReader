"use client"

import { useState, useEffect } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { Reference } from './useReferences'
import { useAuth } from '@/hooks/useAuth'

interface UseReferenceReturn {
  reference: Reference | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useReference(id: string | undefined): UseReferenceReturn {
  const { user } = useAuth()
  const [reference, setReference] = useState<Reference | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchReference = async () => {
    if (!user || !id) return

    setIsLoading(true)
    setError(null)

    try {
      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/documents/${id}`
      const userId = user.dbId ? String(user.dbId) : user.id

      const response = await fetch(baseUrl, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        cache: 'no-store',
        credentials: 'include',
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
  }, [user, id])

  return {
    reference,
    isLoading,
    error,
    refetch: fetchReference
  }
}