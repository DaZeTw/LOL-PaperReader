"use client"

import { useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { FileText, X, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LibraryView } from "@/components/library-view"
import { SinglePDFReader } from "@/components/pdf-reader"

interface PDFTab {
  id: string
  file: File
  title: string
}

// Generate stable IDs using a counter
let tabCounter = 0

interface WorkspaceManagerProps {
  className?: string
}

export function WorkspaceManager({ className }: WorkspaceManagerProps) {
  const { data: session } = useSession()
  const [openTabs, setOpenTabs] = useState<PDFTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const generateTabId = useCallback(() => {
    tabCounter += 1
    return `tab-${tabCounter}`
  }, [])

  const handleOpenPDF = useCallback((file: File, title: string) => {
    // Check authentication before allowing PDF open
    if (!session?.user) {
      console.log("[Workspace Manager] PDF open blocked - user not authenticated")
      return
    }

    console.log("[Workspace Manager] Opening PDF:", title)
    
    // Check if PDF is already open
    const existingTab = openTabs.find(tab => tab.title === title)
    if (existingTab) {
      setActiveTabId(existingTab.id)
      return
    }
    
    const newTab: PDFTab = {
      id: generateTabId(),
      file,
      title
    }
    
    setOpenTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
    
    console.log("[Workspace Manager] Created new tab:", newTab.id)
  }, [session?.user, openTabs, generateTabId])

  const handleCloseTab = useCallback((tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    
    setOpenTabs((prev) => {
      const newTabs = prev.filter((tab) => tab.id !== tabId)
      
      // Handle active tab switching
      if (activeTabId === tabId) {
        if (newTabs.length > 0) {
          // Switch to the last tab
          setActiveTabId(newTabs[newTabs.length - 1].id)
        } else {
          // No tabs left, clear active tab (will show library)
          setActiveTabId(null)
        }
      }
      
      return newTabs
    })
  }, [activeTabId])

  const handleSwitchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
  }, [])

  const handleBackToLibrary = useCallback(() => {
    setActiveTabId(null)
  }, [])

  const activeTab = openTabs.find((tab) => tab.id === activeTabId)
  const showTabBar = openTabs.length > 0
  const showLibrary = !activeTabId

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Tab Bar - Only shown when at least one PDF tab is open */}
      {showTabBar && (
        <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1">
          {/* Back to Library Button */}
          <Button
            variant={showLibrary ? 'secondary' : 'ghost'}
            size="sm"
            onClick={handleBackToLibrary}
            className="h-7 gap-1.5 px-2 text-xs mr-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Library
          </Button>
          
          {/* PDF Tabs */}
          <div className="flex flex-1 items-center gap-1 overflow-x-auto">
            {openTabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => handleSwitchTab(tab.id)}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer",
                  activeTabId === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[150px] truncate font-mono text-xs">
                  {tab.title}
                </span>
                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/20 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {/* Library View - Show when no active tab */}
        {showLibrary && (
          <div className="absolute inset-0">
            <LibraryView onOpenPDF={handleOpenPDF} />
          </div>
        )}
        
        {/* PDF Readers - Show active tab */}
        {activeTab && (
          <div className="absolute inset-0">
            <SinglePDFReader 
              file={activeTab.file}
              tabId={activeTab.id}
              isActive={true}
            />
          </div>
        )}
      </div>
    </div>
  )
}