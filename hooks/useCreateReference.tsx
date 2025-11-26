"use client"

import { useState } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { Reference } from './useReferences'
import { useAuth } from '@/hooks/useAuth'

export interface CreateReferenceData {
  title?: string
  authors?: string[]
  year?: number
  source?: string
  doi?: string
  abstract?: string
  collections?: string[]
  tags?: string[]
}

interface UseCreateReferenceReturn {
  createReference: (file: File, metadata?: CreateReferenceData) => Promise<Reference>
  isCreating: boolean
  error: Error | null
  reset: () => void
}

export function useCreateReference(): UseCreateReferenceReturn {
  const { user, login } = useAuth()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createReference = async (file: File, metadata?: CreateReferenceData): Promise<Reference> => {
    if (!user) {
      login()
      throw new Error('Authentication required')
    }

    // Validate file type
    if (!file.type.includes('pdf')) {
      throw new Error('Only PDF files are supported')
    }

    setIsCreating(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      
      // Add metadata if provided
      if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
          if (value !== undefined) {
            if (Array.isArray(value)) {
              formData.append(key, JSON.stringify(value))
            } else {
              formData.append(key, String(value))
            }
          }
        })
      }

      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/documents`
      const userId = user.dbId ? String(user.dbId) : user.id

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'X-User-Id': userId,
        },
        body: formData,
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Upload failed: ${response.statusText}`)
      }

      const data = await response.json()
      return data.document
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
    createReference,
    isCreating,
    error,
    reset
  }
}