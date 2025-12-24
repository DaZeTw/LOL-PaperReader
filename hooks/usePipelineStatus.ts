import { useEffect, useMemo } from 'react'
import { usePipelineStatusContext, PipelineStatus } from '@/contexts/PipelineStatusContext'

interface UsePipelineStatusProps {
  documentId?: string | null
  // Kept for backward compatibility but documentId is prioritized
  pdfFile?: File | null
  tabId?: string
  enabled?: boolean
}

/**
 * Enhanced hook for tracking document processing pipeline status.
 * 
 * Tracks FOUR independent tasks that can complete in any order:
 * 1. Embedding (parse + chunk + embed + index) → Chat/QA ready
 * 2. Summary generation → Summary page ready
 * 3. Reference extraction → References page ready
 * 4. Skimming highlights → Skimming/Highlights ready
 * 
 * Each feature becomes available as soon as its task completes!
 */
export function usePipelineStatus({ documentId }: UsePipelineStatusProps = {}) {
  const { subscribeToStatus, unsubscribeFromStatus, getStatus } = usePipelineStatusContext()

  // 1. Memoize the connection parameters
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

    subscribeToStatus(trackingKey, apiParams)

    return () => {
      unsubscribeFromStatus(trackingKey)
    }
  }, [trackingKey, apiParams, subscribeToStatus, unsubscribeFromStatus])

  // 3. Retrieve Status from Context
  const status = trackingKey ? getStatus(trackingKey) : null

  // 4. Compute useful derived states
  const derivedStatus = useMemo(() => {
    if (!status) {
      return {
        // Backward compatible (main processing)
        isPipelineReady: false,
        isProcessing: false,
        
        // Independent task readiness
        isChatReady: false,
        isSummaryReady: false,
        isReferencesReady: false,
        isSkimmingReady: false,
        
        // Overall completion
        isAllReady: false,
        
        // Available features
        availableFeatures: [] as string[],
        
        // Task statuses
        embeddingStatus: 'pending' as string,
        summaryStatus: 'pending' as string,
        referenceStatus: 'pending' as string,
        skimmingStatus: 'pending' as string,
        
        // Progress
        overallProgress: 0,
        completedTasks: 0,
        totalTasks: 4,
        
        // Error tracking
        hasErrors: false,
        errors: [] as string[],
        
        // Metadata
        chunkCount: 0,
        referenceCount: 0,
        
        // Timestamps
        embeddingUpdatedAt: undefined as string | undefined,
        summaryUpdatedAt: undefined as string | undefined,
        referenceUpdatedAt: undefined as string | undefined,
        skimmingUpdatedAt: undefined as string | undefined,
        
        // Stage & message
        stage: 'idle' as string,
        message: '' as string,
        
        // Raw status
        raw: null as PipelineStatus | null,
      }
    }

    // Collect errors
    const errors: string[] = []
    if (status.embedding_error) errors.push(`Embedding: ${status.embedding_error}`)
    if (status.summary_error) errors.push(`Summary: ${status.summary_error}`)
    if (status.reference_error) errors.push(`References: ${status.reference_error}`)
    if (status.skimming_error) errors.push(`Skimming: ${status.skimming_error}`)

    return {
      // Backward compatible (main processing)
      isPipelineReady: status.ready || false,  // Chat ready
      isProcessing: status.building || false,
      
      // Independent task readiness (key feature!)
      isChatReady: status.embedding_ready || false,
      isSummaryReady: status.summary_ready || false,
      isReferencesReady: status.reference_ready || false,
      isSkimmingReady: status.skimming_ready || false,
      
      // Overall completion
      isAllReady: status.all_ready || false,
      
      // Available features
      availableFeatures: status.available_features || [],
      
      // Task statuses
      embeddingStatus: status.embedding_status || 'pending',
      summaryStatus: status.summary_status || 'pending',
      referenceStatus: status.reference_status || 'pending',
      skimmingStatus: status.skimming_status || 'pending',
      
      // Progress
      overallProgress: status.percent || 0,
      completedTasks: status.progress?.completed || 0,
      totalTasks: status.progress?.total || 4,
      
      // Error tracking
      hasErrors: status.has_errors || false,
      errors,
      
      // Metadata
      chunkCount: status.chunk_count || 0,
      referenceCount: status.reference_count || 0,
      
      // Timestamps
      embeddingUpdatedAt: status.embedding_updated_at,
      summaryUpdatedAt: status.summary_updated_at,
      referenceUpdatedAt: status.reference_updated_at,
      skimmingUpdatedAt: status.skimming_updated_at,
      
      // Stage & message
      stage: status.stage || 'idle',
      message: status.message || '',
      
      // Raw status for advanced use
      raw: status,
    }
  }, [status])

  // 5. Helper functions
  const helpers = useMemo(() => ({
    /**
     * Check if a specific feature is available
     */
    isFeatureAvailable: (feature: 'chat' | 'summary' | 'references' | 'skimming'): boolean => {
      return derivedStatus.availableFeatures.includes(feature)
    },
    
    /**
     * Get human-readable status message for a specific task
     */
    getTaskMessage: (task: 'embedding' | 'summary' | 'reference' | 'skimming'): string => {
      const statusMap = {
        embedding: derivedStatus.embeddingStatus,
        summary: derivedStatus.summaryStatus,
        reference: derivedStatus.referenceStatus,
        skimming: derivedStatus.skimmingStatus,
      }
      
      const errorMap = {
        embedding: status?.embedding_error,
        summary: status?.summary_error,
        reference: status?.reference_error,
        skimming: status?.skimming_error,
      }
      
      const taskStatus = statusMap[task]
      const taskError = errorMap[task]
      
      if (taskStatus === 'ready') return '✅ Ready'
      if (taskStatus === 'error') return `❌ Error: ${taskError || 'Unknown error'}`
      if (taskStatus === 'processing') return '🔄 Processing...'
      return '⏳ Pending'
    },
    
    /**
     * Check if any task is still processing
     */
    isAnyTaskProcessing: (): boolean => {
      return (
        derivedStatus.embeddingStatus === 'processing' ||
        derivedStatus.summaryStatus === 'processing' ||
        derivedStatus.referenceStatus === 'processing' ||
        derivedStatus.skimmingStatus === 'processing'
      )
    },
    
    /**
     * Get list of tasks still processing
     */
    getProcessingTasks: (): string[] => {
      const tasks: string[] = []
      if (derivedStatus.embeddingStatus === 'processing') tasks.push('embedding')
      if (derivedStatus.summaryStatus === 'processing') tasks.push('summary')
      if (derivedStatus.referenceStatus === 'processing') tasks.push('reference')
      if (derivedStatus.skimmingStatus === 'processing') tasks.push('skimming')
      return tasks
    },
    
    /**
     * Get list of completed tasks
     */
    getCompletedTasks: (): string[] => {
      const tasks: string[] = []
      if (derivedStatus.isChatReady) tasks.push('chat')
      if (derivedStatus.isSummaryReady) tasks.push('summary')
      if (derivedStatus.isReferencesReady) tasks.push('references')
      if (derivedStatus.isSkimmingReady) tasks.push('skimming')
      return tasks
    },
    
    /**
     * Get progress percentage for a specific task
     */
    getTaskProgress: (task: 'embedding' | 'summary' | 'reference' | 'skimming'): number => {
      const statusMap = {
        embedding: derivedStatus.embeddingStatus,
        summary: derivedStatus.summaryStatus,
        reference: derivedStatus.referenceStatus,
        skimming: derivedStatus.skimmingStatus,
      }
      
      const taskStatus = statusMap[task]
      if (taskStatus === 'ready') return 100
      if (taskStatus === 'error') return 0
      if (taskStatus === 'processing') return 50
      return 0
    },
  }), [derivedStatus, status])

  return {
    // Backward compatible - just spread derivedStatus
    ...derivedStatus,
    
    // Legacy alias for backward compatibility
    pipelineStatus: status || {},
    
    // Helper functions
    ...helpers,
  }
}

/**
 * Lightweight hook that only returns chat readiness (backward compatible)
 */
export function useChatReady(documentId?: string | null) {
  const { isChatReady, isProcessing } = usePipelineStatus({ documentId })
  return { isChatReady, isProcessing }
}

/**
 * Hook for summary page to check if summary is ready
 */
export function useSummaryReady(documentId?: string | null) {
  const { isSummaryReady, summaryStatus, getTaskMessage } = usePipelineStatus({ documentId })
  return { 
    isSummaryReady, 
    summaryStatus,
    summaryMessage: getTaskMessage('summary'),
  }
}

/**
 * Hook for references page to check if references are ready
 */
export function useReferencesReady(documentId?: string | null) {
  const { isReferencesReady, referenceStatus, referenceCount, getTaskMessage } = usePipelineStatus({ documentId })
  return { 
    isReferencesReady, 
    referenceStatus,
    referenceCount,
    referenceMessage: getTaskMessage('reference'),
  }
}

/**
 * Hook for skimming/highlights to check if skimming is ready
 */
export function useSkimmingReady(documentId?: string | null) {
  const { isSkimmingReady, skimmingStatus, getTaskMessage } = usePipelineStatus({ documentId })
  return { 
    isSkimmingReady, 
    skimmingStatus,
    skimmingMessage: getTaskMessage('skimming'),
  }
}