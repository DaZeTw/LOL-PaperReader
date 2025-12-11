"use client"

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'

export interface PipelineStatus {
  building: boolean
  ready: boolean
  percent: number
  stage: string
  message: string
  chunk_count?: number
  document_id?: string
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
    if (connectionsRef.current[trackingKey]) return

    // If already ready locally, don't open new stream
    if (statusMapRef.current[trackingKey]?.ready) {
      console.log(`[Pipeline] ${trackingKey} is already ready. Skipping stream.`)
      return
    }

    console.log(`[Pipeline] Opening stream for ${trackingKey}`, apiParams)
    
    // Construct Query Params
    const params = new URLSearchParams()
    Object.entries(apiParams).forEach(([key, value]) => {
      if (value) params.append(key, value)
    })
    
    // Connect to the stream
    // Ensure this path matches your Next.js API route proxy
    const es = new EventSource(`/api/qa/status/stream?${params.toString()}`)
    connectionsRef.current[trackingKey] = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as PipelineStatus
        updateStatus(trackingKey, data)

        // Close stream if ready or error
        if (data.ready || data.stage === 'error') {
          console.log(`[Pipeline] Job finished for ${trackingKey}, closing stream.`)
          es.close()
          delete connectionsRef.current[trackingKey]
        }
      } catch (err) {
        console.error('[Pipeline] Error parsing SSE:', err)
      }
    }

    es.onerror = (err) => {
      // Don't log normal closures as errors
      if (es.readyState !== EventSource.CLOSED) {
        console.error('[Pipeline] Stream error:', err)
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
        console.log(`[Pipeline] No subscribers left for ${trackingKey}, closing stream.`)
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