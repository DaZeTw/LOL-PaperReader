"use client"

import { useState } from "react"
import { Search, Filter, Grid, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LibraryManager } from "@/components/library-manager"
import { ReferenceTable } from "@/components/reference-table"
import { cn } from "@/lib/utils"

interface LibraryViewProps {
  onOpenPDF: (file: File, title: string) => void
}

export function LibraryView({ onOpenPDF }: LibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)

  return (
    <div className="flex h-full bg-background">
      {/* Library Manager - Left Sidebar */}
      <div className="w-64 border-r border-border bg-muted/30">
        <LibraryManager
          selectedCollection={selectedCollection}
          onCollectionChange={setSelectedCollection}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {selectedCollection || "All References"}
            </h2>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>•</span>
              <span>1,234 items</span>
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