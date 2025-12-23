"use client"

import { useState } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Target {
  page: number
  x: number
  y: number
}

interface AnnotationMetadata {
  id: string
  ref_id: string
  title?: string
  authors?: string[]
  year?: number
  venue?: string
  doi?: string
  arxiv_id?: string
  bib_box?: {
    page: number
    left: number
    top: number
    width: number
    height: number
  }
}

export interface Annotation {
  dest: string
  source: BoundingBox
  target: Target | null
  metadata?: AnnotationMetadata
}
export interface PageAnnotations {
  page: number
  annotations: Annotation[]
}

interface UseAnnotationsReturn {
  annotations: PageAnnotations[]
  isLoading: boolean
  error: Error | null
  extractAnnotations: (file: File, documentId: string) => Promise<PageAnnotations[]>
}

export function useAnnotations(): UseAnnotationsReturn {
  const { user } = useAuth()
  const [annotations, setAnnotations] = useState<PageAnnotations[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const extractAnnotations = async (
    file: File,
    documentId: string
  ): Promise<PageAnnotations[]> => {
    if (!user) {
      throw new Error('User not authenticated')
    }

    setIsLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/references/extract-annotations`
      const userId = user.dbId ? String(user.dbId) : user.id

      const response = await fetch(`${baseUrl}?document_id=${documentId}`, {
        method: 'POST',
        headers: {
          'X-User-Id': userId,
        },
        body: formData,
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.detail || `Failed to extract annotations: ${response.statusText}`
        )
      }

      const data: PageAnnotations[] = await response.json()
      setAnnotations(data)
      return data
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  return {
    annotations,
    isLoading,
    error,
    extractAnnotations,
  }
}