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
  pdfFile?: File | null
  tabId?: string
}

export function usePipelineStatus({ pdfFile, tabId }: UsePipelineStatusProps = {}) {
  const { getStatus, refreshStatus } = usePipelineStatusContext()
  const [isPipelineReady, setIsPipelineReady] = useState<boolean | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({})
  const currentDocumentKeyRef = useRef<string | null>(null)
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (!pdfFile?.name) {
      setIsPipelineReady(null)
      setPipelineStatus({})
      currentDocumentKeyRef.current = null
      hasInitializedRef.current = false
      return
    }

    // Extract document_key from PDF file name
    const documentKey = pdfFile.name.replace(/\.pdf$/i, '').trim()
    
    // If document key changed, reset state
    if (currentDocumentKeyRef.current !== documentKey) {
      setIsPipelineReady(null)
      setPipelineStatus({})
      currentDocumentKeyRef.current = documentKey
      hasInitializedRef.current = false
    }

    // Get status from cache first
    const cachedStatus = getStatus(documentKey)
    
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
      
      if (age > 5000 || cachedStatus.building || needsTrigger) {
        if (!hasInitializedRef.current) {
          hasInitializedRef.current = true
          // Refresh status - backend will auto-trigger missing steps
          refreshStatus(documentKey)
        }
      }
    } else {
      // No cache, fetch status (backend will auto-trigger missing steps)
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true
        refreshStatus(documentKey).then(() => {
          const updatedStatus = getStatus(documentKey)
          if (updatedStatus) {
            setIsPipelineReady(Boolean(updatedStatus.ready))
            setPipelineStatus(updatedStatus)
          }
        })
      }
    }

    // Subscribe to status updates by polling cache
    const interval = setInterval(() => {
      const status = getStatus(documentKey)
      if (status) {
        const isReady = Boolean(status.ready)
        setIsPipelineReady(isReady)
        setPipelineStatus(status)
        
        // Auto-refresh if building
        const isBuilding = Boolean(status.building)
        if (isBuilding && !isReady) {
          refreshStatus(documentKey)
        } else if (!isReady && !isBuilding) {
          // Not ready and not building - check if we need to trigger missing steps
          const hasChunks = (status.chunk_count || 0) > 0
          const embeddingStatus = (status as any).embedding_status || 'unknown'
          const documentStatus = (status as any).document_status || 'unknown'
          const age = status.lastChecked ? Date.now() - status.lastChecked : Infinity
          
          // Trigger if:
          // 1. Has chunks but embedding not ready/processing (and status is fresh, < 10s)
          // 2. No chunks but document exists (and status is fresh, < 10s)
          const needsTrigger = 
            (hasChunks && embeddingStatus !== 'ready' && embeddingStatus !== 'processing' && age < 10000) ||
            (!hasChunks && documentStatus !== 'parsing' && documentStatus !== 'processing' && documentStatus !== 'uploading' && age < 10000)
          
          if (needsTrigger) {
            // Refresh status - backend will auto-trigger missing steps
            refreshStatus(documentKey)
          }
        }
      }
    }, 2000) // Check cache every 2 seconds (less frequent to avoid too many API calls)

    return () => {
      clearInterval(interval)
    }
  }, [pdfFile?.name, tabId, getStatus, refreshStatus])

  return {
    isPipelineReady,
    pipelineStatus,
  }
}
