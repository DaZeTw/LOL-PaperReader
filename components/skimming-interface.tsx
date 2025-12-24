"use client"

import React from "react"
import { Sparkles, AlertCircle, Loader2, Power } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HighlightNotesSidebar } from "@/components/highlight-notes-sidebar"
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"

interface SkimmingInterfaceProps {
  // Highlights data
  highlights: SkimmingHighlight[]
  highlightsLoading: boolean
  highlightsProcessing: boolean
  
  // Highlight interactions
  visibleCategories: Set<string>
  onHighlightClick: (highlight: SkimmingHighlight) => void
  hiddenHighlightIds: Set<number>
  onHighlightToggle: (highlightId: number) => void
  activeHighlightIds: Set<number>
  
  // Skimming controls
  skimmingEnabled: boolean
  onEnableSkimming: () => Promise<void>
  onDisableSkimming?: () => void  // Optional callback to turn off
  
  // Pipeline status
  pipelineStatus?: {
    isChatReady: boolean
    isSkimmingReady: boolean
    skimmingStatus: string
    embeddingStatus: string
    hasErrors: boolean
    errors: string[]
  }
}

export function SkimmingInterface({
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
  pipelineStatus,
}: SkimmingInterfaceProps) {
  
  // Skimming is independent - only needs PDF file, not embeddings
  const canEnableSkimming = true // Always available, independent of embeddings
  const isProcessingSkimming = highlightsProcessing || pipelineStatus?.skimmingStatus === 'processing'
  
  // Determine what message to show
  const getStatusMessage = () => {
    if (isProcessingSkimming) {
      return "Generating highlights..."
    }
    return null
  }
  
  const statusMessage = getStatusMessage()
  
  // Handle toggle
  const handleToggle = async () => {
    if (skimmingEnabled) {
      // Turn off skimming
      if (onDisableSkimming) {
        onDisableSkimming()
      }
    } else {
      // Turn on skimming (uses default 50% preset)
      await onEnableSkimming()
    }
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Skimming Control Panel - Always visible */}
      <div className="border-b p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30">
        <div className="space-y-3">
          {/* Header with status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Smart Skimming</span>
            </div>
            {/* Status badges */}
            <div className="flex items-center gap-2">
              {canEnableSkimming && !isProcessingSkimming && !skimmingEnabled && (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">✅ Ready</span>
              )}
              {skimmingEnabled && !isProcessingSkimming && (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                  <Power className="h-3 w-3" />
                  Active
                </span>
              )}
            </div>
          </div>

          {/* Info text */}
          <p className="text-xs text-muted-foreground">
            Automatically highlight the most important sentences in your paper (50% density)
          </p>

          {/* Toggle Button */}
          <Button
            onClick={handleToggle}
            disabled={isProcessingSkimming || (!skimmingEnabled && !canEnableSkimming)}
            size="sm"
            variant={skimmingEnabled ? "destructive" : "default"}
            className="w-full gap-2"
            title={!canEnableSkimming && !skimmingEnabled ? statusMessage || "" : ""}
          >
            {isProcessingSkimming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Highlights...
              </>
            ) : skimmingEnabled ? (
              <>
                <Power className="h-4 w-4" />
                Turn Off Skimming
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Turn On Skimming
              </>
            )}
          </Button>

          {/* Status message - Only show when not enabled */}
          {statusMessage && !skimmingEnabled && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
              <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5 animate-spin" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">
                  {statusMessage}
                </p>
                {pipelineStatus?.skimmingStatus && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Status: <span className="font-medium capitalize">{pipelineStatus.skimmingStatus}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Highlight count - Show when enabled */}
          {skimmingEnabled && highlights.length > 0 && (
            <div className="flex items-center justify-center gap-2 p-2 rounded-md bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                {highlights.length} highlights active
              </span>
            </div>
          )}

          {/* Error messages */}
          {pipelineStatus?.hasErrors && pipelineStatus.errors.length > 0 && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-red-600 dark:text-red-400">Processing Errors:</p>
                {pipelineStatus.errors.map((error, idx) => (
                  <p key={idx} className="text-xs text-red-600 dark:text-red-400 mt-0.5">{error}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Highlights List */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {highlights.length === 0 ? (
          <div className="flex items-center justify-center h-full p-6">
            <div className="max-w-sm space-y-4 text-center">
              {highlightsLoading ? (
                <>
                  <div className="flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">Loading highlights...</p>
                </>
              ) : skimmingEnabled ? (
                <>
                  <div className="flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                      <AlertCircle className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">No Highlights Found</h3>
                    <p className="text-sm text-muted-foreground">
                      This document may not have enough processable text for highlighting
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      <Sparkles className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Smart Skimming</h3>
                    <p className="text-sm text-muted-foreground">
                      Turn on skimming to automatically highlight important sentences
                    </p>
                    <p className="text-xs text-muted-foreground italic">
                      Uses AI to identify key points at 50% density
                    </p>
                  </div>
                </>
              )}
            </div>
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
}