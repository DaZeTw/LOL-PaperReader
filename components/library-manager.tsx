"use client"

import { useState, useCallback } from "react"
import { Folder, Clock, Star, Tag, Plus, MoreHorizontal, Trash2, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AddReferences } from "@/components/add-references"
// import { Collection } from "@/hooks/useCollections"
// import { useCreateCollection } from "@/hooks/useCreateCollection"
// import { useDeleteCollection } from "@/hooks/useDeleteCollection"
import { Collection, useCollectionsContext } from '@/contexts/CollectionsContext'
import { FileText } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

interface LibraryManagerProps {
  selectedCollection: string | null
  onCollectionChange: (collectionId: string | null) => void
  onReferencesAdded: () => void
  onCollectionUpdate: () => void
  collections: Collection[]
  collectionsLoading: boolean
  collectionsError: Error | null
  totalReferences: number
}

export function LibraryManager({
  selectedCollection,
  onCollectionChange,
  onReferencesAdded,
  onCollectionUpdate,
  collections,
  collectionsLoading,
  collectionsError,
  totalReferences
}: LibraryManagerProps) {
  const [showAddReferences, setShowAddReferences] = useState(false)
  const [showCreateCollection, setShowCreateCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState("")
  const [newCollectionDescription, setNewCollectionDescription] = useState("")

  // Collection management hooks
  // const { createCollection, isCreating } = useCreateCollection()
  // const { deleteCollection, isDeleting } = useDeleteCollection()

  const { createCollection, isCreating, createError,
    deleteCollection, isDeleting, deleteError,
  } = useCollectionsContext()

  // Handle references added
  const handleReferencesAdded = useCallback(() => {
    console.log('🔵 LibraryManager: References added')
    onReferencesAdded()
    onCollectionUpdate()
  }, [onReferencesAdded, onCollectionUpdate])

  // Handle collection creation
  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return

    try {
      await createCollection({
        name: newCollectionName.trim(),
        description: newCollectionDescription.trim()
      })
      toast.success('Collection created successfully')

      setNewCollectionName("")
      setNewCollectionDescription("")
      setShowCreateCollection(false)
      onCollectionUpdate()
    } catch (error) {
      console.error('Failed to create collection:', error)
      toast.error('Failed to create collection')
    }
  }

  // Handle collection deletion
  const handleDeleteCollection = async (collectionId: string, collectionName: string) => {
    if (!collectionId || collectionId === 'undefined') {
      console.error('🔴 Invalid collection ID:', collectionId)
      toast.error('Cannot delete collection: Invalid ID')
      return
    }

    if (!confirm(`Are you sure you want to delete "${collectionName}"?`)) {
      return
    }

    try {
      await deleteCollection(collectionId)
      toast.success('Collection deleted successfully')

      if (selectedCollection === collectionId) {
        onCollectionChange(null)
      }

      onCollectionUpdate()
    } catch (error) {
      console.error('🔴 Failed to delete collection:', error)
      toast.error('Failed to delete collection')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with Add References Button */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">Library</h2>
        </div>

        {/* Add References Button - Prominent */}
        <Button
          onClick={() => setShowAddReferences(true)}
          className="w-full"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add References
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 overflow-y-auto">
        <div className="space-y-1">
          {/* Built-in Collections */}
          <div className="space-y-1">
            <Button
              variant={selectedCollection === null ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onCollectionChange(null)}
              className="w-full justify-between"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span>All References</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {totalReferences}
              </span>
            </Button>

            <Button
              variant={selectedCollection === "recent" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onCollectionChange("recent")}
              className="w-full justify-between"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Recent</span>
              </div>
            </Button>

            <Button
              variant={selectedCollection === "favorites" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onCollectionChange("favorites")}
              className="w-full justify-between"
            >
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4" />
                <span>Favorites</span>
              </div>
            </Button>
          </div>

          {/* Collections Header */}
          <div className="flex items-center justify-between pt-4 pb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Collections
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreateCollection(true)}
              className="h-6 w-6 p-0"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          {/* User Collections */}
          {collectionsLoading ? (
            <div className="text-xs text-muted-foreground text-center py-2">
              Loading collections...
            </div>
          ) : (
            collections.map((collection) => {
              const isSelected = selectedCollection === collection.id

              return (
                <div key={collection.id} className="group relative">
                  <Button
                    variant={isSelected ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => onCollectionChange(collection.id)}
                    className="w-full justify-between pr-8"
                  >
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      <span className="text-sm truncate">{collection.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {collection.documentCount || 0}
                    </span>
                  </Button>

                  {/* Collection Actions */}
                  <div className="absolute right-1 top-1 opacity-0 group-hover:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleDeleteCollection(collection.id, collection.name)}
                          className="text-destructive"
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </nav>

      {/* Add References Modal */}
      {showAddReferences && (
        <AddReferences
          onClose={() => setShowAddReferences(false)}
          onReferencesAdded={handleReferencesAdded}
        />
      )}

      {/* Create Collection Modal */}
      <Dialog open={showCreateCollection} onOpenChange={setShowCreateCollection}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Collection</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="Enter collection name"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCollectionName.trim()) {
                    handleCreateCollection()
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                placeholder="Enter collection description"
                value={newCollectionDescription}
                onChange={(e) => setNewCollectionDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateCollection(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateCollection}
              disabled={!newCollectionName.trim() || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Collection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}