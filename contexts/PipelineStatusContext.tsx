"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

interface PipelineStatus {
  building?: boolean
  ready?: boolean
  chunks?: number
  percent?: number
  stage?: string
  message?: string
  document_key?: string
  document_id?: string
  embedding_status?: string
  document_status?: string
  lastChecked?: number
}

interface PipelineStatusMap {
  [documentKey: string]: PipelineStatus
}

interface PipelineStatusContextType {
  statusMap: PipelineStatusMap
  getStatus: (documentKey: string) => PipelineStatus | null
  updateStatus: (documentKey: string, status: PipelineStatus) => void
  refreshStatus: (documentKey: string) => Promise<void>
  refreshAllStatuses: () => Promise<void>
  isProcessing: (documentKey: string) => boolean
}

const PipelineStatusContext = createContext<PipelineStatusContextType | undefined>(undefined)

export function PipelineStatusProvider({ children }: { children: React.ReactNode }) {
  const [statusMap, setStatusMap] = useState<PipelineStatusMap>({})
  const refreshTimersRef = useRef<{ [key: string]: any }>({})
  const processingRef = useRef<Set<string>>(new Set())

  // Get status from cache
  const getStatus = useCallback((documentKey: string): PipelineStatus | null => {
    if (!documentKey) return null
    return statusMap[documentKey] || null
  }, [statusMap])

  // Update status in cache
  const updateStatus = useCallback((documentKey: string, status: PipelineStatus) => {
    if (!documentKey) return
    setStatusMap(prev => ({
      ...prev,
      [documentKey]: {
        ...status,
        lastChecked: Date.now(),
      },
    }))
  }, [])

  // Refresh status for a specific document
  const refreshStatus = useCallback(async (documentKey: string) => {
    if (!documentKey) return

    // Prevent duplicate refresh calls
    if (processingRef.current.has(documentKey)) {
      console.log(`[PipelineStatusContext] Already refreshing ${documentKey}, skipping`)
      return
    }

    processingRef.current.add(documentKey)

    try {
      const params = new URLSearchParams()
      params.append('document_key', documentKey)
      
      const res = await fetch(`/api/qa/status?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      
      updateStatus(documentKey, data)
      
      // If still building, schedule next refresh
      if (data.building && !data.ready) {
        // Clear existing timer for this document
        if (refreshTimersRef.current[documentKey]) {
          clearTimeout(refreshTimersRef.current[documentKey])
        }
        
        // Schedule next refresh in 2 seconds
        refreshTimersRef.current[documentKey] = setTimeout(() => {
          processingRef.current.delete(documentKey)
          refreshStatus(documentKey)
        }, 2000)
      } else {
        // Clear timer if done
        if (refreshTimersRef.current[documentKey]) {
          clearTimeout(refreshTimersRef.current[documentKey])
          delete refreshTimersRef.current[documentKey]
        }
      }
    } catch (error) {
      console.error(`[PipelineStatusContext] Error refreshing status for ${documentKey}:`, error)
      // Retry after 2 seconds on error
      if (refreshTimersRef.current[documentKey]) {
        clearTimeout(refreshTimersRef.current[documentKey])
      }
      refreshTimersRef.current[documentKey] = setTimeout(() => {
        processingRef.current.delete(documentKey)
        refreshStatus(documentKey)
      }, 2000)
    } finally {
      // Remove from processing set after a delay to allow for scheduled refresh
      setTimeout(() => {
        processingRef.current.delete(documentKey)
      }, 100)
    }
  }, [updateStatus])

  // Check if a document is currently processing
  const isProcessing = useCallback((documentKey: string): boolean => {
    const status = getStatus(documentKey)
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



