"use client"

import { useState } from "react"
import { X, Upload, FileText, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface AddReferencesProps {
  onClose: () => void
  onReferencesAdded: () => void
}

export function AddReferences({ onClose, onReferencesAdded }: AddReferencesProps) {
  const [dragOver, setDragOver] = useState(false)

  const handleFileUpload = (files: FileList | File[]) => {
    // TODO: Process uploaded files
    console.log("Files uploaded:", files)
    onReferencesAdded()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add References</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">Upload Files</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          </TabsList>
          
          <TabsContent value="upload" className="space-y-4">
            <div 
              className="border-2 border-dashed border-border rounded-lg p-8 text-center space-y-4"
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                if (e.dataTransfer.files) {
                  handleFileUpload(e.dataTransfer.files)
                }
              }}
            >
              <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
              <div className="space-y-2">
                <p className="font-medium">Drop PDF files here</p>
                <p className="text-sm text-muted-foreground">
                  or click to browse your computer
                </p>
              </div>
              <Button variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                Choose Files
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="import" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import references from BibTeX, RIS, or EndNote files
            </p>
            <Button variant="outline" className="w-full">
              Import Bibliography File
            </Button>
          </TabsContent>
          
          <TabsContent value="manual" className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" placeholder="Enter paper title..." />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="authors">Authors</Label>
                <Input id="authors" placeholder="Enter authors..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="year">Year</Label>
                  <Input id="year" placeholder="2024" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="source">Source</Label>
                  <Input id="source" placeholder="Journal/Conference" />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onReferencesAdded}>Add References</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}