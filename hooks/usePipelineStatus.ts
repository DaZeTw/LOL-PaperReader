import { useEffect, useMemo } from 'react'
import { usePipelineStatusContext } from '@/contexts/PipelineStatusContext'

interface UsePipelineStatusProps {
  documentId?: string | null
  // Kept for backward compatibility but documentId is prioritized
  pdfFile?: File | null
  tabId?: string
}

export function usePipelineStatus({ documentId }: UsePipelineStatusProps = {}) {
  const { subscribeToStatus, unsubscribeFromStatus, getStatus } = usePipelineStatusContext()

  // 1. Memoize the connection parameters
  // We strictly use documentId as the key and the API parameter
  const { trackingKey, apiParams } = useMemo(() => {
    if (!documentId) return { trackingKey: null, apiParams: null }

    return { 
      trackingKey: documentId, 
      apiParams: { document_id: documentId } 
    }
  }, [documentId])

  // 2. Manage the Subscription
  useEffect(() => {
    if (!trackingKey || !apiParams) return

    // This sends "document_id=..." to the backend stream endpoint
    subscribeToStatus(trackingKey, apiParams)

    // Cleanup: Unsubscribe when component unmounts or ID changes
    return () => {
      unsubscribeFromStatus(trackingKey)
    }
  }, [trackingKey, apiParams, subscribeToStatus, unsubscribeFromStatus])

  // 3. Retrieve Status from Context
  const currentGlobalStatus = trackingKey ? getStatus(trackingKey) : null

  return {
    isPipelineReady: !!currentGlobalStatus?.ready,
    pipelineStatus: currentGlobalStatus || {},
  }
}