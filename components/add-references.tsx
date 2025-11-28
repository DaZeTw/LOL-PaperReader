"use client"

import { useState, useRef } from "react"
import { X, Upload, FileText, Plus, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { useCreateReference } from "@/hooks/useCreateReference"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface AddReferencesProps {
  onClose: () => void
  onReferencesAdded: () => void
}

export function AddReferences({ onClose, onReferencesAdded }: AddReferencesProps) {
  const [dragOver, setDragOver] = useState(false)
  const [manualData, setManualData] = useState({
    title: "",
    authors: "",
    year: "",
    source: "",
    doi: "",
    abstract: ""
  })
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bibInputRef = useRef<HTMLInputElement>(null)
  
  const { createReference, isCreating, error, reset } = useCreateReference()

  const handleFileUpload = async (files: FileList | File[]) => {
    console.log('Starting file upload for', files.length, 'files')
    const fileArray = Array.from(files)
    let successCount = 0
    let totalFiles = fileArray.length

    for (const file of fileArray) {
      try {
        console.log('Uploading file:', file.name)
        await createReference(file)
        console.log('Successfully uploaded:', file.name)
        successCount++
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err)
        toast.error(`Failed to upload ${file.name}`)
      }
    }

    console.log('Upload complete. Success count:', successCount, 'Total:', totalFiles)

    if (successCount > 0) {
      toast.success(`Successfully uploaded ${successCount} of ${totalFiles} files`)
      console.log('Calling onReferencesAdded...')
      onReferencesAdded()
      console.log('onReferencesAdded called')
    }

    if (successCount === totalFiles) {
      console.log('All files uploaded successfully, closing dialog')
      onClose()
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files)
    }
  }

  const handleBibImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // TODO: Process bibliography files
      console.log("Bibliography files:", e.target.files)
      toast.info("Bibliography import not yet implemented")
    }
  }

  const handleManualSubmit = async () => {
    if (!manualData.title.trim()) {
      toast.error("Title is required")
      return
    }

    try {
      // Create a dummy PDF file for manual entry
      // In a real app, you might want to handle this differently
      const dummyPdf = new File([""], "manual-entry.pdf", { type: "application/pdf" })
      
      const metadata = {
        title: manualData.title.trim(),
        authors: manualData.authors.split(',').map(a => a.trim()).filter(Boolean),
        year: manualData.year ? parseInt(manualData.year) : undefined,
        source: manualData.source.trim() || undefined,
        doi: manualData.doi.trim() || undefined,
        abstract: manualData.abstract.trim() || undefined,
      }

      // For manual entry, you might want a different endpoint
      // await createReference(dummyPdf, metadata)
      
      toast.info("Manual entry not fully implemented - requires file upload")
      // onReferencesAdded()
      // onClose()
    } catch (err) {
      console.error("Failed to create manual reference:", err)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setManualData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add References</DialogTitle>
        </DialogHeader>
        
        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />
        <input
          ref={bibInputRef}
          type="file"
          accept=".bib,.ris,.enw,.xml"
          onChange={handleBibImport}
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
        
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" disabled={isCreating}>Upload Files</TabsTrigger>
            <TabsTrigger value="import" disabled={isCreating}>Import</TabsTrigger>
            <TabsTrigger value="manual" disabled={isCreating}>Manual Entry</TabsTrigger>
          </TabsList>
          
          <TabsContent value="upload" className="space-y-4">
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
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                if (e.dataTransfer.files && !isCreating) {
                  handleFileUpload(e.dataTransfer.files)
                }
              }}
            >
              <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
              <div className="space-y-2">
                <p className="font-medium">
                  {isCreating ? "Uploading..." : "Drop PDF files here"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isCreating ? "Please wait while files are processed" : "or click to browse your computer"}
                </p>
              </div>
              {isCreating ? (
                <div className="space-y-2">
                  <Progress value={undefined} className="w-full" />
                  <p className="text-xs text-muted-foreground">Processing files...</p>
                </div>
              ) : (
                <Button 
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Choose Files
                </Button>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="import" className="space-y-4">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Import references from BibTeX, RIS, or EndNote files
              </p>
              <div className="grid gap-2">
                <Label>Supported formats:</Label>
                <ul className="text-xs text-muted-foreground space-y-1 pl-4">
                  <li>• BibTeX (.bib)</li>
                  <li>• RIS (.ris)</li>
                  <li>• EndNote (.enw)</li>
                  <li>• XML (.xml)</li>
                </ul>
              </div>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => bibInputRef.current?.click()}
                disabled={isCreating}
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Bibliography File
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="manual" className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title *</Label>
                <Input 
                  id="title" 
                  placeholder="Enter paper title..."
                  value={manualData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="authors">Authors</Label>
                <Input 
                  id="authors" 
                  placeholder="Enter authors (comma-separated)..."
                  value={manualData.authors}
                  onChange={(e) => handleInputChange('authors', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="year">Year</Label>
                  <Input 
                    id="year" 
                    type="number" 
                    placeholder="2024"
                    value={manualData.year}
                    onChange={(e) => handleInputChange('year', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="source">Source</Label>
                  <Input 
                    id="source" 
                    placeholder="Journal/Conference"
                    value={manualData.source}
                    onChange={(e) => handleInputChange('source', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="doi">DOI (optional)</Label>
                <Input 
                  id="doi" 
                  placeholder="10.1000/xyz123"
                  value={manualData.doi}
                  onChange={(e) => handleInputChange('doi', e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="abstract">Abstract (optional)</Label>
                <textarea 
                  id="abstract"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Enter abstract..."
                  value={manualData.abstract}
                  onChange={(e) => handleInputChange('abstract', e.target.value)}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button 
            onClick={handleManualSubmit}
            disabled={isCreating}
            className="min-w-[100px]"
          >
            {isCreating ? (
              <>Processing...</>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add References
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}