"use client"

import { useState, useCallback } from "react"
import { Search, Filter, Grid, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LibraryManager } from "@/components/library-manager"
import { ReferenceTable } from "@/components/reference-table"
import { useReferences } from "@/hooks/useReferences"
import { cn } from "@/lib/utils"

interface LibraryViewProps {
  onOpenPDF: (file: File, title: string) => void
}

export function LibraryView({ onOpenPDF }: LibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)

  const { total, refetch } = useReferences({
    collection: selectedCollection,
    search: searchQuery
  })

  const handleReferencesAdded = useCallback(() => {
    refetch()
  }, [refetch])

  const getCollectionDisplayName = (collectionId: string | null) => {
    const collectionNames: Record<string, string> = {
      "recent": "Recent",
      "favorites": "Favorites", 
      "machine-learning": "Machine Learning",
      "computer-vision": "Computer Vision",
      "nlp": "Natural Language Processing"
    }
    
    return collectionNames[collectionId || ''] || "All References"
  }

  return (
    <div className="flex h-full bg-background">
      <div className="w-64 border-r border-border bg-muted/30">
        <LibraryManager
          selectedCollection={selectedCollection}
          onCollectionChange={setSelectedCollection}
          onReferencesAdded={handleReferencesAdded}
        />
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {getCollectionDisplayName(selectedCollection)}
            </h2>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>•</span>
              <span>{total} items</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search references..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-80 pl-9"
              />
            </div>

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

            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <ReferenceTable
            searchQuery={searchQuery}
            selectedCollection={selectedCollection}
            viewMode={viewMode}
            onOpenPDF={onOpenPDF}
          />
        </div>
      </div>
    </div>
  )
}

