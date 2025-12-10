"use client"

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'

export interface PipelineStatus {
  building: boolean
  ready: boolean
  percent: number
  stage: string
  message: string
  chunk_count?: number
  document_key?: string
  error?: string
  lastUpdated?: number
}

interface PipelineStatusContextType {
  statusMap: Record<string, PipelineStatus>
  subscribeToStatus: (documentKey: string, pdfName?: string) => void
  unsubscribeFromStatus: (documentKey: string) => void
  getStatus: (documentKey: string) => PipelineStatus | null
}

const PipelineStatusContext = createContext<PipelineStatusContextType | undefined>(undefined)

export function PipelineStatusProvider({ children }: { children: React.ReactNode }) {
  const [statusMap, setStatusMap] = useState<Record<string, PipelineStatus>>({})
  
  // 1. Ref to track status without triggering re-renders of functions
  const statusMapRef = useRef<Record<string, PipelineStatus>>({})

  const connectionsRef = useRef<Record<string, EventSource>>({})
  const subscribersRef = useRef<Record<string, number>>({})

  // 2. Helper to update both State (for UI) and Ref (for logic)
  const updateStatus = useCallback((key: string, data: Partial<PipelineStatus>) => {
    setStatusMap(prev => {
      const updated = { 
        ...prev[key], 
        ...data, 
        lastUpdated: Date.now() 
      } as PipelineStatus
      
      // Update the Ref immediately so logic can see it
      statusMapRef.current = { ...statusMapRef.current, [key]: updated }
      
      return { ...prev, [key]: updated }
    })
  }, [])

  // 3. STABLE subscribe function (No dependencies on changing state)
  const subscribeToStatus = useCallback((documentKey: string, pdfName?: string) => {
    if (!documentKey) return

    // Increment subscriber count
    subscribersRef.current[documentKey] = (subscribersRef.current[documentKey] || 0) + 1

    // If connection exists, do nothing
    if (connectionsRef.current[documentKey]) return

    // CHECK REF (Stable) instead of State (Unstable)
    // This prevents the function from being recreated when status changes
    if (statusMapRef.current[documentKey]?.ready) {
      console.log(`[Pipeline] ${documentKey} is already ready. Skipping stream.`)
      return
    }

    console.log(`[Pipeline] Opening stream for ${documentKey}`)
    
    // NOTE: Ensure this path matches your Next.js API route exactly
    const params = new URLSearchParams({ document_key: documentKey })
    if (pdfName) params.append('pdf_name', pdfName)
    
    const es = new EventSource(`/api/qa/status/stream?${params.toString()}`)
    connectionsRef.current[documentKey] = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as PipelineStatus
        updateStatus(documentKey, data)

        if (data.ready || data.stage === 'error') {
          console.log(`[Pipeline] Job finished for ${documentKey}, closing stream.`)
          es.close()
          delete connectionsRef.current[documentKey]
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
      delete connectionsRef.current[documentKey]
    }
  }, [updateStatus]) // Dependency array is now STABLE

  const unsubscribeFromStatus = useCallback((documentKey: string) => {
    if (!documentKey) return

    const count = (subscribersRef.current[documentKey] || 0) - 1
    subscribersRef.current[documentKey] = Math.max(count, 0)

    if (subscribersRef.current[documentKey] === 0) {
      const es = connectionsRef.current[documentKey]
      if (es) {
        console.log(`[Pipeline] No subscribers left for ${documentKey}, closing stream.`)
        es.close()
        delete connectionsRef.current[documentKey]
      }
    }
  }, [])

  const getStatus = useCallback((key: string) => statusMap[key] || null, [statusMap])

  // Initial sync of ref (for hydration)
  useEffect(() => {
    statusMapRef.current = statusMap
  }, [statusMap])

  // Cleanup on global unmount
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