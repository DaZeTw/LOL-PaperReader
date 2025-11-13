"use client"

import React, { createContext, useCallback, useContext, useState } from "react"

export interface CitationState {
  citations: any[]
  extractedCitations: any[]
  metadata: Map<string, any>
  validCitationIds: Set<string>
  annotationIdToDestination: Map<string, string>
}

type CitationStates = Record<string, CitationState>

interface CitationContextType {
  states: CitationStates
  getTabState: (tabId: string) => CitationState
  getTabCitations: (tabId: string) => any[]
  setTabCitations: (tabId: string, citations: any[]) => void
  updateCitations: (tabId: string, citations: any[]) => void
  getTabMetadata: (tabId: string, citationId: string) => any | null
  setTabMetadata: (tabId: string, citationId: string, metadata: any) => void
  updateValidIds: (tabId: string, ids: Set<string>) => void
  updateAnnotationMapping: (tabId: string, mapping: Map<string, string>) => void
  cleanupTab: (tabId: string) => void
}

const createInitialTabState = (): CitationState => ({
  citations: [],
  extractedCitations: [],
  metadata: new Map(),
  validCitationIds: new Set(),
  annotationIdToDestination: new Map(),
})

const CitationContext = createContext<CitationContextType | undefined>(undefined)

export function CitationProvider({ children }: { children: React.ReactNode }) {
  const [states, setStates] = useState<CitationStates>({})

  const getTabState = useCallback(
    (tabId: string): CitationState => {
      return states[tabId] ?? createInitialTabState()
    },
    [states],
  )

  const getTabCitations = useCallback(
    (tabId: string) => {
      return states[tabId]?.citations ?? []
    },
    [states],
  )

  const updateCitations = useCallback((tabId: string, citations: any[]) => {
    setStates((prev) => {
      const tabState = prev[tabId] ?? createInitialTabState()
      const nextState: CitationState = {
        ...tabState,
        citations,
        extractedCitations: citations,
      }
      return {
        ...prev,
        [tabId]: nextState,
      }
    })
  }, [])

  const setTabCitations = useCallback(
    (tabId: string, citations: any[]) => {
      updateCitations(tabId, citations)
    },
    [updateCitations],
  )

  const getTabMetadata = useCallback(
    (tabId: string, citationId: string) => {
      return states[tabId]?.metadata?.get(citationId) ?? null
    },
    [states],
  )

  const setTabMetadata = useCallback((tabId: string, citationId: string, metadata: any) => {
    setStates((prev) => {
      const tabState = prev[tabId] ?? createInitialTabState()
      const newMetadata = new Map(tabState.metadata)
      newMetadata.set(citationId, metadata)

      return {
        ...prev,
        [tabId]: {
          ...tabState,
          metadata: newMetadata,
        },
      }
    })
  }, [])

  const updateValidIds = useCallback((tabId: string, ids: Set<string>) => {
    const idsClone = new Set(ids)
    setStates((prev) => {
      const tabState = prev[tabId] ?? createInitialTabState()
      return {
        ...prev,
        [tabId]: {
          ...tabState,
          validCitationIds: idsClone,
        },
      }
    })
  }, [])

  const updateAnnotationMapping = useCallback((tabId: string, mapping: Map<string, string>) => {
    const mappingClone = new Map(mapping)
    setStates((prev) => {
      const tabState = prev[tabId] ?? createInitialTabState()
      return {
        ...prev,
        [tabId]: {
          ...tabState,
          annotationIdToDestination: mappingClone,
        },
      }
    })
  }, [])

  const cleanupTab = useCallback((tabId: string) => {
    setStates((prev) => {
      if (!prev[tabId]) {
        return prev
      }
      const next = { ...prev }
      delete next[tabId]
      return next
    })
  }, [])

  return (
    <CitationContext.Provider
      value={{
        states,
        getTabState,
        getTabCitations,
        setTabCitations,
        updateCitations,
        getTabMetadata,
        setTabMetadata,
        updateValidIds,
        updateAnnotationMapping,
        cleanupTab,
      }}
    >
      {children}
    </CitationContext.Provider>
  )
}

export function useCitationContext() {
  const context = useContext(CitationContext)
  if (!context) {
    throw new Error("useCitationContext must be used within a CitationProvider")
  }
  return context
}

