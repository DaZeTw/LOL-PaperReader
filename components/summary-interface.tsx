"use client"

import React from "react"
import { FileText, RefreshCw, Loader2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSummary, SummarySection } from "@/hooks/useSummary"

interface SummaryInterfaceProps {
  documentId: string
  tabId: string
  isOpen?: boolean
  onToggle?: () => void
  isActive?: boolean
  pipelineStatus?: {
    // Overall status
    isAllReady: boolean
    isProcessing: boolean
    overallProgress: number
    stage: string
    message: string
    
    // Task readiness (summary focused)
    isChatReady: boolean  // Keep for context
    isSummaryReady: boolean
    isSkimmingReady: boolean  // Keep for context
    
    // Task statuses
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
    
    // Helper functions
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

export function SummaryInterface({
  documentId,
  tabId,
  isOpen = true,
  onToggle,
  isActive = true,
  pipelineStatus,
}: SummaryInterfaceProps) {
  // Get summary readiness from pipeline status
  const isSummaryReady = pipelineStatus?.isSummaryReady ?? false
  const summaryStatus = pipelineStatus?.summaryStatus ?? 'pending'
  const overallProgress = pipelineStatus?.overallProgress ?? 0
  const hasErrors = pipelineStatus?.hasErrors ?? false
  const errors = pipelineStatus?.errors ?? []

  // Fetch summary data
  const {
    summary,
    isLoading,
    error,
    isInitialized,
    refetch,
  } = useSummary({
    documentId,
    tabId,
    isSummaryReady,
    autoFetch: true,
    fields: 'summary_final', // Only fetch summary_final field
  })

  // Show processing bar only when NOT ready
  const showProcessingBar = !isSummaryReady && summaryStatus !== 'error'

  // Get ordered section keys for consistent display
  const getSectionOrder = (sections: SummarySection): string[] => {
    const preferredOrder = [
      'Motivation',
      'Problem Statement',
      'Objective',
      'Approach',
      'Methods',
      'User Study',
      'Results',
      'Key Findings',
      'Conclusion',
      'Future Work',
      'Limitations',
    ]
    
    const keys = Object.keys(sections)
    const ordered: string[] = []
    
    // Add keys in preferred order first
    preferredOrder.forEach(key => {
      if (keys.includes(key)) {
        ordered.push(key)
      }
    })
    
    // Add remaining keys
    keys.forEach(key => {
      if (!ordered.includes(key)) {
        ordered.push(key)
      }
    })
    
    return ordered
  }

  return (
    <React.Fragment>
      {!isOpen && onToggle && (
        <button
          onClick={onToggle}
          className="absolute right-0 top-1/2 z-10 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-border bg-background shadow-md transition-colors hover:bg-muted"
          title="Open Summary"
        >
          <div className="flex flex-col items-center gap-1">
            <FileText className="h-4 w-4 text-primary" />
            <ChevronLeft className="h-3 w-3 text-muted-foreground" />
          </div>
        </button>
      )}
      <aside className={cn(
        "relative flex flex-col border-l border-border bg-sidebar transition-all duration-300 h-full",
        isOpen ? "w-96" : "w-0 overflow-hidden"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/5 to-accent/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-mono text-lg font-semibold text-foreground">
                Summary
               
              </h2>
              <p className="font-mono text-xs text-muted-foreground">
                {isSummaryReady 
                  ? summary?.summary_final 
                    ? `${Object.keys(summary.summary_final).length} sections`
                    : 'Summary available'
                  : summaryStatus === 'processing' 
                    ? 'Processing summary...' 
                    : 'Preparing summary...'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={refetch}
              disabled={isLoading || !isSummaryReady}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
            
          </div>
        </div>

        {/* Minimal Processing Progress Bar - ONLY show when NOT ready */}
        {showProcessingBar && (
          <div className="border-b border-border bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-2.5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-medium text-foreground truncate">
                    {summaryStatus === 'processing' 
                      ? 'Generating summary...' 
                      : 'Queued for processing'
                    }
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out"
                    style={{ 
                      width: `${Math.max(5, Math.min(100, overallProgress))}%` 
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Status Bar */}
        {hasErrors && errors.length > 0 && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-2">
            <div className="flex items-start gap-2">
              <span className="text-xs font-medium text-red-600">⚠️ Errors:</span>
              <div className="flex-1">
                {errors.map((error, idx) => (
                  <p key={idx} className="font-mono text-xs text-red-600">{error}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Content Section */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Loading State */}
            {isLoading && !summary && (
              <div className="flex h-full items-center justify-center p-6">
                <div className="space-y-4 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  <p className="font-mono text-sm text-muted-foreground">Loading summary...</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && !summary && (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md space-y-4 text-center">
                  <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
                  <h3 className="font-mono text-lg font-semibold text-foreground">Failed to Load Summary</h3>
                  <p className="font-mono text-sm text-muted-foreground">{error.message}</p>
                  <Button onClick={refetch} variant="outline" className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </Button>
                </div>
              </div>
            )}

            {/* Empty State - Not Ready */}
            {!isSummaryReady && !summary && !error && !isLoading && (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md space-y-4 text-center">
                  <div className="flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      <FileText className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                  <h3 className="font-mono text-lg font-semibold text-foreground">Processing...</h3>
                  <p className="font-mono text-sm text-muted-foreground">
                    Summary will be available once document processing completes
                  </p>
                </div>
              </div>
            )}

            {/* Empty State - Ready but No Data */}
            {isSummaryReady && !summary && isInitialized && !error && !isLoading && (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md space-y-4 text-center">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="font-mono text-lg font-semibold text-foreground">No Summary Available</h3>
                  <p className="font-mono text-sm text-muted-foreground">
                    Summary data not found for this document
                  </p>
                  <Button onClick={refetch} variant="outline" className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </div>
            )}

            {/* Summary Content - Always Expanded */}
            {summary?.summary_final && (
              <div className="space-y-3 p-6">
                {getSectionOrder(summary.summary_final).map((sectionKey) => {
                  const content = summary.summary_final[sectionKey]

                  return (
                    <div key={sectionKey} className="rounded-lg border border-border bg-card">
                      {/* Section Header - No Click Handler */}
                      <div className="border-b border-border bg-muted/30 px-4 py-3">
                        <h3 className="font-mono text-sm font-semibold text-foreground">
                          {sectionKey}
                        </h3>
                      </div>

                      {/* Section Content - Always Visible */}
                      <div className="p-4">
                        <p className="font-mono text-sm leading-relaxed text-foreground">
                          {content}
                        </p>
                      </div>
                    </div>
                  )
                })}

                
              </div>
            )}
          </div>
        </div>
      </aside>
    </React.Fragment>
  )
}