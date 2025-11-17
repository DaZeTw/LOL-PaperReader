"use client"

import { useState, useRef } from "react"
import { FileText, Plus, X } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { PDFUpload } from "@/components/pdf-upload"
import { Homepage } from "@/components/homepage"
import { SinglePDFReader } from "@/components/pdf-reader"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PDFTab {
  id: string
  file: File
  title: string
}

export function PDFWorkspace() {
  const [tabs, setTabs] = useState<PDFTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeTab = tabs.find((tab) => tab.id === activeTabId)

  const handleGetStarted = () => {
    // Show upload screen when clicking from homepage
    setShowUpload(true)
  }

  const handleFileSelect = async (file: File) => {
    console.log("[PDF Workspace] Upload detected:", file.name)
    
    const newTab: PDFTab = {
      id: Date.now().toString(),
      file,
      title: file.name
    }
    
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
    setShowUpload(false)
    
    console.log("[PDF Workspace] Created new tab:", newTab.id)
  }

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    setTabs((prev) => {
      const newTabs = prev.filter((tab) => tab.id !== tabId)
      
      // Handle active tab switching
      if (activeTabId === tabId) {
        if (newTabs.length > 0) {
          setActiveTabId(newTabs[newTabs.length - 1].id)
        } else {
          setActiveTabId(null)
          setShowUpload(false)
        }
      }
      
      return newTabs
    })
  }

  const handleNewTab = () => {
    // Trigger file picker directly without showing upload screen
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  console.log("[PDF Workspace] Render - tabs:", tabs.length, "activeTab:", activeTab?.title)

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Hidden file input for direct file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <FileText className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="font-mono text-lg font-medium text-foreground">Scholar Reader</h1>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      {/* Tab Bar */}
      {tabs.length > 0 && (
        <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1">
          <div className="flex flex-1 items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => {
                  setActiveTabId(tab.id)
                  setShowUpload(false)
                }}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer",
                  activeTabId === tab.id && !showUpload
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[150px] truncate font-mono text-xs">{tab.title}</span>
                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/20 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleNewTab}
            className={cn(
              "h-7 gap-1.5 px-2 text-xs",
              showUpload && "bg-background text-foreground shadow-sm"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Homepage - shown when no tabs and not showing upload */}
        {tabs.length === 0 && !showUpload && (
          <div className="absolute inset-0 z-10">
            <Homepage onGetStarted={handleGetStarted} />
          </div>
        )}
        
        {/* Upload Screen - for drag & drop */}
        {showUpload && (
          <div className="absolute inset-0 z-10">
            <PDFUpload onFileSelect={handleFileSelect} />
          </div>
        )}
        
        {/* PDF Readers - All rendered but only active one visible */}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "absolute inset-0 transition-opacity duration-200",
              activeTabId === tab.id && !showUpload
                ? "opacity-100 z-20 pointer-events-auto"
                : "opacity-0 z-0 pointer-events-none"
            )}
          >
            <SinglePDFReader 
              file={tab.file}
              tabId={tab.id}
              isActive={activeTabId === tab.id && !showUpload}
            />
          </div>
        ))}
      </div>
    </div>
  )
}