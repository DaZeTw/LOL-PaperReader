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
  
  // Optional: for heartbeat messages
  type?: string
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

  const connectionsRef = useRef<Record<string, WebSocket>>({})
  const subscribersRef = useRef<Record<string, number>>({})
  const reconnectTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const reconnectAttemptsRef = useRef<Record<string, number>>({})
  const apiParamsRef = useRef<Record<string, ApiParams>>({})

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

  // Helper function to create WebSocket connection
  const connectWebSocket = useCallback((trackingKey: string, documentId: string) => {
    // Get backend URL (use NEXT_PUBLIC_BACKEND_URL or fallback)
    const backendUrl = typeof window !== 'undefined' 
      ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000')
      : 'http://127.0.0.1:8000'
    // Convert http/https to ws/wss for WebSocket
    // URL structure: ws://backend:8000/ws/status?document_id=xxx
    const wsUrl = backendUrl
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:')
      + `/ws/status?document_id=${encodeURIComponent(documentId)}`
    
    console.log(`[Pipeline] 🔌 Connecting to WebSocket: ${wsUrl}`)
    
    // Connect to WebSocket
    const ws = new WebSocket(wsUrl)
    connectionsRef.current[trackingKey] = ws

    ws.onopen = () => {
      console.log(`[Pipeline] ✅ WebSocket connected for ${trackingKey}`)
      // Reset reconnect attempts on successful connection
      reconnectAttemptsRef.current[trackingKey] = 0
    }

    ws.onmessage = (event) => {
      try {
        const rawData = JSON.parse(event.data)
        
        // Handle chat status messages
        if (rawData.type === 'chat') {
          // Emit custom event for chat status
          const chatEvent = new CustomEvent('chat-status', {
            detail: {
              session_id: rawData.session_id,
              status: rawData.status,
              document_id: rawData.document_id,
            }
          })
          window.dispatchEvent(chatEvent)
          console.log(
            `[Pipeline] 💬 Chat status received for ${trackingKey}: ` +
            `session=${rawData.session_id}, status=${rawData.status}`
          )
          return
        }
        
        // Skip heartbeat messages
        if (rawData.type === 'heartbeat') {
          return
        }
        
        const data = rawData as PipelineStatus
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

        // Close connection if ALL tasks done or critical error
        if (data.all_ready || data.stage === 'error' || data.stage === 'timeout') {
          const reason = data.all_ready
            ? `all tasks complete (${data.available_features?.join(', ')})`
            : data.stage
          console.log(`[Pipeline] 🔌 Closing WebSocket for ${trackingKey}: ${reason}`)
          ws.close(1000, reason)
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
            `[Pipeline] 🔌 Closing WebSocket for ${trackingKey}: all tasks in terminal state`
          )
          ws.close(1000, 'All tasks in terminal state')
          delete connectionsRef.current[trackingKey]
        }
      } catch (err) {
        console.error('[Pipeline] ❌ Error parsing WebSocket message:', err)
      }
    }

    ws.onerror = (err) => {
      // WebSocket error events don't provide much detail
      // The actual error will be available in onclose event
      // Only log if there's meaningful information
      const errorInfo = err instanceof Error ? err.message : 
                       (err && typeof err === 'object' && Object.keys(err).length > 0) ? err : null
      if (errorInfo) {
        console.warn(`[Pipeline] ⚠️ WebSocket error for ${trackingKey}:`, errorInfo)
      } else {
        // Silent - error details will be in onclose event
        console.debug(`[Pipeline] WebSocket error event for ${trackingKey} (details in onclose)`)
      }
    }

    ws.onclose = (event) => {
      console.log(
        `[Pipeline] 🔌 WebSocket closed for ${trackingKey} ` +
        `(code: ${event.code}, reason: ${event.reason || 'none'})`
      )
      delete connectionsRef.current[trackingKey]
      
      // Auto-reconnect logic
      // Only reconnect if:
      // 1. There are still subscribers
      // 2. Not a normal closure (code 1000)
      // 3. Not already all_ready
      // 4. Not manually closed (check by reason)
      const hasSubscribers = (subscribersRef.current[trackingKey] || 0) > 0
      const isNormalClose = event.code === 1000
      const isManualClose = event.reason === 'No subscribers' || event.reason === 'Component unmounting'
      const isAllReady = statusMapRef.current[trackingKey]?.all_ready
      
      if (hasSubscribers && !isNormalClose && !isManualClose && !isAllReady) {
        const attempts = (reconnectAttemptsRef.current[trackingKey] || 0) + 1
        reconnectAttemptsRef.current[trackingKey] = attempts
        
        // Get documentId from stored apiParams
        const storedParams = apiParamsRef.current[trackingKey]
        const reconnectDocumentId = storedParams?.document_id || documentId
        
        if (!reconnectDocumentId) {
          console.error(`[Pipeline] ❌ Cannot reconnect: missing document_id for ${trackingKey}`)
          return
        }
        
        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 30000)
        
        console.log(
          `[Pipeline] 🔄 Scheduling reconnect for ${trackingKey} ` +
          `(attempt ${attempts}, delay ${delay}ms)`
        )
        
        reconnectTimeoutsRef.current[trackingKey] = setTimeout(() => {
          if (subscribersRef.current[trackingKey] > 0 && !statusMapRef.current[trackingKey]?.all_ready) {
            console.log(`[Pipeline] 🔄 Reconnecting WebSocket for ${trackingKey}...`)
            connectWebSocket(trackingKey, reconnectDocumentId)
          }
        }, delay)
      }
    }
  }, [updateStatus])

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

    console.log(`[Pipeline] 📡 Opening WebSocket connection for ${trackingKey}`, apiParams)
    
    // Store apiParams for reconnection
    apiParamsRef.current[trackingKey] = apiParams
    
    // Get document_id from apiParams
    const documentId = apiParams.document_id
    if (!documentId) {
      console.error(`[Pipeline] ❌ Missing document_id for ${trackingKey}`)
      return
    }
    
    // Clear any existing reconnect timeout
    if (reconnectTimeoutsRef.current[trackingKey]) {
      clearTimeout(reconnectTimeoutsRef.current[trackingKey])
      delete reconnectTimeoutsRef.current[trackingKey]
    }
    
    // Reset reconnect attempts on manual connect
    reconnectAttemptsRef.current[trackingKey] = 0
    
    // Connect WebSocket
    connectWebSocket(trackingKey, documentId)
  }, [connectWebSocket])

  const unsubscribeFromStatus = useCallback((trackingKey: string) => {
    if (!trackingKey) return

    // Decrement subscriber count
    const count = (subscribersRef.current[trackingKey] || 0) - 1
    subscribersRef.current[trackingKey] = Math.max(count, 0)

    // Only close connection if NO ONE is listening anymore
    if (subscribersRef.current[trackingKey] === 0) {
      const ws = connectionsRef.current[trackingKey]
      if (ws) {
        console.log(`[Pipeline] 🔌 No subscribers left for ${trackingKey}, closing WebSocket.`)
        // Close with code 1000 (normal closure) to prevent auto-reconnect
        ws.close(1000, 'No subscribers')
        delete connectionsRef.current[trackingKey]
      }
      // Clear reconnect timeout
      if (reconnectTimeoutsRef.current[trackingKey]) {
        clearTimeout(reconnectTimeoutsRef.current[trackingKey])
        delete reconnectTimeoutsRef.current[trackingKey]
      }
      // Clean up refs
      delete reconnectAttemptsRef.current[trackingKey]
      delete apiParamsRef.current[trackingKey]
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
      // Close all WebSocket connections
      Object.values(connectionsRef.current).forEach(ws => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'Component unmounting')
        }
      })
      // Clear all reconnect timeouts
      Object.values(reconnectTimeoutsRef.current).forEach(timeout => {
        clearTimeout(timeout)
      })
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
