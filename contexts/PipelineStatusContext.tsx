"use client"

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'

// Updated interface to match new backend response with skimming
export interface PipelineStatus {
  // Overall status
  building: boolean
  ready: boolean  // Main processing ready (chat available)
  all_ready: boolean  // ALL tasks ready (chat + summary + references + skimming)
  percent: number
  stage: string
  message: string

  // Main processing details
  chunk_count?: number
  document_id?: string
  document_status?: string

  // INDEPENDENT TASK READINESS
  embedding_status?: string
  embedding_ready?: boolean
  embedding_error?: string
  embedding_updated_at?: string

  summary_status?: string
  summary_ready?: boolean
  summary_error?: string
  summary_updated_at?: string

  reference_status?: string
  reference_ready?: boolean
  reference_count?: number
  reference_error?: string
  reference_updated_at?: string

  skimming_status?: string
  skimming_ready?: boolean
  skimming_error?: string
  skimming_updated_at?: string

  metadata_status?: string
  metadata_ready?: boolean
  metadata_error?: string
  metadata_updated_at?: string

  // Feature availability
  available_features?: string[]  // ["chat", "summary", "references", "skimming", "metadata"]

  // Progress details
  progress?: {
    completed: number
    total: number
    percentage: number
  }

  // Error tracking
  has_errors?: boolean
  error?: string
  lastUpdated?: number
}

// Define params to match your backend query arguments
interface ApiParams {
  document_id?: string
  [key: string]: string | undefined
}

interface PipelineStatusContextType {
  statusMap: Record<string, PipelineStatus>
  subscribeToStatus: (trackingKey: string, apiParams: ApiParams) => void
  unsubscribeFromStatus: (trackingKey: string) => void
  getStatus: (trackingKey: string) => PipelineStatus | null
}

const PipelineStatusContext = createContext<PipelineStatusContextType | undefined>(undefined)

export function PipelineStatusProvider({ children }: { children: React.ReactNode }) {
  const [statusMap, setStatusMap] = useState<Record<string, PipelineStatus>>({})

  // Ref to track status logic without triggering re-renders inside callbacks
  const statusMapRef = useRef<Record<string, PipelineStatus>>({})

  const connectionsRef = useRef<Record<string, EventSource>>({})
  const subscribersRef = useRef<Record<string, number>>({})

  // Helper to update state and ref simultaneously
  const updateStatus = useCallback((key: string, data: Partial<PipelineStatus>) => {
    setStatusMap(prev => {
      const updated = {
        ...prev[key],
        ...data,
        lastUpdated: Date.now()
      } as PipelineStatus

      statusMapRef.current = { ...statusMapRef.current, [key]: updated }

      return { ...prev, [key]: updated }
    })
  }, [])

  // STABLE subscribe function
  const subscribeToStatus = useCallback((trackingKey: string, apiParams: ApiParams) => {
    if (!trackingKey) return

    // Increment subscriber count (Reference Counting)
    subscribersRef.current[trackingKey] = (subscribersRef.current[trackingKey] || 0) + 1

    // If connection exists, do nothing
    if (connectionsRef.current[trackingKey]) {
      console.log(`[Pipeline] Stream already exists for ${trackingKey}`)
      return
    }

    // If already all tasks ready locally, don't open new stream
    if (statusMapRef.current[trackingKey]?.all_ready) {
      console.log(`[Pipeline] ${trackingKey} is already complete (all_ready). Skipping stream.`)
      return
    }

    console.log(`[Pipeline] 📡 Opening SSE stream for ${trackingKey}`, apiParams)

    // Construct Query Params
    const params = new URLSearchParams()
    Object.entries(apiParams).forEach(([key, value]) => {
      if (value) params.append(key, value)
    })

    // Connect to the stream
    const es = new EventSource(`/api/qa/status/stream?${params.toString()}`)
    connectionsRef.current[trackingKey] = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as PipelineStatus
        updateStatus(trackingKey, data)

        // Log feature availability changes
        if (data.available_features && data.available_features.length > 0) {
          console.log(
            `[Pipeline] ✅ ${trackingKey} available features:`,
            data.available_features.join(', ')
          )
        }

        // Log individual task completions
        if (data.embedding_ready && !statusMapRef.current[trackingKey]?.embedding_ready) {
          console.log(`[Pipeline] ✅ ${trackingKey} - Chat/QA ready`)
        }
        if (data.summary_ready && !statusMapRef.current[trackingKey]?.summary_ready) {
          console.log(`[Pipeline] ✅ ${trackingKey} - Summary ready`)
        }
        if (data.reference_ready && !statusMapRef.current[trackingKey]?.reference_ready) {
          console.log(`[Pipeline] ✅ ${trackingKey} - References ready`)
        }
        if (data.skimming_ready && !statusMapRef.current[trackingKey]?.skimming_ready) {
          console.log(`[Pipeline] ✅ ${trackingKey} - Skimming ready`)
        }
        if (data.metadata_ready && !statusMapRef.current[trackingKey]?.metadata_ready) {
          console.log(`[Pipeline] ✅ ${trackingKey} - Metadata ready`)
        }

        // Close stream if ALL tasks done or critical error
        if (data.all_ready || data.stage === 'error' || data.stage === 'timeout') {
          const reason = data.all_ready
            ? `all tasks complete (${data.available_features?.join(', ')})`
            : data.stage
          console.log(`[Pipeline] 🔌 Closing stream for ${trackingKey}: ${reason}`)
          es.close()
          delete connectionsRef.current[trackingKey]
        }

        // Also close if all tasks reached terminal state (ready or error)
        const embeddingDone = ['ready', 'error'].includes(data.embedding_status || '') || data.embedding_ready
        const summaryDone = ['ready', 'error'].includes(data.summary_status || '')
        const referenceDone = ['ready', 'error'].includes(data.reference_status || '')
        const skimmingDone = ['ready', 'error'].includes(data.skimming_status || '')
        const metadataDone = ['ready', 'error'].includes(data.metadata_status || '')

        if (embeddingDone && summaryDone && referenceDone && skimmingDone && metadataDone && !data.all_ready) {
          console.log(
            `[Pipeline] 🔌 Closing stream for ${trackingKey}: all tasks in terminal state`
          )
          es.close()
          delete connectionsRef.current[trackingKey]
        }
      } catch (err) {
        console.error('[Pipeline] ❌ Error parsing SSE:', err)
      }
    }

    es.onerror = (err) => {
      // Don't log normal closures as errors
      if (es.readyState !== EventSource.CLOSED) {
        console.error('[Pipeline] ❌ Stream error:', err)
      }
      es.close()
      delete connectionsRef.current[trackingKey]
    }
  }, [updateStatus])

  const unsubscribeFromStatus = useCallback((trackingKey: string) => {
    if (!trackingKey) return

    // Decrement subscriber count
    const count = (subscribersRef.current[trackingKey] || 0) - 1
    subscribersRef.current[trackingKey] = Math.max(count, 0)

    // Only close connection if NO ONE is listening anymore
    if (subscribersRef.current[trackingKey] === 0) {
      const es = connectionsRef.current[trackingKey]
      if (es) {
        console.log(`[Pipeline] 🔌 No subscribers left for ${trackingKey}, closing stream.`)
        es.close()
        delete connectionsRef.current[trackingKey]
      }
    }
  }, [])

  const getStatus = useCallback((key: string) => statusMap[key] || null, [statusMap])

  // Sync ref on hydration
  useEffect(() => {
    statusMapRef.current = statusMap
  }, [statusMap])

  // Cleanup all connections on global unmount
  useEffect(() => {
    return () => {
      Object.values(connectionsRef.current).forEach(es => es.close())
    }
  }, [])

  return (
    <PipelineStatusContext.Provider value={{ statusMap, subscribeToStatus, unsubscribeFromStatus, getStatus }}>
      {children}
    </PipelineStatusContext.Provider>
  )
}

export function usePipelineStatusContext() {
  const context = useContext(PipelineStatusContext)
  if (!context) throw new Error('usePipelineStatusContext must be used within PipelineStatusProvider')
  return context
}