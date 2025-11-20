"use client"

import { FileText, ExternalLink, MoreHorizontal, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useReferences } from "@/hooks/useReferences"
import { useDeleteReference } from "@/hooks/useDeleteReference"
import { useReferenceFile } from "@/hooks/useReferenceFile"
import { toast } from "sonner"
import { useRef } from "react"

interface ReferenceTableProps {
  searchQuery: string
  selectedCollection: string | null
  viewMode: 'table' | 'grid'
  onOpenPDF: (file: File, title: string) => void
}

export function ReferenceTable({ 
  searchQuery, 
  selectedCollection, 
  viewMode, 
  onOpenPDF 
}: ReferenceTableProps) {
  const { 
    references, 
    isLoading, 
    error, 
    refetch,
    total 
  } = useReferences({
    collection: selectedCollection,
    search: searchQuery
  })

  const { deleteReference, isDeleting } = useDeleteReference()
  const { getFileUrl } = useReferenceFile()
  
  // Track ongoing operations to prevent double-clicks
  const openingRef = useRef<Set<string>>(new Set())

  // Helper function to safely format authors
  const formatAuthors = (authors: string[] | undefined | null): string => {
    if (!authors || !Array.isArray(authors) || authors.length === 0) {
      return "Unknown Author"
    }
    return authors.filter(Boolean).join(", ") || "Unknown Author"
  }

  // Helper function to safely format file size
  const formatFileSize = (fileSize: number | undefined | null): string => {
    if (!fileSize || fileSize <= 0) {
      return "Unknown"
    }
    return `${(fileSize / 1024 / 1024).toFixed(1)} MB`
  }

  const handleOpenReference = async (reference: any) => {
    const refId = reference.id || reference._id
    
    // Prevent double-click execution
    if (openingRef.current.has(refId)) {
      console.log('Already opening this reference, ignoring duplicate request')
      return
    }

    openingRef.current.add(refId)
    
    try {
      console.log('Opening reference:', reference.title)
      
      // Create a virtual File object from the API URL
      const response = await fetch(getFileUrl(refId))
      if (!response.ok) throw new Error('Failed to fetch PDF')
      
      const blob = await response.blob()
      const file = new File([blob], reference.fileName || `${reference.title}.pdf`, {
        type: 'application/pdf'
      })
      
      onOpenPDF(file, reference.title)
    } catch (err) {
      console.error('Failed to open PDF:', err)
      toast.error('Failed to open PDF file')
    } finally {
      // Remove from opening set after a delay to prevent rapid re-clicks
      setTimeout(() => {
        openingRef.current.delete(refId)
      }, 1000)
    }
  }

  const handleDeleteReference = async (reference: any) => {
    // Use the same ID handling as handleOpenReference
    const refId = reference.id || reference._id
    const title = reference.title || "this document"
    
    console.log('Delete reference data:', { refId, title, reference })
    
    if (!refId) {
      console.error('No valid ID found for reference:', reference)
      toast.error('Cannot delete reference: Invalid ID')
      return
    }

    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
      return
    }

    try {
      console.log('Deleting reference:', refId)
      await deleteReference(refId)
      toast.success('Reference deleted successfully')
      refetch()
    } catch (err) {
      console.error('Failed to delete reference:', err)
      toast.error('Failed to delete reference')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading references...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">Error loading references: {error.message}</div>
      </div>
    )
  }

  if (references.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">
            {searchQuery || selectedCollection 
              ? "No references found matching your criteria"
              : "No references yet. Add some papers to get started!"
            }
          </p>
        </div>
      </div>
    )
  }

  if (viewMode === 'grid') {
    return (
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
        {references.map((ref) => {
          const refId = ref.id || ref._id
          return (
            <div key={refId} className="border border-border rounded-lg p-4 hover:bg-muted/50 group">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-1" />
                <div className="flex-1 space-y-2">
                  <h4 className="font-medium text-sm line-clamp-2">{ref.title || "Untitled"}</h4>
                  <p className="text-xs text-muted-foreground">
                    {formatAuthors(ref.authors)}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {ref.year || "Unknown Year"}
                    </span>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenReference(ref)
                        }}
                        className="h-7 w-7 p-0"
                        disabled={openingRef.current.has(refId)}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleDeleteReference(ref)}
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
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="overflow-auto">
      <table className="w-full">
        <thead className="border-b border-border sticky top-0 bg-background">
          <tr className="bg-muted/30">
            <th className="text-left p-3 text-sm font-medium">Title</th>
            <th className="text-left p-3 text-sm font-medium">Authors</th>
            <th className="text-left p-3 text-sm font-medium">Year</th>
            <th className="text-left p-3 text-sm font-medium">Source</th>
            <th className="text-left p-3 text-sm font-medium">Size</th>
            <th className="w-16"></th>
          </tr>
        </thead>
        <tbody>
          {references.map((ref) => {
            const refId = ref.id || ref._id
            return (
              <tr 
                key={refId} 
                className="border-b border-border hover:bg-muted/30 cursor-pointer group"
                onClick={(e) => {
                  // Only handle click if it's not from a button/dropdown
                  if (e.target === e.currentTarget || 
                      (e.target as Element).closest('td:not(:last-child)')) {
                    handleOpenReference(ref)
                  }
                }}
              >
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {ref.title || "Untitled Document"}
                      </span>
                      {ref.doi && (
                        <span className="text-xs text-muted-foreground">DOI: {ref.doi}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {formatAuthors(ref.authors)}
                </td>
                <td className="p-3 text-sm">
                  {ref.year || "Unknown"}
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {ref.source || "Unknown Source"}
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {formatFileSize(ref.fileSize)}
                </td>
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleOpenReference(ref)}
                        disabled={openingRef.current.has(refId)}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteReference(ref)}
                        className="text-destructive"
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}