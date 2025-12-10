"use client"
import { useAuth } from "@/hooks/useAuth"
import { useState, useCallback } from "react"
import type { MouseEvent } from "react"
import { FileText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { LibraryView } from "@/components/library-view"
import { SinglePDFReader } from "@/components/pdf-reader"

interface PDFTab {
  id: string
  file: File
  title: string
  fileName: string
  documentId: string
  sidebarOpen?: boolean  // Add sidebar state per tab
}

// Generate stable IDs using a counter
let tabCounter = 0

interface WorkspaceManagerProps {
  className?: string
  currentView: 'library' | 'pdf'
  onViewChange: (view: 'library' | 'pdf') => void
}

export function WorkspaceManager({ 
  className, 
  currentView, 
  onViewChange 
}: WorkspaceManagerProps) {
  const { user, login } = useAuth()
  const [openTabs, setOpenTabs] = useState<PDFTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const generateTabId = useCallback(() => {
    tabCounter += 1
    return `tab-${tabCounter}`
  }, [])

  // Enhanced function to find existing tab
  const findExistingTab = useCallback((file: File, title: string, documentId: string) => {
    return openTabs.find((tab: PDFTab) => {
      if (tab.documentId === documentId) return true
      // Multiple ways to match:
      // 1. Exact title match
      if (tab.title === title) return true
      
      // 2. File name match (in case title is different)
      if (tab.fileName === file.name) return true
      
      // 3. File size and name match (more precise)
      if (tab.file.name === file.name && tab.file.size === file.size) return true
      
      return false
    })
  }, [openTabs])

  const handleOpenPDF = useCallback((file: File, title: string, documentId: string) => {
    // Check authentication before allowing PDF open
    if (!user) {
      console.log("[Workspace Manager] PDF open blocked - user not authenticated")
      login()
      return
    }

    console.log("[Workspace Manager] Opening PDF:", { title, fileName: file.name, fileSize: file.size })
    
    // Enhanced duplicate detection
    const existingTab = findExistingTab(file, title, documentId)
    if (existingTab) {
      console.log("[Workspace Manager] Found existing tab, switching to:", existingTab.id)
      setActiveTabId(existingTab.id)
      onViewChange('pdf')
      return
    }
    
    const newTab: PDFTab = {
      id: generateTabId(),
      file,
      title,
      fileName: file.name,
      documentId,
      sidebarOpen: false  // Initialize sidebar state
    }
    
    setOpenTabs((prev: PDFTab[]) => [...prev, newTab])
    setActiveTabId(newTab.id)
    onViewChange('pdf')
    
    console.log("[Workspace Manager] Created new tab:", newTab.id, "for file:", file.name)
  }, [user, findExistingTab, generateTabId, onViewChange, login])

  const handleCloseTab = useCallback((tabId: string, e?: MouseEvent) => {
    e?.stopPropagation()
    
    console.log("[Workspace Manager] Closing tab:", tabId)
    
    setOpenTabs((prev: PDFTab[]) => {
      const newTabs = prev.filter((tab) => tab.id !== tabId)
      
      // Handle active tab switching
      if (activeTabId === tabId) {
        if (newTabs.length > 0) {
          // Switch to the last tab
          const nextActiveTab = newTabs[newTabs.length - 1]
          setActiveTabId(nextActiveTab.id)
          onViewChange('pdf')
          console.log("[Workspace Manager] Switched to tab:", nextActiveTab.id)
        } else {
          // No tabs left, go back to library
          setActiveTabId(null)
          onViewChange('library')
          console.log("[Workspace Manager] No tabs left, returning to library")
        }
      }
      
      return newTabs
    })
  }, [activeTabId, onViewChange])

  const handleSwitchTab = useCallback((tabId: string) => {
    console.log("[Workspace Manager] Switching to tab:", tabId)
    setActiveTabId(tabId)
    onViewChange('pdf')
  }, [onViewChange])

  // Handle sidebar toggle for any tab
  const handleSidebarToggle = useCallback((tabId: string, isOpen: boolean) => {
    console.log("[Workspace Manager] Toggling sidebar for tab:", tabId, "to:", isOpen)
    setOpenTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, sidebarOpen: isOpen } : tab
      )
    )
  }, [])

  const activeTab = openTabs.find((tab: PDFTab) => tab.id === activeTabId)
  const showTabBar = openTabs.length > 0

  // When view changes to library from outside, clear active tab
  if (currentView === 'library' && activeTabId) {
    setActiveTabId(null)
  }

  // Debug logging
  console.log("[Workspace Manager] State:", {
    openTabsCount: openTabs.length,
    activeTabId,
    currentView,
    tabTitles: openTabs.map((tab: PDFTab) => tab.title),
    sidebarStates: openTabs.map((tab: PDFTab) => ({ id: tab.id, sidebarOpen: tab.sidebarOpen }))
  })

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Tab Bar - Only shown when PDF tabs are open */}
      {showTabBar && (
        <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1">
          <div className="flex flex-1 items-center gap-1 overflow-x-auto">
            {openTabs.map((tab: PDFTab) => (
              <div
                key={tab.id}
                onClick={() => handleSwitchTab(tab.id)}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer",
                  activeTabId === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title={`${tab.title} (${tab.fileName})`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[150px] truncate font-mono text-xs">
                  {tab.title}
                </span>
                <button
                  onClick={(e: MouseEvent<HTMLButtonElement>) => handleCloseTab(tab.id, e)}
                  className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/20 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {/* Library View - Always mounted, shown/hidden with CSS */}
        <div 
          className={cn(
            "absolute inset-0 z-10",
            currentView === 'library' ? "block" : "hidden"
          )}
        >
          <LibraryView onOpenPDF={handleOpenPDF} />
        </div>
        
        {/* PDF Readers - All tabs always mounted, shown/hidden with CSS */}
        {openTabs.map((tab: PDFTab) => (
          <div
            key={tab.id}
            className={cn(
              "absolute inset-0 z-10",
              currentView === 'pdf' && activeTabId === tab.id ? "block" : "hidden"
            )}
          >
            <SinglePDFReader 
              file={tab.file}
              documentId={tab.documentId}
              tabId={tab.id}
              isActive={activeTabId === tab.id}
              sidebarOpen={tab.sidebarOpen ?? false}
              onSidebarToggle={(isOpen) => handleSidebarToggle(tab.id, isOpen)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}