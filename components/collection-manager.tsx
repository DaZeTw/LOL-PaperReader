"use client"

import { useState, ReactNode } from "react"
import { Plus, Minus, FolderPlus, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
// import { useCollections } from "@/hooks/useCollections"
// import { useAddToCollection } from "@/hooks/useAddToCollection"
// import { useRemoveFromCollection } from "@/hooks/useRemoveFromCollection"
import { useCollectionsContext } from "@/contexts/CollectionsContext"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface CollectionManagerProps {
  referenceId: string
  referenceTitle: string
  currentCollections?: string[]
  onCollectionChange?: () => void
  trigger?: ReactNode
}

export function CollectionManager({
  referenceId,
  referenceTitle,
  currentCollections = [],
  onCollectionChange,
  trigger
}: CollectionManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // const { collections, isLoading } = useCollectionsContext()
  // const { addToCollection, isAdding } = useAddToCollection()
  // const { removeFromCollection, isRemoving } = useRemoveFromCollection()

  const {
    collections,
    isLoading,
    addToCollection,
    removeFromCollection,
    isAdding,
    isRemoving,
    addError,
    removeError,
    resetAddError,
    resetRemoveError
  } = useCollectionsContext()


  const handleAddToCollection = async (collectionId: string, collectionName: string) => {
    try {
      await addToCollection(collectionId, [referenceId])
      toast.success(`Added to "${collectionName}"`)
      onCollectionChange?.()
    } catch (error) {
      console.error('Failed to add to collection:', error)
      toast.error('Failed to add to collection')
    }
  }

  const handleRemoveFromCollection = async (collectionId: string, collectionName: string) => {
    try {
      await removeFromCollection(collectionId, [referenceId])
      toast.success(`Removed from "${collectionName}"`)
      onCollectionChange?.()
    } catch (error) {
      console.error('Failed to remove from collection:', error)
      toast.error('Failed to remove from collection')
    }
  }

  const isInCollection = (collectionId: string) => {
    return currentCollections.includes(collectionId)
  }

  // Filter collections based on search query and ensure unique IDs
  const filteredCollections = collections
    .filter(collection => collection.id) // Ensure collection has an ID
    .filter(collection =>
      collection.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (collection.description && collection.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )

  const triggerContent = trigger ?? (
    <div className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent">
      <FolderPlus className="h-4 w-4" />
      <span>Manage Collections</span>
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {triggerContent}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manage Collections</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Add or remove "{referenceTitle}" from collections
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="space-y-2">
            <Input
              placeholder="Search collections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Collections List */}
          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {isLoading ? (
              <div className="text-center text-sm text-muted-foreground py-4">
                Loading collections...
              </div>
            ) : filteredCollections.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-4">
                {searchQuery ? "No collections found matching your search." : "No collections found. Create a collection first."}
              </div>
            ) : (
              filteredCollections.map((collection, index) => {
                // Use collection.id as primary key, fallback to index if needed
                const key = collection.id || `collection-${index}`
                const inCollection = isInCollection(collection.id)

                return (
                  <div
                    key={key} // Fixed: Use the computed key
                    className={cn(
                      "flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors",
                      inCollection
                        ? "bg-primary/10 border-primary/20"
                        : "hover:bg-accent border-border"
                    )}
                    onClick={() => {
                      if (inCollection) {
                        handleRemoveFromCollection(collection.id, collection.name)
                      } else {
                        handleAddToCollection(collection.id, collection.name)
                      }
                    }}
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{collection.name}</span>
                        {inCollection && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      {collection.description && (
                        <p className="text-xs text-muted-foreground">
                          {collection.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {collection.documentCount || 0} items
                      </p>
                    </div>
                    <div className="flex items-center">
                      {inCollection ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 w-8 p-0"
                          disabled={isRemoving}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveFromCollection(collection.id, collection.name)
                          }}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-8 w-8 p-0"
                          disabled={isAdding}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAddToCollection(collection.id, collection.name)
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              size="sm"
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
