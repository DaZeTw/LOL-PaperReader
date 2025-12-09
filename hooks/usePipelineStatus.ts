import { useState, useEffect, useRef } from 'react'
import { usePipelineStatusContext } from '@/contexts/PipelineStatusContext'

interface PipelineStatus {
  building?: boolean
  ready?: boolean
  chunks?: number
  percent?: number
  stage?: string
  message?: string
}

interface UsePipelineStatusProps {
  documentId?: string | null
  pdfFile?: File | null
  tabId?: string
}

export function usePipelineStatus({ documentId, pdfFile, tabId }: UsePipelineStatusProps = {}) {
  const { getStatus, refreshStatus } = usePipelineStatusContext()
  const [isPipelineReady, setIsPipelineReady] = useState<boolean | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({})
  const currentIdentifierRef = useRef<string | null>(null)
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    const identifier = (documentId || pdfFile?.name?.replace(/\.pdf$/i, '').trim() || '').trim()

    if (!identifier) {
      setIsPipelineReady(null)
      setPipelineStatus({})
      currentIdentifierRef.current = null
      hasInitializedRef.current = false
      return
    }

    // If identifier changed, reset state
    if (currentIdentifierRef.current !== identifier) {
      setIsPipelineReady(null)
      setPipelineStatus({})
      currentIdentifierRef.current = identifier
      hasInitializedRef.current = true

      // When selecting a new PDF, immediately refresh to kick off any missing steps
      refreshStatus(identifier).then(() => {
        const updatedStatus = getStatus(identifier)
        if (updatedStatus) {
          setIsPipelineReady(Boolean(updatedStatus.ready))
          setPipelineStatus(updatedStatus)
        }
      })
    }

    // Get status from cache first
    const cachedStatus = getStatus(identifier)
    
    if (cachedStatus) {
      // Use cached status immediately
      const isReady = Boolean(cachedStatus.ready)
      setIsPipelineReady(isReady)
      setPipelineStatus(cachedStatus)
      
      // Check if we need to trigger missing steps
      const hasChunks = (cachedStatus.chunk_count || 0) > 0
      const embeddingStatus = (cachedStatus as any).embedding_status || 'unknown'
      const documentStatus = (cachedStatus as any).document_status || 'unknown'
      const isBuilding = Boolean(cachedStatus.building)
      
      // Determine if we need to refresh to trigger missing steps:
      // 1. Not ready and not building
      // 2. Has chunks but embedding not ready/processing
      // 3. No chunks but document exists (should trigger chunking)
      // 4. Status is old (> 5 seconds)
      const age = cachedStatus.lastChecked ? Date.now() - cachedStatus.lastChecked : Infinity
      const needsTrigger = 
        (!isReady && !isBuilding && hasChunks && embeddingStatus !== 'ready' && embeddingStatus !== 'processing') ||
        (!isReady && !isBuilding && !hasChunks && documentStatus !== 'parsing' && documentStatus !== 'processing' && documentStatus !== 'uploading')
      
      const mightBeStuck = embeddingStatus === 'processing' && age > 10000

      if (age > 5000 || cachedStatus.building || needsTrigger || mightBeStuck) {
        // Refresh status - backend will auto-trigger missing steps
        refreshStatus(identifier)
      }
    } else {
      // No cache, fetch status (backend will auto-trigger missing steps)
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true
        refreshStatus(identifier).then(() => {
          const updatedStatus = getStatus(identifier)
          if (updatedStatus) {
            setIsPipelineReady(Boolean(updatedStatus.ready))
            setPipelineStatus(updatedStatus)
          }
        })
      }
    }

    // Subscribe to status updates by polling cache
    const interval = setInterval(() => {
      const status = getStatus(identifier)
      if (status) {
        const isReady = Boolean(status.ready)
        setIsPipelineReady(isReady)
        setPipelineStatus(status)
        
        // Auto-refresh if building
        const isBuilding = Boolean(status.building)
        const hasChunks = (status.chunk_count || 0) > 0
        const embeddingStatus = (status as any).embedding_status || 'unknown'
        const documentStatus = (status as any).document_status || 'unknown'
        const age = status.lastChecked ? Date.now() - status.lastChecked : Infinity
        const mightBeStuck = embeddingStatus === 'processing' && age > 10000

        if (!isReady) {
          // Keep refreshing while building, or if status indicates we should trigger missing steps
          if (isBuilding) {
            refreshStatus(identifier)
          } else {
            const needsTrigger = 
              (hasChunks && embeddingStatus !== 'ready' && embeddingStatus !== 'processing' && age < 10000) ||
              (!hasChunks && documentStatus !== 'parsing' && documentStatus !== 'processing' && documentStatus !== 'uploading' && age < 10000)

            if (needsTrigger || mightBeStuck) {
              // Refresh status - backend will auto-trigger missing steps (chunking/embedding)
              refreshStatus(identifier)
            }
          }
        }
      }
    }, 2000) // Check cache every 2 seconds (less frequent to avoid too many API calls)

    return () => {
      clearInterval(interval)
    }
  }, [documentId, pdfFile?.name, tabId, getStatus, refreshStatus])

  return {
    isPipelineReady,
    pipelineStatus,
  }
}
