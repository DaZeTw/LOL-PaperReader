"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Search, Filter, Grid, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LibraryManager } from "@/components/library-manager"
import { ReferenceTable } from "@/components/reference-table"
import { useReferences } from "@/hooks/useReferences"
import { useCollections } from "@/hooks/useCollections"
import { useDeleteReference } from "@/hooks/useDeleteReference"
import { toast } from "sonner"
import { MetadataTrackingProvider } from "@/contexts/MetadataTrackingContext"

interface LibraryViewProps {
  onOpenPDF: (file: File, title: string, documentId: string) => void
}

export function LibraryView({ onOpenPDF }: LibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)

  // Fetch all references (not filtered by collection)
  const {
    references: allReferences,
    isLoading: referencesLoading,
    error: referencesError,
    total: totalReferences,
    refetch: refetchReferences
  } = useReferences({
    search: searchQuery // Only search, no collection filtering
  })

  // Fetch all collections
  const {
    collections,
    isLoading: collectionsLoading,
    error: collectionsError,
    refetch: refetchCollections
  } = useCollections()

  // Delete functionality
  const { deleteReference, isDeleting } = useDeleteReference()

  console.log('🔵 LibraryView data:', {
    selectedCollection,
    allReferencesCount: allReferences.length,
    collectionsCount: collections.length,
    totalReferences,
    referencesLoading,
    collectionsLoading
  })

  // Filter references based on selected collection
  const filteredReferences = useMemo(() => {
    if (!selectedCollection || selectedCollection === null) {
      // Show all references
      return allReferences
    }

    if (selectedCollection === "recent") {
      // Show recent references (last 30 days or last 50 items)
      return allReferences
        .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
        .slice(0, 50)
    }

    if (selectedCollection === "favorites") {
      // Show favorited references
      return allReferences.filter(ref => ref.is_favorite || ref.isFavorite)
    }

    // For user collections, filter by document_ids
    const collection = collections.find(c => c.id === selectedCollection)
    if (!collection || !collection.documentIds || collection.documentIds.length === 0) {
      return []
    }

    console.log('🔵 Filtering references for collection:', {
      collectionId: selectedCollection,
      collectionName: collection.name,
      documentIds: collection.documentIds,
      totalReferences: allReferences.length
    })

    const filtered = allReferences.filter(ref => {
      const refId = ref.id
      const isIncluded = collection.documentIds.includes(refId)
      if (isIncluded) {
        console.log('🟢 Reference included:', refId, ref.title)
      }
      return isIncluded
    })

    console.log('🔵 Filtered references:', filtered.length)
    return filtered
  }, [allReferences, collections, selectedCollection])


  // Get collection display name
  const getCollectionDisplayName = useCallback((collectionId: string | null) => {
    if (!collectionId) return "All References"

    const builtInNames: Record<string, string> = {
      "recent": "Recent",
      "favorites": "Favorites"
    }

    if (builtInNames[collectionId]) {
      return builtInNames[collectionId]
    }

    // Find actual collection by ID
    const collection = collections.find(c => c.id === collectionId)
    return collection ? collection.name : "Unknown Collection"
  }, [collections])

  // Handle references added - refresh all data
  const handleReferencesAdded = useCallback(() => {
    console.log('🔵 handleReferencesAdded called, refreshing all data...')
    refetchReferences()
    refetchCollections()
  }, [refetchReferences, refetchCollections])

  // Handle collection changes (add/remove references from collections)
  const handleCollectionChange = useCallback(() => {
    console.log('🔵 handleCollectionChange called, refreshing collections...')
    refetchCollections() // Refresh collections to get updated document_ids
  }, [refetchCollections])

  // Debounced refresh for metadata updates
  // Prevents multiple rapid refetches when multiple documents finish simultaneously
  const handleMetadataRefresh = useCallback(() => {
    // Basic debounce implementation
    const now = Date.now()
    const lastRefresh = (window as any)._lastMetadataRefresh || 0
    const timeSinceLastRefresh = now - lastRefresh

    // If we refreshed recently (< 2 seconds), don't refresh again immediately
    // but schedule one for later if not already scheduled
    if (timeSinceLastRefresh < 2000) {
      if (!(window as any)._refreshTimeout) {
        console.log('⏳ Metadata refresh debounced, scheduling for later...')
          (window as any)._refreshTimeout = setTimeout(() => {
            console.log('🔄 Executing delayed metadata refresh...')
            refetchReferences();
            (window as any)._lastMetadataRefresh = Date.now();
            (window as any)._refreshTimeout = null
          }, 2000)
      }
      return
    }

    console.log('🔄 Executing metadata refresh immediately...')
    refetchReferences();
    (window as any)._lastMetadataRefresh = now
  }, [refetchReferences])

  // Handle delete reference
  const handleDeleteReference = useCallback(async (reference: any) => {
    const refId = reference.id || reference._id
    const title = reference.title || "this document"

    console.log('🔵 Delete reference data:', { refId, title, reference })

    if (!refId) {
      console.error('🔴 No valid ID found for reference:', reference)
      toast.error('Cannot delete reference: Invalid ID')
      return
    }

    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
      return
    }

    try {
      console.log('🔵 Deleting reference:', refId)
      await deleteReference(refId)
      toast.success('Reference deleted successfully')

      // Refresh data after successful delete
      refetchReferences()
      refetchCollections()
    } catch (err) {
      console.error('🔴 Failed to delete reference:', err)
      toast.error('Failed to delete reference')
    }
  }, [deleteReference, refetchReferences, refetchCollections])

  // Get current collections for a reference (for CollectionManager)
  const getCurrentCollectionReferences = useCallback((referenceId: string) => {
    return collections
      .filter(collection => collection.documentIds?.includes(referenceId))
      .map(collection => collection.id)
  }, [collections])

  return (
    <MetadataTrackingProvider onMetadataChange={handleMetadataRefresh}>
      <div className="flex h-full bg-background">
        {/* Library Manager - Left Sidebar */}
        <div className="w-64 border-r border-border bg-muted/30">
          <LibraryManager
            selectedCollection={selectedCollection}
            onCollectionChange={setSelectedCollection}
            onReferencesAdded={handleReferencesAdded}
            onCollectionUpdate={refetchCollections}
            collections={collections}
            collectionsLoading={collectionsLoading}
            collectionsError={collectionsError}
            totalReferences={totalReferences}
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {getCollectionDisplayName(selectedCollection)}
              </h2>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span>•</span>
                <span>{filteredReferences.length} items</span>
              </div>

            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search references..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-80 pl-9"
                />
              </div>

              {/* View Toggle */}
              <div className="flex items-center rounded-md border border-border">
                <Button
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className="rounded-r-none border-r border-border"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="rounded-l-none"
                >
                  <Grid className="h-4 w-4" />
                </Button>
              </div>

              {/* Filter */}
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>
          </div>

          {/* Reference Table */}
          <div className="flex-1 overflow-hidden">
            <ReferenceTable
              // references={augmentedReferences}
              references={filteredReferences}
              isLoading={referencesLoading}
              error={referencesError}
              viewMode={viewMode}
              onOpenPDF={onOpenPDF}
              onDeleteReference={handleDeleteReference}
              onCollectionChange={handleCollectionChange}
              getCurrentCollectionReferences={getCurrentCollectionReferences}
              isDeleting={isDeleting}
            />
          </div>
        </div>
      </div>
    </MetadataTrackingProvider>
  )
}