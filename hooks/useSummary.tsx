"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

export interface SummarySection {
  [key: string]: string  // Flexible structure for summary sections like "Motivation", "Problem Statement", etc.
}

export interface SummaryData {
  document_id: string
  summary_id: string
  summary_final: SummarySection
}

interface UseSummaryOptions {
  documentId: string
  tabId: string
  isSummaryReady?: boolean  // From pipeline status
  autoFetch?: boolean
  fields?: string  // Optional field filter: 'summary_final' or 'important_sections'
}

interface UseSummaryReturn {
  summary: SummaryData | null
  isLoading: boolean
  error: Error | null
  isInitialized: boolean
  refetch: () => Promise<void>
  clearSummary: () => void
}

export function useSummary({
  documentId,
  tabId,
  isSummaryReady = false,
  autoFetch = true,
  fields,
}: UseSummaryOptions): UseSummaryReturn {
  const { user } = useAuth()
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  
  const abortControllerRef = useRef<AbortController | null>(null)
  const fetchedRef = useRef(false)

  const fetchSummary = useCallback(async () => {
    if (!user || !documentId || !isSummaryReady) {
      console.log(`[useSummary:${tabId}] ⏸️ Not fetching - user: ${!!user}, documentId: ${documentId}, ready: ${isSummaryReady}`)
      return
    }

    // Prevent duplicate fetches
    if (fetchedRef.current && summary) {
      console.log(`[useSummary:${tabId}] ✅ Summary already fetched`)
      return
    }

    try {
      // Cancel previous request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()

      setIsLoading(true)
      setError(null)
      console.log(`[useSummary:${tabId}] 🔄 Fetching summary for document: ${documentId}`)

      // Build URL with optional fields parameter
      const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/summary/summary/${documentId}`
      const url = new URL(baseUrl)
      if (fields) {
        url.searchParams.append('fields', fields)
      }

      const userId = user.dbId ? String(user.dbId) : user.id

      const response = await fetch(url.toString(), {
        signal: abortControllerRef.current.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        cache: 'no-store',
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Summary not found. Please wait for processing to complete.')
        }
        throw new Error(`Failed to fetch summary: ${response.statusText}`)
      }

      const data: SummaryData = await response.json()
      console.log(`[useSummary:${tabId}] ✅ Summary fetched:`, {
        summaryId: data.summary_id,
        sections: data.summary_final ? Object.keys(data.summary_final).length : 0,
        documentId: data.document_id,
      })

      setSummary(data)
      fetchedRef.current = true
      setIsInitialized(true)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log(`[useSummary:${tabId}] ⏹️ Fetch aborted`)
        return
      }

      const errorObj = err instanceof Error ? err : new Error('Unknown error fetching summary')
      console.error(`[useSummary:${tabId}] ❌ Error fetching summary:`, errorObj.message)
      setError(errorObj)
      setSummary(null)
      setIsInitialized(true)
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [user, documentId, tabId, isSummaryReady, summary, fields])

  const refetch = useCallback(async () => {
    console.log(`[useSummary:${tabId}] 🔄 Refetching summary`)
    fetchedRef.current = false
    setSummary(null)
    await fetchSummary()
  }, [fetchSummary, tabId])

  const clearSummary = useCallback(() => {
    console.log(`[useSummary:${tabId}] 🗑️ Clearing summary`)
    setSummary(null)
    setError(null)
    setIsInitialized(false)
    fetchedRef.current = false
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [tabId])

  // Auto-fetch when summary becomes ready
  useEffect(() => {
    if (autoFetch && isSummaryReady && !fetchedRef.current) {
      console.log(`[useSummary:${tabId}] 🚀 Auto-fetching summary (ready: ${isSummaryReady})`)
      fetchSummary()
    }
  }, [autoFetch, isSummaryReady, fetchSummary, tabId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        console.log(`[useSummary:${tabId}] 🧹 Cleanup: Aborting pending request`)
        abortControllerRef.current.abort()
      }
    }
  }, [tabId])

  return {
    summary,
    isLoading,
    error,
    isInitialized,
    refetch,
    clearSummary,
  }
}