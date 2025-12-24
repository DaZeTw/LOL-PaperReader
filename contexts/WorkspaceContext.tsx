"use client"

import { createContext, useContext, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { BACKEND_API_URL } from '@/lib/config'

interface WorkspaceContextType {
  openReferencePDF: (pdfUrl: string, title: string) => Promise<void>
  importToLibrary: (tabId: string, file: File, title: string) => Promise<string | null>
  updateTabMode: (tabId: string, mode: 'library' | 'preview') => void
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

interface WorkspaceProviderProps {
  children: React.ReactNode
  onOpenReferencePDF: (pdfUrl: string, title: string) => Promise<void>
  onUpdateTabMode?: (tabId: string, mode: 'library' | 'preview', documentId?: string) => void
}

export function WorkspaceProvider({ 
  children, 
  onOpenReferencePDF,
  onUpdateTabMode 
}: WorkspaceProviderProps) {
  const { user } = useAuth()

  // Import a PDF to the library (upload to backend)
  const importToLibrary = useCallback(async (
    tabId: string, 
    file: File, 
    title: string
  ): Promise<string | null> => {
    if (!user) {
      console.error('[WorkspaceContext] User not authenticated')
      return null
    }

    try {
      console.log('[WorkspaceContext] Importing to library:', { tabId, title, fileName: file.name })

      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title)
      formData.append('source', 'reference') // Mark as imported from reference
      
      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/documents`
      const userId = user.dbId ? String(user.dbId) : user.id

      console.log('🔵 Uploading to:', baseUrl)

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'X-User-Id': userId,
          // Don't set Content-Type for FormData - browser sets it with boundary
        },
        body: formData,
        credentials: 'include',
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Upload failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        throw new Error(`Upload failed: ${response.status} ${errorText}`)
      }

      const data = await response.json()
      const documentId = data.document?._id || data.document?.id || data.id

      if (!documentId) {
        console.error('❌ No document ID in response:', data)
        throw new Error('No document ID returned from upload')
      }

      console.log('✅ Import successful:', { documentId, tabId })

      // Update tab mode to library
      if (onUpdateTabMode) {
        onUpdateTabMode(tabId, 'library', documentId)
      }

      return documentId
    } catch (error) {
      console.error('❌ [WorkspaceContext] Import failed:', error)
      throw error // Re-throw so PreviewSidebar can display the error
    }
  }, [user, onUpdateTabMode])

  const updateTabMode = useCallback((tabId: string, mode: 'library' | 'preview') => {
    console.log('[WorkspaceContext] Updating tab mode:', { tabId, mode })
    if (onUpdateTabMode) {
      onUpdateTabMode(tabId, mode)
    }
  }, [onUpdateTabMode])

  return (
    <WorkspaceContext.Provider 
      value={{ 
        openReferencePDF: onOpenReferencePDF,
        importToLibrary,
        updateTabMode
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return context
}