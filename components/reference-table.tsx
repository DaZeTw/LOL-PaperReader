"use client"

import { FileText, ExternalLink, MoreHorizontal, Trash2, FolderPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useReferenceFile } from "@/hooks/useReferenceFile"
import { toast } from "sonner"
import { useRef } from "react"
import { CollectionManager } from "@/components/collection-manager"

interface ReferenceTableProps {
  references: any[]
  isLoading: boolean
  error: Error | null
  viewMode: 'table' | 'grid'
  onOpenPDF: (file: File, title: string, documentId: string) => void
  onDeleteReference: (reference: any) => void
  isDeleting: boolean
  onCollectionChange?: () => void
  getCurrentCollectionReferences?: (referenceId: string) => string[]
}

export function ReferenceTable({
  references,
  isLoading,
  error,
  viewMode,
  onOpenPDF,
  onDeleteReference,
  isDeleting,
  onCollectionChange,
  getCurrentCollectionReferences
}: ReferenceTableProps) {
  const { fetchFileBlob } = useReferenceFile()

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

    if (!refId) {
      console.error('Failed to open reference: missing document id', reference)
      toast.error('Document is missing an identifier')
      return
    }

    // Prevent double-click execution
    if (openingRef.current.has(refId)) {
      console.log('Already opening this reference, ignoring duplicate request')
      return
    }

    openingRef.current.add(refId)

    try {
      console.log('Opening reference:', { title: reference.title, id: refId, status: reference.status })

      // Show loading toast
      const loadingToast = toast.loading('Opening PDF...')

      const fileName = reference.fileName || reference.original_filename || `${reference.title}.pdf`
      const { blob, mimeType } = await fetchFileBlob(refId)

      if (!blob || blob.size === 0) {
        throw new Error('Received empty file')
      }

      const file = new File([blob], fileName, {
        type: mimeType || 'application/pdf'
      })

      toast.dismiss(loadingToast)
      toast.success('PDF opened successfully')

      onOpenPDF(file, reference.title, refId)
    } catch (err: unknown) {
      console.error('Failed to open PDF:', err)
      const message = err instanceof Error ? err.message : 'Failed to open PDF file'

      // Provide more helpful error messages
      let userMessage = message
      if (message.includes('404') || message.includes('not found')) {
        userMessage = 'PDF file not found. It may still be uploading. Please wait a moment and try again.'
      } else if (message.includes('Failed to fetch') || message.includes('network')) {
        userMessage = 'Network error. Please check your connection and try again.'
      } else if (message.includes('502') || message.includes('storage')) {
        userMessage = 'Unable to access the PDF file. Please try again in a moment.'
      }

      toast.error(userMessage)
    } finally {
      // Remove from opening set after a delay to prevent rapid re-clicks
      setTimeout(() => {
        openingRef.current.delete(refId)
      }, 1000)
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
            No references found. Add some papers to get started!
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
          const currentCollections = refId && getCurrentCollectionReferences
            ? getCurrentCollectionReferences(refId)
            : []
          const canManageCollections = Boolean(refId && getCurrentCollectionReferences)

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
                      {canManageCollections && refId && (
                        <CollectionManager
                          referenceId={refId}
                          referenceTitle={ref.title || "Untitled"}
                          currentCollections={currentCollections}
                          onCollectionChange={onCollectionChange}
                          trigger={
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                            >
                              <FolderPlus className="h-3 w-3" />
                            </Button>
                          }
                        />
                      )}
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
                            onClick={() => onDeleteReference(ref)}
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
            const currentCollections = refId && getCurrentCollectionReferences
              ? getCurrentCollectionReferences(refId)
              : []
            const canManageCollections = Boolean(refId && getCurrentCollectionReferences)

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
                  <div className="flex items-center justify-end gap-1">
                    {canManageCollections && refId && (
                      <CollectionManager
                        referenceId={refId}
                        referenceTitle={ref.title || "Untitled Document"}
                        currentCollections={currentCollections}
                        onCollectionChange={onCollectionChange}
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                          >
                            <FolderPlus className="h-3 w-3" />
                          </Button>
                        }
                      />
                    )}
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
                          onClick={() => onDeleteReference(ref)}
                          className="text-destructive"
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}