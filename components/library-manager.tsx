"use client"

import { useState } from "react"
import { Folder, Clock, Star, Tag, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AddReferences } from "@/components/add-references"
import { useReferences } from "@/hooks/useReferences"
import { cn } from "@/lib/utils"

interface LibraryManagerProps {
  selectedCollection: string | null
  onCollectionChange: (collection: string | null) => void
  onReferencesAdded?: () => void
}

export function LibraryManager({ 
  selectedCollection, 
  onCollectionChange,
  onReferencesAdded 
}: LibraryManagerProps) {
  const [showAddReferences, setShowAddReferences] = useState(false)
  
  // Get total count from API
  const { total: totalReferences } = useReferences({ enabled: true })
  
  // Mock collection counts - in real app, you'd fetch these from API
  const collections = [
    { id: null, name: "All References", icon: Folder, count: totalReferences },
    { id: "recent", name: "Recent", icon: Clock, count: 25 },
    { id: "favorites", name: "Favorites", icon: Star, count: 67 },
    { id: "machine-learning", name: "Machine Learning", icon: Tag, count: 156 },
    { id: "computer-vision", name: "Computer Vision", icon: Tag, count: 89 },
    { id: "nlp", name: "Natural Language Processing", icon: Tag, count: 134 }
  ]

  const handleReferencesAdded = () => {
    setShowAddReferences(false)
    // Trigger parent refresh if callback provided
    onReferencesAdded?.()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with Add Button */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Collections</h3>
        </div>
        
        {/* Add References Button */}
        <Button 
          onClick={() => setShowAddReferences(true)}
          className="w-full gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Add References
        </Button>
      </div>

      {/* Collections Navigation */}
      <nav className="flex-1 p-2">
        <div className="space-y-1">
          {collections.map((collection) => {
            const Icon = collection.icon
            return (
              <Button
                key={collection.id}
                variant={selectedCollection === collection.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => onCollectionChange(collection.id)}
                className="w-full justify-between"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="text-sm">{collection.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {collection.count || 0}
                </span>
              </Button>
            )
          })}
        </div>
      </nav>

      {/* Add References Modal */}
      {showAddReferences && (
        <AddReferences 
          onClose={() => setShowAddReferences(false)}
          onReferencesAdded={handleReferencesAdded}
        />
      )}
    </div>
  )
}