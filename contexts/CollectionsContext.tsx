"use client"

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { BACKEND_API_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

// this file will be used to manage collections
// useCreateCollection, and useCollection functionality will be migrated here for centralized management

interface CreateCollectionData {
    name: string
    description?: string
}


export interface Collection {
    id: string
    name: string
    description: string
    documentCount: number
    createdAt: string
    updatedAt: string
    documentIds: string[]
}

interface CollectionsContextType {
    // --- State & Action migrated from useCollections ---
    collections: Collection[]
    isLoading: boolean
    error: Error | null
    refetch: () => Promise<void>
    // --- State & Action migrated from useCreateCollection ---
    createCollection: (data: CreateCollectionData) => Promise<Collection>
    isCreating: boolean
    createError: Error | null
    resetCreateError: () => void

    // --- State & Action migrated from useDeleteCollection ---
    deleteCollection: (id: string) => Promise<void>
    isDeleting: boolean
    deleteError: Error | null
    resetDeleteError: () => void

    // --- State & Action migrated from useAddToCollection ---
    addToCollection: (collectionId: string, referenceIds: string[]) => Promise<void>
    isAdding: boolean
    addError: Error | null
    resetAddError: () => void

    // --- State & Action migrated from useRemoveFromCollection ---
    removeFromCollection: (collectionId: string, referenceIds: string[]) => Promise<void>
    isRemoving: boolean
    removeError: Error | null
    resetRemoveError: () => void
}


const CollectionsContext = createContext<CollectionsContextType | undefined>(undefined)

export function CollectionsProvider({ children }: { children: React.ReactNode }) {
    const { user, login } = useAuth()

    // 1. States for storing collections
    const [collections, setCollections] = useState<Collection[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    // 2. States for creating new collection
    const [isCreating, setIsCreating] = useState(false)
    const [createError, setCreateError] = useState<Error | null>(null)

    // 3. States for deleting collection
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState<Error | null>(null)

    // 4. States for adding documents to collection
    const [isAdding, setIsAdding] = useState(false)
    const [addError, setAddError] = useState<Error | null>(null)

    // 5. States for removing documents from collection
    const [isRemoving, setIsRemoving] = useState(false)
    const [removeError, setRemoveError] = useState<Error | null>(null)

    // --- Action 1: FETCH COLLECTIONS ---
    const fetchCollections = useCallback(async () => {
        if (!user) return
        setIsLoading(true)
        setError(null)
        try {
            const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/collections`
            const userId = user.dbId ? String(user.dbId) : user.id
            const response = await fetch(baseUrl, {
                headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
                credentials: 'include',
            })
            if (!response.ok) throw new Error(`Failed to fetch collections`)
            const data = await response.json()
            console.log("Raw collections", data)
            // Map data (copy đoạn mapping migrated from useCollections.tsx sang đây)
            const mapped = (data.collections || []).map((c: any) => ({
                id: c._id || c.id,
                name: c.name,
                description: c.description,
                documentCount: c.document_ids.length || c.documentCount || 0,
                createdAt: c.created_at || c.createdAt,
                updatedAt: c.updated_at || c.updatedAt,
                documentIds: c.document_ids || c.documentIds || []
            }))
            setCollections(mapped)
            console.log("Fetched collections", mapped)
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'))
        } finally {
            setIsLoading(false)
        }
    }, [user])

    // --- Action 2: CREATE NEW COLLECTION ---
    const createCollection = async (data: CreateCollectionData): Promise<Collection> => {
        if (!user) { login(); throw new Error('Auth required') }
        setIsCreating(true)
        setCreateError(null)
        try {
            const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/collections`
            const userId = user.dbId ? String(user.dbId) : user.id
            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
                body: JSON.stringify(data),
                credentials: 'include',
            })
            if (!response.ok) throw new Error('Failed to create')
            const result = await response.json()

            // IMPORTANT: After creating successfully, we automatically refetch
            await fetchCollections()

            return result.collection
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Unknown error')
            setCreateError(error)
            throw error
        } finally {
            setIsCreating(false)
        }
    }

    const resetCreateError = () => setCreateError(null)

    // --- Action 3: DELETE COLLECTION ---
    const deleteCollection = async (collectionId: string): Promise<void> => {
        if (!user) throw new Error('Auth required')
        setIsDeleting(true)
        setDeleteError(null)
        try {
            const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/collections`
            const userId = user.dbId ? String(user.dbId) : user.id
            const response = await fetch(`${baseUrl}/${collectionId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
                credentials: 'include',
            })
            if (!response.ok) throw new Error('Failed to delete')

            // IMPORTANT: After deleting successfully, we automatically refetch
            await fetchCollections()
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Unknown error')
            setDeleteError(error)
            throw error
        } finally {
            setIsDeleting(false)
        }
    }
    const resetDeleteError = () => setDeleteError(null)

    // --- Action 4: ADD DOCUMENTS TO COLLECTION ---
    const addToCollection = async (collectionId: string, referenceIds: string[]): Promise<void> => {
        if (!user) throw new Error('Auth required')
        setIsAdding(true)
        setAddError(null)
        try {
            const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/collections`
            const userId = user.dbId ? String(user.dbId) : user.id
            const promises = referenceIds.map(async (docId) => {
                const response = await fetch(`${baseUrl}/${collectionId}/documents`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
                    body: JSON.stringify({ documentId: docId }),
                    credentials: 'include',
                })
                if (!response.ok) throw new Error('Failed to add document')
                return response.json()
            })
            await Promise.all(promises)

            // IMPORTANT: Update collections to increase documentCount
            await fetchCollections()
        } catch (err) {
            setAddError(err instanceof Error ? err : new Error('Unknown error'))
            throw err
        } finally {
            setIsAdding(false)
        }
    }
    const resetAddError = () => setAddError(null)

    // --- Action 5: REMOVE DOCUMENTS FROM COLLECTION ---
    const removeFromCollection = async (collectionId: string, referenceIds: string[]): Promise<void> => {
        if (!user) throw new Error('Auth required')
        setIsRemoving(true)
        setRemoveError(null)
        try {
            const baseUrl = `${BACKEND_API_URL.replace(/\/$/, '')}/api/collections`
            const userId = user.dbId ? String(user.dbId) : user.id
            const promises = referenceIds.map(async (docId) => {
                const response = await fetch(`${baseUrl}/${collectionId}/documents/${docId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
                    credentials: 'include',
                })
                if (!response.ok) throw new Error('Failed to remove document')
                return response.json()
            })
            await Promise.all(promises)

            // IMPORTANT: Update collections after removing documents
            await fetchCollections()
        } catch (err) {
            setRemoveError(err instanceof Error ? err : new Error('Unknown error'))
            throw err
        } finally {
            setIsRemoving(false)
        }
    }
    const resetRemoveError = () => setRemoveError(null)

    // Auto load data on first render
    useEffect(() => {
        if (user) fetchCollections()
    }, [user, fetchCollections])

    return (
        <CollectionsContext.Provider value={{
            collections, isLoading, error, refetch: fetchCollections,
            createCollection, isCreating, createError, resetCreateError,
            deleteCollection, isDeleting, deleteError, resetDeleteError,
            addToCollection, isAdding, addError, resetAddError,
            removeFromCollection, isRemoving, removeError, resetRemoveError
        }}>
            {children}
        </CollectionsContext.Provider>
    )
}

// Hook for child components to use
export function useCollectionsContext() {
    const context = useContext(CollectionsContext)
    if (context === undefined) {
        throw new Error('useCollectionsContext must be used within a CollectionsProvider')
    }
    return context
}