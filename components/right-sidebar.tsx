"use client"

import { useState } from "react"
import { ChevronRight, MessageSquare, BookmarkIcon, Sparkles, FileText, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { QAInterface } from "@/components/qa-interface"
import { SummaryInterface } from "@/components/summary-interface"
import { HighlightNotesSidebar } from "@/components/highlight-notes-sidebar"
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"

interface RightSidebarProps {
  // Props for QA
  tabId: string
  pdfFile: File
  documentId: string
  onCitationClick: (page: number, text?: string) => void
  totalPages: number
  
  // Props for Highlights/Skimming
  highlights: SkimmingHighlight[]
  highlightsLoading: boolean
  highlightsProcessing: boolean
  visibleCategories: Set<string>
  onHighlightClick: (highlight: SkimmingHighlight) => void
  hiddenHighlightIds: Set<number>
  onHighlightToggle: (highlightId: number) => void
  activeHighlightIds: Set<number>
  
  // Skimming controls
  skimmingEnabled: boolean
  selectedPreset: "light" | "medium" | "heavy"
  onPresetChange: (preset: "light" | "medium" | "heavy") => void
  onEnableSkimming: () => Promise<void>
  
  // Sidebar control
  isOpen: boolean
  onToggle: () => void
  className?: string
  pipelineStatus?: {
    isAllReady: boolean
    isProcessing: boolean
    overallProgress: number
    isChatReady: boolean
    isSummaryReady: boolean
    isReferencesReady: boolean
    availableFeatures: string[]
    embeddingStatus: string
    summaryStatus: string
    referenceStatus: string
    chunkCount: number
    referenceCount: number
    message: string
    stage: string
    hasErrors: boolean
    errors: string[]
    getTaskMessage: (task: 'embedding' | 'summary' | 'reference') => string
    getCompletedTasks: () => string[]
    getProcessingTasks: () => string[]
    isFeatureAvailable: (feature: 'chat' | 'summary' | 'references') => boolean
  }
}

export function RightSidebar({
  tabId,
  pdfFile,
  documentId,
  onCitationClick,
  totalPages,
  highlights,
  highlightsLoading,
  highlightsProcessing,
  visibleCategories,
  onHighlightClick,
  hiddenHighlightIds,
  onHighlightToggle,
  activeHighlightIds,
  skimmingEnabled,
  selectedPreset,
  onPresetChange,
  onEnableSkimming,
  isOpen,
  onToggle,
  className,
  pipelineStatus,
}: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState("qa")

  // Define tabs with status indicators
  const tabs = [
    {
      id: "qa",
      icon: MessageSquare,
      label: "Q&A",
      disabled: false,
      ready: pipelineStatus?.isChatReady,
    },
    {
      id: "highlights",
      icon: BookmarkIcon,
      label: "Highlights",
      disabled: false,
      ready: true,
    },
    {
      id: "summary",
      icon: Sparkles,
      label: "AI Summary",
      disabled: false,  // ✅ Changed from true
      ready: pipelineStatus?.isSummaryReady,
    },
    {
      id: "notes",
      icon: FileText,
      label: "Notes",
      disabled: true,
      ready: false,
    },
    {
      id: "settings",
      icon: Settings,
      label: "Settings",
      disabled: true,
      ready: false,
    },
  ]

  const activeTabData = tabs.find(tab => tab.id === activeTab)

  // Render tab content
  const renderContent = () => {
    switch (activeTab) {
      case "qa":
        return (
          <QAInterface
            tabId={tabId}
            pdfFile={pdfFile}
            documentId={documentId}
            onHighlight={() => {}}
            onCitationClick={onCitationClick}
            totalPages={totalPages}
            isOpen={true}
            onToggle={() => {}}
            isActive={activeTab === "qa"}
            pipelineStatus={pipelineStatus}
          />
        )
      
      case "highlights":
        return (
          <div className="flex flex-col h-full">
            {/* Skimming Control Panel */}
            {!skimmingEnabled && (
              <div className="border-b p-4 bg-muted/30">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Enable Skimming</span>
                  </div>
                  <select
                    value={selectedPreset}
                    onChange={(e) => onPresetChange(e.target.value as "light" | "medium" | "heavy")}
                    className="w-full px-3 py-2 text-sm border border-border rounded bg-background"
                  >
                    <option value="light">Light (30%)</option>
                    <option value="medium">Medium (50%)</option>
                    <option value="heavy">Heavy (70%)</option>
                  </select>
                  <Button
                    onClick={onEnableSkimming}
                    disabled={highlightsProcessing}
                    size="sm"
                    className="w-full gap-2"
                  >
                    {highlightsProcessing ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Enable Skimming
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Skimming Status */}
            {skimmingEnabled && highlights.length > 0 && (
              <div className="border-b p-3 bg-primary/10">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <span className="text-sm font-medium">
                    {highlights.length} highlights ({selectedPreset})
                  </span>
                </div>
              </div>
            )}

            {/* Highlights List */}
            <div className="flex-1 overflow-auto">
              {highlights.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  {highlightsLoading ? "Loading highlights..." : "Enable skimming to see highlights"}
                </div>
              ) : (
                <HighlightNotesSidebar
                  highlights={highlights}
                  visibleCategories={visibleCategories}
                  onHighlightClick={onHighlightClick}
                  isOpen={true}
                  onToggle={() => {}}
                  hiddenHighlightIds={hiddenHighlightIds}
                  onHighlightToggle={onHighlightToggle}
                  activeHighlightIds={activeHighlightIds}
                />
              )}
            </div>
          </div>
        )
      
      case "summary":
        return (
          <SummaryInterface
            documentId={documentId}
            tabId={tabId}
            isOpen={true}
            onToggle={() => {}}
            isActive={activeTab === "summary"}
            pipelineStatus={pipelineStatus}
          />
        )
      
      case "notes":
        return <div className="p-4 text-muted-foreground">Notes coming soon...</div>
      
      case "settings":
        return <div className="p-4 text-muted-foreground">Settings coming soon...</div>
      
      default:
        return null
    }
  }

  return (
    <>
      {/* Toggle Button - Vertical tab on the right edge */}
      {!isOpen && (
        <Button
          onClick={onToggle}
          variant="default"
          className="absolute right-0 top-1/2 -translate-y-1/2 h-24 w-8 rounded-r-none rounded-l-lg shadow-lg hover:shadow-xl transition-all z-20 flex flex-col items-center justify-center gap-2 py-2"
          title="Open sidebar"
        >
          <ChevronRight className="h-4 w-4" />
          <div className="writing-mode-vertical text-xs font-medium">
            Tools
          </div>
        </Button>
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "absolute right-0 top-0 h-full w-96 bg-background border-l shadow-2xl transition-transform duration-300 ease-in-out z-10",
          !isOpen && "translate-x-full",
          className
        )}
      >
        {/* Tab Icons & Close Button */}
        <div className="flex items-center justify-between border-b p-2 bg-muted/30">
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={cn(
                  "relative flex items-center justify-center h-9 w-9 rounded-md transition-colors",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                  tab.disabled && "opacity-50 cursor-not-allowed"
                )}
                title={tab.label}
              >
                <tab.icon className="h-4 w-4" />
                
              </button>
            ))}
          </div>
          
          {/* Close Button */}
          <Button
            onClick={onToggle}
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title="Close sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{activeTabData?.label}</h2>
            
          </div>
        </div>

        {/* Content */}
        <div className="h-[calc(100%-7.5rem)] overflow-hidden">
          {renderContent()}
        </div>
      </div>

      <style jsx>{`
        .writing-mode-vertical {
          writing-mode: vertical-rl;
          text-orientation: mixed;
        }
      `}</style>
    </>
  )
}