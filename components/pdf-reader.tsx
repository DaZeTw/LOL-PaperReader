"use client"

import type React from "react"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { FileText } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { PDFUpload } from "@/components/pdf-upload"
import { PDFViewer } from "@/components/pdf-viewer"
import { CitationPopup } from "@/components/citation-popup"
import { AnnotationToolbar } from "@/components/annotation-toolbar"
import { QAInterface } from "@/components/qa-interface"
import { Homepage } from "@/components/homepage"
import { TabBar, type TabItem } from "@/components/tab-bar"
import type { BookmarkItem } from "@/components/bookmark-panel"
import { useExtractCitations, type ExtractedCitation } from "@/hooks/useExtractCitations"
import { useToast } from "@/hooks/use-toast"
import { CitationProvider, useCitationContext } from "@/contexts/CitationContext"

interface NavigationTarget {
  page: number
  yPosition: number
}

export function PDFReader() {
  return (
    <CitationProvider>
      <PDFReaderContent />
    </CitationProvider>
  )
}

interface PDFTab {
  id: string
  file: File
  selectedSection: string | null
  bookmarks: BookmarkItem[]
  qaHistory: Array<{
    question: string
    answer: string
    timestamp: Date
  }>
  extractedCitations?: ExtractedCitation[]
  pdfId?: string
  parsedOutputs?: any
}

function PDFReaderContent() {
  const [tabsState, setTabsState] = useState<PDFTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  
  // Helper function to ensure tabs array is always unique by ID
  const ensureUniqueTabs = useCallback((tabsArray: PDFTab[]): PDFTab[] => {
    const seen = new Map<string, PDFTab>()
    for (const tab of tabsArray) {
      if (!seen.has(tab.id)) {
        seen.set(tab.id, tab)
      } else {
        console.warn("[PDF Reader] Duplicate tab ID detected:", tab.id, "- keeping first occurrence")
      }
    }
    return Array.from(seen.values())
  }, [])
  
  // Wrapper for setTabs to always ensure uniqueness
  const setTabs = useCallback(<T extends PDFTab[] | ((prev: PDFTab[]) => PDFTab[])>(
    updater: T
  ) => {
    setTabsState((prev: PDFTab[]) => {
      const newTabs = typeof updater === 'function' ? updater(prev) : updater
      return ensureUniqueTabs(newTabs as PDFTab[])
    })
  }, [ensureUniqueTabs])
  
  // Use tabsState but ensure it's always unique
  const tabs = useMemo(() => ensureUniqueTabs(tabsState), [tabsState, ensureUniqueTabs])
  
  // CRITICAL: Immediately cleanup any duplicates in tabsState
  // This ensures tabsState is always unique, preventing duplicate keys
  // Use ref to track previous state to avoid infinite loops
  const prevTabsStateRef = useRef<string>('')
  useEffect(() => {
    const tabsIds = tabsState.map((t: PDFTab) => t.id)
    const uniqueIds = new Set(tabsIds)
    const hasDuplicates = tabsIds.length !== uniqueIds.size
    
    if (hasDuplicates) {
      const unique = ensureUniqueTabs(tabsState)
      const uniqueIdsString = unique.map((t: PDFTab) => t.id).sort().join(',')
      // Only update if different from previous
      if (prevTabsStateRef.current !== uniqueIdsString) {
        console.warn("[PDF Reader] Cleaning up duplicate tabs in state:", tabsState.length, "->", unique.length)
        prevTabsStateRef.current = uniqueIdsString
        setTabsState(unique)
      }
    } else {
      const tabsIdsString = tabsIds.sort().join(',')
      prevTabsStateRef.current = tabsIdsString
    }
  }, [tabsState, ensureUniqueTabs])
  
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | undefined>(undefined)
  const [highlightColor, setHighlightColor] = useState("#fef08a")
  const [annotationMode, setAnnotationMode] = useState<"highlight" | "erase" | null>(null)
  const [qaOpen, setQaOpen] = useState(true)

  // Citation popup state
  const [popupCitation, setPopupCitation] = useState<any>(null)
  const [citationPopupOpen, setCitationPopupOpen] = useState(false)

  const citationContext = useCitationContext()

  // Citation extraction hook
  const { extractCitations } = useExtractCitations()
  const { toast } = useToast()

  // File input for quick uploads
  const fileInputRef = useRef<HTMLInputElement>(null)

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Track files being processed to prevent duplicate tabs
  const processingFilesRef = useRef<Set<string>>(new Set())
  // Track tabs by file key for synchronous duplicate checking
  const tabsByFileKeyRef = useRef<Map<string, string>>(new Map())

  // NOTE: Removed automatic clear-output on page load
  // This was causing issues when multiple PDFs are open - it would clear files
  // from other PDFs that are still in use. Clear output should only happen
  // when explicitly needed (e.g., when starting a fresh session or uploading new PDFs).

  // Deduplicate tabs by ID to prevent duplicate key errors
  // Use useMemo to avoid recalculating on every render
  // CRITICAL: Always ensure tabs are unique by ID
  const uniqueTabs = useMemo(() => {
    const seen = new Set<string>()
    return tabs.filter((tab: PDFTab) => {
      if (seen.has(tab.id)) {
        console.warn("[PDF Reader] Duplicate tab ID detected and removed:", tab.id)
        return false
      }
      seen.add(tab.id)
      return true
    })
  }, [tabs])

  const activeTab = uniqueTabs.find((tab: PDFTab) => tab.id === activeTabId)

  // Handle citation click from PDF viewer
  const handleCitationClick = (citation: any, event: MouseEvent) => {
    console.log("[PDFReader] Citation clicked:", citation)

    // Try to get extracted reference text for this citation
    if (activeTab && activeTab.extractedCitations) {
      const extractedCitation = activeTab.extractedCitations.find(
        (c: ExtractedCitation) => c.id === citation.id || citation.text.includes(c.id.replace("cite.", ""))
      )

      if (extractedCitation) {
        console.log("[PDFReader] Found extracted reference:", extractedCitation)
        // Merge extracted reference with citation data
        citation = {
          ...citation,
          extractedText: extractedCitation.text,
          extractionConfidence: extractedCitation.confidence,
          extractionMethod: extractedCitation.method,
        }
      }
    }

    setPopupCitation(citation)
    setCitationPopupOpen(true)
  }

  // Handle closing citation popup
  const handleCloseCitationPopup = () => {
    setCitationPopupOpen(false)
    setPopupCitation(null)
  }

  // Handle viewing reference from popup
  const handleViewReference = (citation: any) => {
    console.log("[PDFReader] View reference for:", citation)
    // Could implement navigation to reference section
  }

  // Handle copying citation text
  const handleCopyText = (text: string) => {
    console.log("[PDFReader] Copied text:", text)
  }

  // CRITICAL: Force re-mount QAInterface when file.name becomes available OR when tab changes
  // This ensures history is loaded when file is ready (similar to tab switch)
  // Also triggers when activeTabId changes (like when uploading new PDF or switching tabs)
  const [qaInterfaceKey, setQaInterfaceKey] = useState<string>('')

  // Function to update a tab's parsed data when API completes
  // Use fileKey to ensure we update the correct tab (not just by name)
  const handleParseComplete = useCallback((fileName: string, parsedData: any, fileSize?: number, fileLastModified?: number) => {
    console.log("[PDF Reader] Updating parsed data for:", fileName, parsedData)
    setTabs((prevTabs: PDFTab[]) => {
      // If we have fileSize and fileLastModified, use them to find exact match
      if (fileSize !== undefined && fileLastModified !== undefined) {
        return prevTabs.map((tab: PDFTab) => {
          if (tab.file.name === fileName && 
              tab.file.size === fileSize && 
              tab.file.lastModified === fileLastModified) {
            return {
              ...tab,
              pdfId: parsedData?.pdfId || tab.pdfId,
              parsedOutputs: parsedData?.backendResult?.results?.[0]?.outputs || parsedData?.outputs || tab.parsedOutputs,
            }
          }
          return tab
        })
      }
      // Fallback: update first matching tab by name only (less precise)
      let updated = false
      return prevTabs.map((tab: PDFTab) => {
        if (!updated && tab.file.name === fileName) {
          updated = true
          return {
            ...tab,
            pdfId: parsedData?.pdfId || tab.pdfId,
            parsedOutputs: parsedData?.backendResult?.results?.[0]?.outputs || parsedData?.outputs || tab.parsedOutputs,
          }
        }
        return tab
      })
    })
    
    // CRITICAL: After updating tab data, trigger QAInterface remount to load chat history
    // This ensures chat history is loaded after PDF upload completes
    // Use setTimeout to ensure state updates have propagated
    // Capture activeTabId in closure to avoid stale value
    const currentTabId = activeTabId
    setTimeout(() => {
      // Trigger QAInterface remount by updating qaInterfaceKey
      // This will cause QAInterface to remount and reload chat history from localStorage
      console.log("[PDF Reader] 🔄 Parse complete - Triggering QAInterface remount for:", fileName, "Tab:", currentTabId)
      setQaInterfaceKey((prev: string) => {
        // Force update by adding timestamp to ensure remount
        // This ensures QAInterface remounts and reloads history even if key looks the same
        const baseKey = currentTabId ? `${currentTabId}_${fileName}` : prev
        if (prev === baseKey) {
          return `${baseKey}_${Date.now()}`
        }
        return baseKey
      })
    }, 100)
  }, [activeTabId])

  const handleFileSelect = useCallback(async (file: File, parsedData?: any) => {
    console.log("[PDF Reader] Upload detected:", file.name, "parsed:", parsedData)

    // Create a unique key for this file to track processing
    const fileKey = `${file.name}_${file.size}_${file.lastModified}`
    
    // Check if we're already processing this file (race condition protection)
    if (processingFilesRef.current.has(fileKey)) {
      console.log("[PDF Reader] File already being processed, skipping duplicate:", fileKey)
      return
    }

    // FIRST: Check if a tab with this exact file already exists in current tabs array
    // Check synchronously in the current state
    const existingTab = tabs.find((tab: PDFTab) => 
      tab.file.name === file.name && 
      tab.file.size === file.size && 
      tab.file.lastModified === file.lastModified
    )
    
    if (existingTab) {
      // Tab exists - reuse it (use old key/ID) and preserve all existing data
      console.log("[PDF Reader] Tab already exists for this file, reusing existing tab:", existingTab.id)
      
      // Update ref to track this tab
      tabsByFileKeyRef.current.set(fileKey, existingTab.id)
      
      // Switch to existing tab
      setActiveTabId(existingTab.id)
      setShowUpload(false)
      
      // Update tab with new data, but preserve existing data if new data is missing
      if (parsedData) {
        setTabs((currentTabs: PDFTab[]) =>
          currentTabs.map((tab: PDFTab) => 
            tab.id === existingTab.id
              ? {
                  ...tab,
                  // Keep existing file (don't replace)
                  file: tab.file,
                  // Update parsed data only if new data is provided and old data is missing
                  pdfId: parsedData?.pdfId || tab.pdfId,
                  parsedOutputs: parsedData?.outputs || parsedData?.backendResult?.results?.[0]?.outputs || tab.parsedOutputs,
                }
              : tab
          )
        )
      }
      
      // Return early - don't create new tab
      return
    }

    // No existing tab found - create new one
    // Mark file as being processed BEFORE creating the tab
    processingFilesRef.current.add(fileKey)

    // Extract citations from the PDF in the background
    extractCitations(file).then((result: Awaited<ReturnType<typeof extractCitations>>) => {
      if (result) {
        console.log("[PDFReader] Extracted", result.totalCitations, "citations")
        const fileKeyForUpdate = `${file.name}_${file.size}_${file.lastModified}`
        let updatedTabId: string | null = null

        setTabs((prevTabs: PDFTab[]) => {
          let matchedId = tabsByFileKeyRef.current.get(fileKeyForUpdate) || null

          const updatedTabs = prevTabs.map((tab: PDFTab) => {
            const matchesExplicitId = matchedId ? tab.id === matchedId : false
            const matchesFileProps =
              !matchedId &&
              tab.file.name === file.name &&
              tab.file.size === file.size &&
              tab.file.lastModified === file.lastModified

            if (matchesExplicitId || matchesFileProps) {
              if (!matchedId) {
                matchedId = tab.id
              }
              return { ...tab, extractedCitations: result.citations }
            }

            return tab
          })

          updatedTabId = matchedId
          return updatedTabs
        })

        if (updatedTabId) {
          citationContext.setTabCitations(updatedTabId, result.citations)
        }
      }
    })
  
    try {
      // Create a new tab and store parsed info/pdfId (from Next API)
      // Use timestamp + random number + file hash + performance.now() + crypto.randomUUID() to ensure unique ID
      // Include file properties to make it more unique and prevent duplicates
      const fileHash = `${file.name}_${file.size}_${file.lastModified}`.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)
      // Use crypto.randomUUID() if available, otherwise fallback to enhanced random
      const uuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${performance.now()}_${Math.random().toString(36).substring(2, 15)}`
      const uniqueId = `tab_${uuid}_${fileHash}`
      
      const newTab: PDFTab = {
        id: uniqueId,
        file,
        selectedSection: null,
        bookmarks: [],
        qaHistory: [],
        pdfId: parsedData?.pdfId,
        parsedOutputs: parsedData?.outputs || parsedData?.backendResult?.results?.[0]?.outputs
      }
    
      setTabs((prev: PDFTab[]) => {
        // CRITICAL: First ensure prev is unique (remove any existing duplicates)
        const uniquePrev = ensureUniqueTabs(prev)
        
        // Check if a tab with this exact file already exists
        const existingTabByFile = uniquePrev.find(
          (tab: PDFTab) => 
            tab.file.name === file.name && 
            tab.file.size === file.size && 
            tab.file.lastModified === file.lastModified
        )
        
        if (existingTabByFile) {
          // Tab with same file already exists - reuse it instead of creating duplicate
          console.log("[PDF Reader] Tab with same file exists, reusing:", existingTabByFile.id)
          setActiveTabId(existingTabByFile.id)
          tabsByFileKeyRef.current.set(fileKey, existingTabByFile.id)
          processingFilesRef.current.delete(fileKey)
          
          // Update the existing tab with new parsed data if provided
          if (parsedData) {
            const updated = uniquePrev.map((tab: PDFTab) => 
              tab.id === existingTabByFile.id
                ? {
                    ...tab,
                    pdfId: parsedData?.pdfId || tab.pdfId,
                    parsedOutputs: parsedData?.outputs || parsedData?.backendResult?.results?.[0]?.outputs || tab.parsedOutputs,
                  }
                : tab
            )
            return ensureUniqueTabs(updated) // Ensure still unique after update
          }
          return uniquePrev
        }
        
        // Check if the new tab ID already exists (shouldn't happen, but safety check)
        const existingTabById = uniquePrev.find((tab: PDFTab) => tab.id === uniqueId)
        if (existingTabById) {
          console.log("[PDF Reader] Duplicate tab ID detected during add, using existing:", existingTabById.id)
          setActiveTabId(existingTabById.id)
          tabsByFileKeyRef.current.set(fileKey, existingTabById.id)
          processingFilesRef.current.delete(fileKey)
          return uniquePrev
        }
        
        // No duplicates found, add new tab and ensure result is unique
        const newTabs = [...uniquePrev, newTab]
        const finalTabs = ensureUniqueTabs(newTabs)
        console.log("[PDF Reader] Added new tab. Total tabs:", finalTabs.length, "New tab ID:", uniqueId)
        // Track this tab in the ref for synchronous duplicate checking
        tabsByFileKeyRef.current.set(fileKey, uniqueId)
        // Remove from processing set after successful add
        processingFilesRef.current.delete(fileKey)
        return finalTabs
      })
    
      setActiveTabId(newTab.id)
      setShowUpload(false)
      console.log("[PDF Reader] Active tab set to:", newTab.id)
      
    } catch (error) {
      console.error("[PDF Reader] Error processing PDF:", error)
      // Remove from processing set on error
      processingFilesRef.current.delete(fileKey)
    }
  }, [citationContext, ensureUniqueTabs, extractCitations, tabs])

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target
      const file = input.files?.[0]
      if (!file) return

      if (file.type !== "application/pdf") {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF file",
          variant: "destructive",
        })
        input.value = ""
        return
      }

      await handleFileSelect(file)

      const formData = new FormData()
      formData.append("file", file)

      fetch("/api/pdf/upload", {
        method: "POST",
        body: formData,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Upload failed")
          }

          const data = await response.json()
          console.log("[PDFReader] Parsed data received in background:", data)

          handleParseComplete(file.name, data, file.size, file.lastModified)

          toast({
            title: "PDF processed successfully",
            description: `${file.name} parsing completed`,
          })
        })
        .catch((error) => {
          console.error("[PDFReader] Upload error:", error)
          toast({
            title: "Processing failed",
            description: "PDF upload completed but parsing encountered an error",
            variant: "destructive",
          })
        })
        .finally(() => {
          input.value = ""
        })
    },
    [handleFileSelect, handleParseComplete, toast],
  )

  const handleShowUpload = useCallback(() => {
    setShowUpload(true)
    setActiveTabId(null)
  }, [])

  const handleNewButtonClick = useCallback(() => {
    setShowUpload(false)
    triggerFilePicker()
  }, [triggerFilePicker])

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    citationContext.cleanupTab(tabId)
    setTabs((prev: PDFTab[]) => {
      const tabToClose = prev.find((tab) => tab.id === tabId)
      if (tabToClose) {
        // Remove from ref tracking
        const fileKey = `${tabToClose.file.name}_${tabToClose.file.size}_${tabToClose.file.lastModified}`
        tabsByFileKeyRef.current.delete(fileKey)
      }
      const newTabs = prev.filter((tab) => tab.id !== tabId)
      if (activeTabId === tabId && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id)
        setShowUpload(false)
      } else if (newTabs.length === 0) {
        setActiveTabId(null)
        setShowUpload(false)
      }
      return newTabs
    })
  }

  // Updated to handle bookmark navigation from PDF viewer
  const handleSectionSelect = (bookmark: any) => {
    if (!activeTabId) return
    
    console.log("[PDF Reader] Navigating to bookmark:", bookmark.title, "dest:", bookmark.dest)
    
    // Update selected section in tab
    setTabs((prev: PDFTab[]) => prev.map((tab: PDFTab) => 
      tab.id === activeTabId 
        ? { ...tab, selectedSection: bookmark.title } 
        : tab
    ))
    
    // Set navigation target if bookmark has destination
    if (bookmark.dest) {
      setNavigationTarget({ 
        page: bookmark.dest.pageIndex + 1, // Convert 0-based to 1-based
        yPosition: 0 // PDF bookmarks typically jump to top of page
      })
    }
  }

  // Reset navigation when tab changes
  useEffect(() => {
    setNavigationTarget(undefined)
  }, [activeTabId])
  
  // CRITICAL: Update QAInterface key when activeTabId or file.name changes
  // This ensures QAInterface remounts and loads chat history when:
  // 1. Switching tabs (activeTabId changes)
  // 2. Uploading new PDF (activeTabId changes to new tab)
  // 3. File name becomes available after upload
  useEffect(() => {
    // Update key when activeTabId changes OR when file.name becomes available
    // This ensures QAInterface remounts and loads history when:
    // 1. Switching tabs (activeTabId changes)
    // 2. Uploading new PDF (activeTabId changes to new tab)
    // 3. File name becomes available after upload
    if (activeTab?.file?.name && activeTab?.id) {
      const newKey = `${activeTab.id}_${activeTab.file.name}`
      if (newKey !== qaInterfaceKey) {
        console.log("[PDF Reader] 🔄 Updating QAInterface key - Tab:", activeTab.id, "File:", activeTab.file.name, "New key:", newKey, "Old key:", qaInterfaceKey)
        setQaInterfaceKey(newKey)
      }
    }
  }, [activeTabId, activeTab?.file?.name, activeTab?.id, qaInterfaceKey])

  console.log("[PDF Reader] Render - tabs:", tabs.length, "activeTab:", activeTab?.file?.name, "activeTabId:", activeTabId, "activeTab.file exists:", !!activeTab?.file, "activeTab.file.name exists:", !!activeTab?.file?.name)
  
  // Debug: Log when QAInterface should be rendered
  if (activeTab) {
    console.log("[PDF Reader] 🎯 About to render QAInterface - PDF:", activeTab.file?.name, "Tab ID:", activeTab.id, "qaOpen:", qaOpen, "file ready:", !!(activeTab.file && activeTab.file.name))
  }

  // Note: setTabs wrapper already ensures uniqueness, so this useEffect is just for safety
  // and to update activeTabId if current tab was removed
  useEffect(() => {
    // Check if there are duplicates by comparing lengths and IDs
    const tabsIds = tabs.map((t: PDFTab) => t.id)
    const uniqueIds = new Set(tabsIds)
    const hasDuplicates = tabsIds.length !== uniqueIds.size
    
    if (hasDuplicates) {
      console.log("[PDF Reader] Duplicate tabs detected, cleaning up:", tabs.length - uniqueTabs.length)
      // setTabs wrapper will handle deduplication automatically
      // Just update activeTabId if current tab was removed
      if (activeTabId && !uniqueTabs.find((t: PDFTab) => t.id === activeTabId)) {
        setActiveTabId(uniqueTabs.length > 0 ? uniqueTabs[uniqueTabs.length - 1].id : null)
      }
    }
  }, [tabs.length, uniqueTabs.length, activeTabId, tabs, uniqueTabs])

  const tabItems: TabItem[] = useMemo(
    () =>
      uniqueTabs.map((tab: PDFTab) => ({
        id: tab.id,
        label: tab.file.name,
      })),
    [uniqueTabs],
  )

  return (
    <div className="flex h-screen flex-col bg-background">
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

      <TabBar
        tabs={tabItems}
        activeTabId={activeTabId}
        onTabClick={(tabId) => {
          setShowUpload(false)
          setActiveTabId(tabId)
        }}
        onTabClose={handleCloseTab}
        onNewTab={handleNewButtonClick}
        showNewButton={uniqueTabs.length > 0}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileInputChange}
        className="hidden"
      />

      <div className="flex flex-1 overflow-hidden">
        {uniqueTabs.length === 0 && !showUpload ? (
          <Homepage onGetStarted={handleShowUpload} />
        ) : showUpload || !activeTab ? (
          <PDFUpload onFileSelect={handleFileSelect} onParseComplete={handleParseComplete} />
        ) : (
          <>
            {/* Center - PDF Viewer with Annotation Toolbar */}
            <div key={activeTab.id} className="relative flex flex-1 flex-col">
              <PDFViewer
                tabId={activeTab.id}
                file={activeTab.file}
                selectedSection={activeTab.selectedSection}
                navigationTarget={navigationTarget}
                onSectionSelect={handleSectionSelect} // Pass the bookmark handler
                onCitationClick={handleCitationClick} // Pass citation click handler
                extractedCitations={activeTab.extractedCitations || []} // Pass extracted citations
              />

              <AnnotationToolbar
                highlightColor={highlightColor}
                onColorChange={setHighlightColor}
                annotationMode={annotationMode}
                onModeChange={setAnnotationMode}
              />
            </div>

            {/* Right Sidebar - Q&A Interface */}
            {/* CRITICAL: Always render QAInterface when activeTab exists, even if file.name is not ready yet */}
            {activeTab && (
              (() => {
                console.log("[PDF Reader] 🔍 Rendering QAInterface - activeTab.file:", !!activeTab.file, "activeTab.file.name:", activeTab.file?.name, "activeTab.id:", activeTab.id)
                // If file.name is not ready, create a dummy file object to prevent errors
                const fileToUse = activeTab.file?.name ? activeTab.file : new File([], "loading.pdf", { type: "application/pdf" })
                // Use qaInterfaceKey to force remount when file.name becomes available
                const componentKey = qaInterfaceKey || `${activeTab.id}_${activeTab.file?.name || 'loading'}`
                console.log("[PDF Reader] 🔑 QAInterface key:", componentKey, "qaInterfaceKey:", qaInterfaceKey, "file.name:", activeTab.file?.name)
                return (
                  <div key={componentKey} className="flex flex-col">
                    <QAInterface
                      pdfFile={fileToUse}
                      tabId={activeTab.id} // Pass tab ID for unique localStorage keys
                      onHighlight={() => {}}
                      isOpen={qaOpen}
                      onToggle={() => setQaOpen(!qaOpen)}
                      onNewMessage={(question, answer) => {
                        if (!activeTabId) return
                        setTabs((prev: PDFTab[]) =>
                          prev.map((tab: PDFTab) =>
                            tab.id === activeTabId
                              ? {
                                  ...tab,
                                  qaHistory: [
                                    ...tab.qaHistory,
                                    { question, answer, timestamp: new Date() },
                                  ],
                                }
                              : tab
                          )
                        )
                      }}
                    />
                  </div>
                )
              })()
            )}

            {/* Citation Popup with metadata fetching */}
            <CitationPopup
              citation={popupCitation}
              isOpen={citationPopupOpen}
              onClose={handleCloseCitationPopup}
              onViewReference={handleViewReference}
              onCopyText={handleCopyText}
            />

          </>
        )}
      </div>
    </div>
  )
} 