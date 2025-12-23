// 'use client'

// import { useState, useEffect, useRef, useCallback } from 'react'
// import { useAuth } from '@/hooks/useAuth'
// import { METADATA_API_ENDPOINT } from '@/lib/config'
// import { fetchPdfMetadata, ParsedMetadata } from '@/lib/metadata-service'
// import { useReferenceFile } from '@/hooks/useReferenceFile'


// interface UseRefMetaReturn {
//     metadata: ParsedMetadata | null
//     isLoading: boolean
//     error: Error | null
//     fetchMetadata: (force?: boolean) => Promise<void>
// }

// /**
//  * Custom hook to fetch and manage augmented metadata for a specific reference.
//  *
//  * This hook orchestrates the following flow:
//  * 1. Fetches the PDF file blob for the given reference ID (using useReferenceFile).
//  * 2. Sends the blob to an external metadata enrichment service (Grobid Augmented).
//  * 3. Returns the parsed metadata (authors, DOI, etc.).
//  *
//  * Features:
//  * - Prevents duplicate fetches for the same ID (deduplication).
//  * - Handles authentication automatically.
//  *
//  * @param referenceId - The unique ID of the document/reference.
//  * @returns An object containing:
//  *  - metadata: The fetched metadata or null.
//  *  - isLoading: Loading state.
//  *  - error: Error object if fetch failed.
//  *  - fetchMetadata: Function to manually trigger a refetch (pass force=true to bypass dedupe).
//  */
// export function useRefMeta(referenceId: string | undefined): UseRefMetaReturn {
//     const { user } = useAuth()
//     const { fetchFileBlob } = useReferenceFile()
//     const [metadata, setMetadata] = useState<ParsedMetadata | null>(null)
//     const [isLoading, setIsLoading] = useState(false)
//     const [error, setError] = useState<Error | null>(null)

//     // Ref tracking to prevent duplicate fetches
//     const isFetching = useRef(false)
//     const hasFetched = useRef(false)
//     const lastFetchId = useRef<string | undefined>(undefined)
//     const fetchMetadata = useCallback(async (force = false) => {
//         // 1. Validation
//         if (!user || !referenceId) return
//         // Skip if currently fetching or already fetched (unless forced)
//         if (!force && (isFetching.current || (hasFetched.current && lastFetchId.current === referenceId))) {
//             console.log('🔵 [useRefMeta] Skipping duplicate fetch for:', referenceId)
//             return
//         }
//         console.log('🔵 [useRefMeta] Fetching details for:', referenceId)

//         isFetching.current = true
//         setIsLoading(true)
//         setError(null)
//         try {
//             // 2. Get PDF Blob
//             const { blob } = await fetchFileBlob(referenceId)

//             // 3. Call External Metadata API
//             const result = await fetchPdfMetadata(blob, `${METADATA_API_ENDPOINT}/grobid_augmented`)

//             if (result) {
//                 console.log('🔵 [useRefMeta] Metadata success:', result)
//                 setMetadata(result)
//             } else {
//                 console.warn('🟡 [useRefMeta] No metadata found')
//             }

//             hasFetched.current = true
//             lastFetchId.current = referenceId
//         } catch (err) {
//             console.error('🔴 [useRefMeta] Failed:', err)
//             setError(err instanceof Error ? err : new Error('Unknown error fetching metadata'))
//         } finally {
//             isFetching.current = false
//             setIsLoading(false)
//         }
//     }, [referenceId, user, fetchFileBlob])
//     // 4. Auto trigger when ID changes
//     useEffect(() => {
//         if (referenceId && !hasFetched.current) {
//             fetchMetadata()
//         }
//     }, [referenceId, fetchMetadata])
//     return {
//         metadata,
//         isLoading,
//         error,
//         fetchMetadata
//     }
// }