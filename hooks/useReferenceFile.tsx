"use client"

import { useState } from 'react'
import { useSession } from 'next-auth/react'

interface UseReferenceFileReturn {
  getFileUrl: (documentId: string) => string
  downloadFile: (documentId: string, fileName?: string) => Promise<void>
  isDownloading: boolean
  error: Error | null
}

export function useReferenceFile(): UseReferenceFileReturn {
  const { data: session } = useSession()
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const getFileUrl = (documentId: string): string => {
    // Add validation to prevent undefined IDs
    if (!documentId) {
      console.warn('[useReferenceFile] Document ID is undefined')
      return ''
    }
    console.log('[useReferenceFile] Generating file URL for document ID:', documentId)
    return `/api/documents/${documentId}/file`
  }

  const downloadFile = async (documentId: string, fileName?: string): Promise<void> => {
    if (!session?.user) {
      throw new Error('Authentication required')
    }

    if (!documentId) {
      throw new Error('Document ID is required')
    }

    setIsDownloading(true)
    setError(null)

    try {
      const response = await fetch(getFileUrl(documentId))
      
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
    downloadFile,
    isDownloading,
    error
  }
}