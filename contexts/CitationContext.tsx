"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

/**
 * State for citation management specific to a single tab/PDF
 */
export interface CitationState {
  validCitationIds: Set<string>
  annotationIdToDestination: Map<string, string>
  extractedCitations: any[]
}

/**
 * Context value containing state for all tabs
 * Key is tabId, value is that tab's citation state
 */
interface CitationContextValue {
  states: { [tabId: string]: CitationState }
  updateCitations: (tabId: string, citations: any[]) => void
  updateValidIds: (tabId: string, ids: Set<string>) => void
  updateAnnotationMapping: (tabId: string, mapping: Map<string, string>) => void
  getTabState: (tabId: string) => CitationState
  cleanupTab: (tabId: string) => void
}

const CitationContext = createContext<CitationContextValue | null>(null)

/**
 * Provider component that manages citation state for all tabs
 * Each tab gets isolated citation state to prevent cross-contamination
 */
export function CitationProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<{ [tabId: string]: CitationState }>({})

  /**
   * Get citation state for a specific tab
   * Creates initial state if tab doesn't exist yet
   */
  const getTabState = useCallback((tabId: string): CitationState => {
    if (!states[tabId]) {
      // Return default state for new tabs
      return {
        validCitationIds: new Set<string>(),
        annotationIdToDestination: new Map<string, string>(),
        extractedCitations: []
      }
    }
    return states[tabId]
  }, [states])

  /**
   * Update extracted citations for a specific tab
   */
  const updateCitations = useCallback((tabId: string, citations: any[]) => {
    setStates(prev => ({
      ...prev,
      [tabId]: {
        ...getTabState(tabId),
        extractedCitations: citations
      }
    }))
  }, [getTabState])

  /**
   * Update valid citation IDs for a specific tab
   */
  const updateValidIds = useCallback((tabId: string, ids: Set<string>) => {
    setStates(prev => ({
      ...prev,
      [tabId]: {
        ...getTabState(tabId),
        validCitationIds: ids
      }
    }))
  }, [getTabState])

  /**
   * Update annotation ID to destination mapping for a specific tab
   */
  const updateAnnotationMapping = useCallback((tabId: string, mapping: Map<string, string>) => {
    setStates(prev => ({
      ...prev,
      [tabId]: {
        ...getTabState(tabId),
        annotationIdToDestination: mapping
      }
    }))
  }, [getTabState])

  /**
   * Clean up state when a tab is closed
   * Prevents memory leaks
   */
  const cleanupTab = useCallback((tabId: string) => {
    setStates(prev => {
      const newStates = { ...prev }
      delete newStates[tabId]
      return newStates
    })
  }, [])

  const value: CitationContextValue = {
    states,
    updateCitations,
    updateValidIds,
    updateAnnotationMapping,
    getTabState,
    cleanupTab
  }

  return (
    <CitationContext.Provider value={value}>
      {children}
    </CitationContext.Provider>
  )
}

/**
 * Hook to access citation context
 * Must be used within CitationProvider
 */
export function useCitationContext() {
  const context = useContext(CitationContext)
  if (!context) {
    throw new Error('useCitationContext must be used within CitationProvider')
  }
  return context
}
