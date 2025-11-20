"use client"

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Reference } from './useReferences'

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
  const { data: session } = useSession()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createReference = async (file: File, metadata?: CreateReferenceData): Promise<Reference> => {
    if (!session?.user) {
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

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
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