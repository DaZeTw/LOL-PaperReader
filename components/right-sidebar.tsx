"use client"

import { useState, useCallback } from "react"
import { ChevronRight, MessageSquare, BookmarkIcon, Sparkles, FileText, Settings, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { QAInterface } from "@/components/qa-interface"
import { SummaryInterface } from "@/components/summary-interface"
import { SkimmingInterface } from "@/components/skimming-interface"
import { KeywordPanel } from "@/components/keyword-panel"
import { KeywordPopup } from "@/components/keyword-popup"
import { useTaxonomyAPI } from "@/hooks/useTaxonomyAPI"
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"
import type { ExtractedKeyword } from "@/lib/keyword-extractor"
import type { ConceptData, RelatedConcept } from "@/hooks/useTaxonomyAPI"

interface RightSidebarProps {
  // Props for QA
  tabId: string
  pdfFile: File
  documentId: string
  onCitationClick: (page: number, text?: string) => void
  totalPages: number
  
  // Props for Keywords
  pdfUrl?: string
  
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
  onEnableSkimming: () => Promise<void>
  onDisableSkimming?: () => void
  
  // Sidebar control
  isOpen: boolean
  onToggle: () => void
  className?: string
  
  // Pipeline status (3 tasks: chat, summary, skimming)
  pipelineStatus?: {
    // Overall status
    isAllReady: boolean
    isProcessing: boolean
    overallProgress: number
    stage: string
    message: string
    
    // Independent task readiness (3 tasks)
    isChatReady: boolean
    isSummaryReady: boolean
    isSkimmingReady: boolean
    
    // Task statuses (3 tasks)
    embeddingStatus: string
    summaryStatus: string
    skimmingStatus: string
    
    // Available features
    availableFeatures: string[]
    
    // Metadata
    chunkCount: number
    
    // Error tracking
    hasErrors: boolean
    errors: string[]
    
    // Helper functions (3 tasks)
    getTaskMessage: (task: 'embedding' | 'summary' | 'skimming') => string
    getCompletedTasks: () => string[]
    getProcessingTasks: () => string[]
    isFeatureAvailable: (feature: 'chat' | 'summary' | 'skimming') => boolean
    
    // Timestamps
    embeddingUpdatedAt?: string
    summaryUpdatedAt?: string
    skimmingUpdatedAt?: string
  }
}

export function RightSidebar({
  tabId,
  pdfFile,
  documentId,
  onCitationClick,
  totalPages,
  pdfUrl,
  highlights,
  highlightsLoading,
  highlightsProcessing,
  visibleCategories,
  onHighlightClick,
  hiddenHighlightIds,
  onHighlightToggle,
  activeHighlightIds,
  skimmingEnabled,
  onEnableSkimming,
  onDisableSkimming,
  isOpen,
  onToggle,
  className,
  pipelineStatus,
}: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState("qa")
  
  // Keyword popup state
  const [popupOpen, setPopupOpen] = useState(false)
  const [selectedKeyword, setSelectedKeyword] = useState<ExtractedKeyword | null>(null)
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 })
  const [popupConcept, setPopupConcept] = useState<ConceptData | null>(null)
  const [popupSiblings, setPopupSiblings] = useState<RelatedConcept[]>([])
  const [popupDescendants, setPopupDescendants] = useState<RelatedConcept[]>([])
  
  // Taxonomy API hook
  const { fetchKeywordData, fetchConceptById, loading: taxonomyLoading, error: taxonomyError } = useTaxonomyAPI()

  // Handle keyword click from KeywordPanel
  const handleKeywordClick = useCallback(async (keyword: ExtractedKeyword, event: React.MouseEvent) => {
    // Calculate popup position based on click location
    const rect = (event.target as HTMLElement).getBoundingClientRect()
    const popupWidth = 420
    const popupHeight = 500
    
    // Position popup to the left of the sidebar if there's not enough space
    let left = rect.left - popupWidth - 10
    if (left < 10) {
      left = rect.right + 10
    }
    
    // Ensure popup doesn't go off screen vertically
    let top = rect.top
    if (top + popupHeight > window.innerHeight) {
      top = window.innerHeight - popupHeight - 20
    }
    if (top < 10) {
      top = 10
    }
    
    setPopupPosition({ top, left })
    setSelectedKeyword(keyword)
    setPopupOpen(true)
    
    // Fetch taxonomy data for the keyword
    const data = await fetchKeywordData(keyword.keyword)
    setPopupConcept(data.concept)
    setPopupSiblings(data.siblings)
    setPopupDescendants(data.descendants)
  }, [fetchKeywordData])

  // Handle node click in the knowledge graph
  const handleNodeClick = useCallback(async (nodeId: string, nodeName: string) => {
    // Fetch data for the clicked concept
    const data = await fetchConceptById(nodeId)
    if (data.concept) {
      setSelectedKeyword({
        keyword: data.concept.name,
        count: selectedKeyword?.count || 0,
        category: data.concept.category || 'Other'
      })
      setPopupConcept(data.concept)
      setPopupSiblings(data.siblings)
      setPopupDescendants(data.descendants)
    }
  }, [fetchConceptById, selectedKeyword?.count])

  // Handle popup close
  const handlePopupClose = useCallback(() => {
    setPopupOpen(false)
    setSelectedKeyword(null)
    setPopupConcept(null)
    setPopupSiblings([])
    setPopupDescendants([])
  }, [])

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
      ready: pipelineStatus?.isSkimmingReady || skimmingEnabled,
    },
    {
      id: "keywords",
      icon: Tag,
      label: "Keywords",
      disabled: false,
      ready: true,
    },
    {
      id: "summary",
      icon: Sparkles,
      label: "AI Summary",
      disabled: false,
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
          <SkimmingInterface
            highlights={highlights}
            highlightsLoading={highlightsLoading}
            highlightsProcessing={highlightsProcessing}
            visibleCategories={visibleCategories}
            onHighlightClick={onHighlightClick}
            hiddenHighlightIds={hiddenHighlightIds}
            onHighlightToggle={onHighlightToggle}
            activeHighlightIds={activeHighlightIds}
            skimmingEnabled={skimmingEnabled}
            onEnableSkimming={onEnableSkimming}
            onDisableSkimming={onDisableSkimming}
            pipelineStatus={pipelineStatus}
          />
        )
      
      case "keywords":
        return (
          <KeywordPanel
            pdfUrl={pdfUrl || ''}
            documentId={documentId}
            onKeywordClick={handleKeywordClick}
          />
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
                {/* Ready indicator - small green dot */}
                {tab.ready && !tab.disabled && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 ring-1 ring-background" />
                )}
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

      {/* Keyword Popup Portal */}
      <KeywordPopup
        isOpen={popupOpen}
        keyword={selectedKeyword?.keyword || ''}
        context={selectedKeyword ? `Appears ${selectedKeyword.count} time${selectedKeyword.count !== 1 ? 's' : ''} in this document` : ''}
        concept={popupConcept}
        siblings={popupSiblings}
        descendants={popupDescendants}
        loading={taxonomyLoading}
        error={taxonomyError}
        onClose={handlePopupClose}
        onNodeClick={handleNodeClick}
        position={popupPosition}
      />
    </>
  )
}