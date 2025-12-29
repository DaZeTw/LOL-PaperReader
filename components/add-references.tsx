"use client"

import { useState, useRef } from "react"
import { X, Upload, FileText, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { useCreateReference } from "@/hooks/useCreateReference"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useMetadataTracking } from "@/contexts/MetadataTrackingContext"

interface AddReferencesProps {
  onClose: () => void
  onReferencesAdded: () => void
}

export function AddReferences({ onClose, onReferencesAdded }: AddReferencesProps) {
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { createReference, isCreating, error, reset } = useCreateReference()
  const { trackDocument } = useMetadataTracking()

  const handleFileUpload = async (file: File) => {
    console.log('Starting file upload:', file.name)

    try {
      console.log('Uploading file:', file.name)
      const data = await createReference(file)
      console.log('Successfully uploaded:', file.name)
      console.log('AddReferences Data:', data)

      // Track the new document for metadata updates
      if (data && (data.id || (data as any)._id)) {
        const docId = data.id || (data as any)._id;
        console.log('Tracking document for metadata:', docId);
        trackDocument(docId);
      }

      toast.success(`Successfully uploaded ${file.name}`)
      console.log('Calling onReferencesAdded...')
      onReferencesAdded()
      console.log('onReferencesAdded called, closing dialog')
      onClose()
    } catch (err) {
      console.error(`Failed to upload ${file.name}:`, err)
      toast.error(`Failed to upload ${file.name}`)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0])
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && !isCreating) {
      handleFileUpload(e.dataTransfer.files[0])
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Reference</DialogTitle>
        </DialogHeader>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">{error.message}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="ml-auto h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center space-y-4 transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border",
            isCreating && "opacity-50 pointer-events-none"
          )}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
          <div className="space-y-2">
            <p className="font-medium">
              {isCreating ? "Uploading..." : "Drop PDF file here"}
            </p>
            <p className="text-sm text-muted-foreground">
              {isCreating ? "Please wait while the file is processed" : "or click to browse your computer"}
            </p>
          </div>
          {isCreating ? (
            <div className="space-y-2">
              <Progress value={undefined} className="w-full" />
              <p className="text-xs text-muted-foreground">Processing file...</p>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="h-4 w-4 mr-2" />
              Choose File
            </Button>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}