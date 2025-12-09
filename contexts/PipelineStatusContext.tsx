"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

interface PipelineStatus {
  building?: boolean
  ready?: boolean
  chunks?: number
  percent?: number
  stage?: string
  message?: string
  document_id?: string
  embedding_status?: string
  document_status?: string
  lastChecked?: number
}

interface PipelineStatusMap {
  [identifier: string]: PipelineStatus
}

interface PipelineStatusContextType {
  statusMap: PipelineStatusMap
  getStatus: (identifier: string) => PipelineStatus | null
  updateStatus: (identifier: string, status: PipelineStatus) => void
  refreshStatus: (identifier: string) => Promise<void>
  refreshAllStatuses: () => Promise<void>
  isProcessing: (documentKey: string) => boolean
}

const PipelineStatusContext = createContext<PipelineStatusContextType | undefined>(undefined)

export function PipelineStatusProvider({ children }: { children: React.ReactNode }) {
  const [statusMap, setStatusMap] = useState<PipelineStatusMap>({})
  const refreshTimersRef = useRef<{ [key: string]: any }>({})
  const processingRef = useRef<Set<string>>(new Set())

  // Get status from cache
  const getStatus = useCallback((identifier: string): PipelineStatus | null => {
    if (!identifier) return null
    return statusMap[identifier] || null
  }, [statusMap])

  // Update status in cache
  const updateStatus = useCallback((identifier: string, status: PipelineStatus) => {
    if (!identifier) return
    setStatusMap(prev => ({
      ...prev,
      [identifier]: {
        ...status,
        lastChecked: Date.now(),
      },
    }))
  }, [])

  // Refresh status for a specific document
  const refreshStatus = useCallback(async (identifier: string) => {
    if (!identifier) return

    // Prevent duplicate refresh calls
    if (processingRef.current.has(identifier)) {
      console.log(`[PipelineStatusContext] Already refreshing ${identifier}, skipping`)
      return
    }

    processingRef.current.add(identifier)

    try {
      const params = new URLSearchParams()
      params.append('document_id', identifier)
      
      const res = await fetch(`/api/qa/status?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      
      updateStatus(identifier, data)
      
      // Continue polling until pipeline ready (handles stalled states as well)
      if (!data.ready) {
        // Clear existing timer for this document
        if (refreshTimersRef.current[identifier]) {
          clearTimeout(refreshTimersRef.current[identifier])
        }
        
        // Schedule next refresh in 2 seconds
        refreshTimersRef.current[identifier] = setTimeout(() => {
          processingRef.current.delete(identifier)
          refreshStatus(identifier)
        }, 2000)
      } else {
        // Clear timer if done
        if (refreshTimersRef.current[identifier]) {
          clearTimeout(refreshTimersRef.current[identifier])
          delete refreshTimersRef.current[identifier]
        }
      }
    } catch (error) {
      console.error(`[PipelineStatusContext] Error refreshing status for ${identifier}:`, error)
      // Retry after 2 seconds on error
      if (refreshTimersRef.current[identifier]) {
        clearTimeout(refreshTimersRef.current[identifier])
      }
      refreshTimersRef.current[identifier] = setTimeout(() => {
        processingRef.current.delete(identifier)
        refreshStatus(identifier)
      }, 2000)
    } finally {
      // Remove from processing set after a delay to allow for scheduled refresh
      setTimeout(() => {
        processingRef.current.delete(identifier)
      }, 100)
    }
  }, [updateStatus])

  // Check if a document is currently processing
  const isProcessing = useCallback((identifier: string): boolean => {
    const status = getStatus(identifier)
    return status?.building === true || status?.ready === false
  }, [getStatus])

  // Refresh all statuses (called on initial load)
  const refreshAllStatuses = useCallback(async () => {
    // This would need to get list of all documents from somewhere
    // For now, we'll just refresh statuses that are already in cache
    const keys = Object.keys(statusMap)
    await Promise.all(keys.map(key => refreshStatus(key)))
  }, [statusMap, refreshStatus])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(refreshTimersRef.current).forEach(timer => {
        if (timer) clearTimeout(timer)
      })
    }
  }, [])

  return (
    <PipelineStatusContext.Provider
      value={{
        statusMap,
        getStatus,
        updateStatus,
        refreshStatus,
        refreshAllStatuses,
        isProcessing,
      }}
    >
      {children}
    </PipelineStatusContext.Provider>
  )
}

export function usePipelineStatusContext() {
  const context = useContext(PipelineStatusContext)
  if (context === undefined) {
    throw new Error('usePipelineStatusContext must be used within PipelineStatusProvider')
  }
  return context
}



