"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react'
import { useMetadataReady } from '@/hooks/usePipelineStatus'

interface MetadataTrackingContextType {
    trackDocument: (documentId: string) => void
    trackingIds: Set<string>
}

const MetadataTrackingContext = createContext<MetadataTrackingContextType | undefined>(undefined)

interface MetadataTrackingProviderProps {
    children: ReactNode
    onMetadataChange?: () => void
}

/**
 * MetadataTrackingProvider
 * 
 * Manages a list of document IDs that need to be watched for metadata completion.
 * When a tracked document's metadata becomes ready, it triggers the callback
 * and removes the document from the tracking list.
 */
export function MetadataTrackingProvider({ children, onMetadataChange }: MetadataTrackingProviderProps) {
    const [trackingIds, setTrackingIds] = useState<Set<string>>(new Set())

    const trackDocument = useCallback((documentId: string) => {
        if (!documentId) return
        console.log(`[MetadataTracking] Start tracking: ${documentId}`)
        setTrackingIds(prev => {
            const next = new Set(prev)
            next.add(documentId)
            return next
        })
    }, [])

    const untrackDocument = useCallback((documentId: string) => {
        setTrackingIds(prev => {
            const next = new Set(prev)
            if (next.has(documentId)) {
                console.log(`[MetadataTracking] Stop tracking: ${documentId}`)
                next.delete(documentId)
                return next
            }
            return prev
        })
    }, [])

    // Provide the context value
    const value = {
        trackDocument,
        trackingIds
    }

    return (
        <MetadataTrackingContext.Provider value={value}>
            {children}

            {/* 
        Render invisible watchers for each tracked document.
        This ensures we subscribe to their status updates.
      */}
            {Array.from(trackingIds).map(id => (
                <SingleDocumentWatcher
                    key={id}
                    documentId={id}
                    onReady={() => {
                        untrackDocument(id)
                        if (onMetadataChange) {
                            onMetadataChange()
                        }
                    }}
                />
            ))}
        </MetadataTrackingContext.Provider>
    )
}

/**
 * Internal component to watch a single document
 */
function SingleDocumentWatcher({ documentId, onReady }: { documentId: string, onReady: () => void }) {
    const { isMetadataReady } = useMetadataReady(documentId)
    const hasTriggeredRef = useRef(false)

    useEffect(() => {
        if (isMetadataReady && !hasTriggeredRef.current) {
            console.log(`[MetadataTracking] Ready detected for: ${documentId}`)
            hasTriggeredRef.current = true
            onReady()
        }
    }, [isMetadataReady, documentId, onReady])

    return null
}

export function useMetadataTracking() {
    const context = useContext(MetadataTrackingContext)
    if (context === undefined) {
        throw new Error('useMetadataTracking must be used within a MetadataTrackingProvider')
    }
    return context
}
