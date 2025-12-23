"use client"
import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { ParsedMetadata, fetchPdfMetadata } from '@/lib/metadata-service'
import { METADATA_API_ENDPOINT } from '@/lib/config'
import { useReferenceFile } from '@/hooks/useReferenceFile'

interface MetadataContextType {
    /** Map of Document ID to its parsed metadata (Title, Authors, DOI...) */
    metadataMap: Record<string, ParsedMetadata | undefined>
    /** Map of Document ID to its loading status */
    loadingMap: Record<string, boolean>
    /** 
     * Triggers the metadata fetching process for a given document.
     * Logic: Fetch PDF Blob -> Send to External API -> Store Result.
     * @param id - Document ID
     * @param force - If true, bypasses the in-memory cache and active request deduplication.
     */
    fetchMetadata: (id: string, force?: boolean) => Promise<void>
}

const MetadataContext = createContext<MetadataContextType | undefined>(undefined)

/**
 * Global provider for PDF Metadata.
 * 
 * Capabilities:
 * 1. Centralized Store (In-Memory Cache) for metadata of all loaded documents.
 * 2. Request Manager that handles fetching PDF Blobs and calling the external Metadata API.
 * 3. Deduplication engine to prevent redundant API calls for the same document.
 */
export function MetadataProvider({ children }: { children: React.ReactNode }) {
    const { fetchFileBlob } = useReferenceFile()
    const [metadataMap, setMetadataMap] = useState<Record<string, ParsedMetadata>>({})
    const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})

    const fetchingRefs = useRef<Set<string>>(new Set())
    const fetchMetadata = useCallback(async (id: string, force = false) => {
        if (!id) return
        if (!force && (fetchingRefs.current.has(id) || metadataMap[id])) return
        fetchingRefs.current.add(id)
        setLoadingMap(prev => ({ ...prev, [id]: true }))
        try {
            console.log(`🔵 Fetching metadata for ${id}`)
            const { blob } = await fetchFileBlob(id)
            const data = await fetchPdfMetadata(blob, `${METADATA_API_ENDPOINT}/grobid_augmented`)

            if (data) {
                setMetadataMap(prev => ({ ...prev, [id]: data }))
            }
        } catch (err) {
            console.error(`🔴 Error fetching ${id}`, err)
        } finally {
            fetchingRefs.current.delete(id)
            setLoadingMap(prev => ({ ...prev, [id]: false }))
        }
    }, [metadataMap, fetchFileBlob])
    return (
        <MetadataContext.Provider value={{ metadataMap, loadingMap, fetchMetadata }}>
            {children}
        </MetadataContext.Provider>
    )
}

export function useMetadata() {
    const context = useContext(MetadataContext)
    if (!context) throw new Error("useMetadata must be used within MetadataProvider")
    return context
}