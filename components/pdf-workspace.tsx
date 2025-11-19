"use client"

import { useState, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { FileText, Plus, X } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { PDFUpload } from "@/components/pdf-upload"
import { SinglePDFReader } from "@/components/pdf-reader"
import { LoginButton } from "@/components/login-button"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import type { UploadedDocument } from "@/components/pdf-upload"

interface PDFTab {
  id: string
  file: File
  title: string
}

// Generate stable IDs using a counter
let tabCounter = 0

export function PDFWorkspace() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [tabs, setTabs] = useState<PDFTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeTab = tabs.find((tab) => tab.id === activeTabId)

  const generateTabId = useCallback(() => {
    tabCounter += 1
    return `tab-${tabCounter}`
  }, [])

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!session?.user) {
        console.log("[PDF Workspace] Upload blocked - user not authenticated")
        toast({
          title: "Sign in required",
          description: "Please sign in to open PDFs in the workspace.",
          variant: "destructive",
        })
        return
      }

      console.log("[PDF Workspace] Upload detected:", file.name)

      const newTab: PDFTab = {
        id: generateTabId(),
        file,
        title: file.name,
      }

      setTabs((prev) => {
        if (!activeTabId) {
          return [...prev, newTab]
        }
        const activeIndex = prev.findIndex((tab) => tab.id === activeTabId)
        if (activeIndex === -1) {
          return [...prev, newTab]
        }
        const nextTabs = [...prev]
        nextTabs.splice(activeIndex + 1, 0, newTab)
        return nextTabs
      })
      setActiveTabId(newTab.id)
      setShowUpload(false)

      console.log("[PDF Workspace] Created new tab:", newTab.id)
    },
    [activeTabId, generateTabId, session?.user, toast],
  )

  const handleOpenExistingDocument = useCallback(
    async (document: UploadedDocument) => {
      if (!session?.user) {
        throw new Error("Please sign in to open PDFs from your history.")
      }

      try {
        const url = document.fileUrl ?? document.downloadUrl
        if (!url) {
          throw new Error("Document URL unavailable.")
        }
        const response = await fetch(url, { cache: "no-store" })
        if (!response.ok) {
          throw new Error("Unable to download the selected document.")
        }
        const blob = await response.blob()
        const file = new File([blob], document.original_filename, { type: "application/pdf" })

        await handleFileSelect(file)

        toast({
          title: "PDF opened",
          description: `${document.original_filename} opened in a new tab.`,
        })
      } catch (error) {
        console.error("[PDF Workspace] Failed to open historical document:", error)
        throw error instanceof Error ? error : new Error("Failed to open document.")
      }
    },
    [handleFileSelect, session?.user, toast],
  )

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
          setShowUpload(true)
        }
      }
      
      return newTabs
    })
  }

  const handleNewTab = () => {
    // Only allow new tab if user is authenticated
    if (!session?.user) {
      return
    }
    setShowUpload(true)
    setActiveTabId(null)
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
          {session?.user ? (
            <UserMenu user={session.user} />
          ) : (
            <LoginButton />
          )}
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
        {/* Upload Screen - shown when no active tab or when user clicks new */}
        {(showUpload || tabs.length === 0) && session?.user && (
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
              onOpenDocument={handleOpenExistingDocument}
            />
          </div>
        ))}
      </div>
    </div>
  )
}