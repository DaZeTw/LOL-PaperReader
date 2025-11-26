"use client"

import { useState } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

interface UseReferenceFileReturn {
  getFileUrl: (documentId: string) => string
  fetchFileBlob: (documentId: string) => Promise<{ blob: Blob; mimeType: string | null }>
  downloadFile: (documentId: string, fileName?: string) => Promise<void>
  isDownloading: boolean
  error: Error | null
}

export function useReferenceFile(): UseReferenceFileReturn {
  const { user, login } = useAuth()
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const getFileUrl = (documentId: string): string => {
    if (!documentId) {
      console.warn('[useReferenceFile] Document ID is undefined')
      return ''
    }
    if (!user) {
      console.warn('[useReferenceFile] Cannot build file URL without user session')
      return ''
    }
    const userId = user.dbId ? String(user.dbId) : user.id
    const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/documents/${documentId}/file`
    return `${baseUrl}?userId=${encodeURIComponent(userId)}`
  }

  const fetchFileBlob = async (documentId: string): Promise<{ blob: Blob; mimeType: string | null }> => {
    if (!user) {
      login()
      throw new Error('Authentication required')
    }

    if (!documentId) {
      throw new Error('Document ID is required')
    }

    const url = getFileUrl(documentId)
    if (!url) {
      throw new Error('File URL is unavailable')
    }

    const userId = user.dbId ? String(user.dbId) : user.id

    try {
      console.log('[useReferenceFile] Fetching file:', { documentId, url, userId })
      
      const response = await fetch(url, {
        headers: {
          'X-User-Id': userId,
        },
        credentials: 'include',
        cache: 'no-store',
      })

      console.log('[useReferenceFile] Response status:', response.status, response.statusText)

      if (!response.ok) {
        let errorMessage = `Download failed: ${response.status} ${response.statusText}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.detail || errorData.message || errorMessage
        } catch {
          // Ignore JSON parse errors, use default message
        }
        console.error('[useReferenceFile] Fetch error:', errorMessage)
        throw new Error(errorMessage)
      }

      const blob = await response.blob()
      const mimeType = response.headers.get('content-type')
      console.log('[useReferenceFile] File fetched successfully:', { size: blob.size, mimeType })
      return { blob, mimeType }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error fetching file')
      console.error('[useReferenceFile] Fetch failed:', {
        documentId,
        url,
        error: error.message,
        stack: error.stack
      })
      setError(error)
      throw error
    }
  }

  const downloadFile = async (documentId: string, fileName?: string): Promise<void> => {
    if (!user) {
      login()
      throw new Error('Authentication required')
    }

    if (!documentId) {
      throw new Error('Document ID is required')
    }

    setIsDownloading(true)
    setError(null)

    try {
      const userId = user.dbId ? String(user.dbId) : user.id
      const response = await fetch(getFileUrl(documentId), {
        headers: {
          'X-User-Id': userId,
        },
        credentials: 'include',
      })
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = fileName || `document-${documentId}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      window.URL.revokeObjectURL(url)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setIsDownloading(false)
    }
  }

  return {
    getFileUrl,
    fetchFileBlob,
    downloadFile,
    isDownloading,
    error
  }
}