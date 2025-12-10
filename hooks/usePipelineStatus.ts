import { useEffect } from 'react'
import { usePipelineStatusContext, PipelineStatus } from '@/contexts/PipelineStatusContext'

interface UsePipelineStatusProps {
  pdfFile?: File | null
  tabId?: string
}

export function usePipelineStatus({ pdfFile }: UsePipelineStatusProps = {}) {
  const { subscribeToStatus, unsubscribeFromStatus, getStatus } = usePipelineStatusContext()

  // 1. Derive the stable document key from the file name.
  // We do this OUTSIDE the effect so we can use the primitive string as a dependency.
  // React compares strings by value, but objects (like 'pdfFile') by reference.
  const documentKey = pdfFile?.name 
    ? pdfFile.name.replace(/\.pdf$/i, '').trim() 
    : null

  // 2. Manage the Subscription
  useEffect(() => {
    // If there is no valid key (e.g. no file selected), do nothing.
    if (!documentKey) return

    // Subscribe to the stream.
    // The Context handles deduplication, so calling this multiple times is safe,
    // but the dependency array below ensures we only call it when the file *actually* changes.
    subscribeToStatus(documentKey, pdfFile?.name)

    // Cleanup: Unsubscribe when the component unmounts or the user switches files.
    return () => {
      unsubscribeFromStatus(documentKey)
    }
  }, [documentKey, subscribeToStatus, unsubscribeFromStatus]) // Dependency is the STABLE string 'documentKey'

  // 3. Get the latest status from the global store
  const currentGlobalStatus = documentKey ? getStatus(documentKey) : null

  return {
    isPipelineReady: !!currentGlobalStatus?.ready,
    // If status is null, return an empty object to prevent "cannot read property of undefined" errors
    pipelineStatus: currentGlobalStatus || {},
  }
}