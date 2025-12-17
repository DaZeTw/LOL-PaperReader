"use client"

import React, { useState, useRef, useEffect } from "react"
import { Send, Loader2, Sparkles, History, Trash2, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useQASession } from "@/hooks/useQASession"
import { useQAMessages } from "@/hooks/useQAMessages"
import { useQAActions } from "@/hooks/useQAActions"

interface QAInterfaceProps {
  pdfFile: File
  documentId: string
  tabId: string
  onHighlight?: (text: string | null) => void
  onCitationClick?: (page: number, text?: string) => void
  totalPages?: number
  isOpen?: boolean
  onToggle?: () => void
  isActive?: boolean
  pipelineStatus?: {
    isAllReady: boolean
    isProcessing: boolean
    isChatReady: boolean
    isSummaryReady: boolean
    isReferencesReady: boolean
    availableFeatures: string[]
    embeddingStatus: string
    summaryStatus: string
    referenceStatus: string
    chunkCount: number
    message: string
    stage: string
    overallProgress: number
    hasErrors: boolean
    errors: string[]
    getTaskMessage: (task: 'embedding' | 'summary' | 'reference') => string
  }
}

export function QAInterface({
  pdfFile,
  documentId,
  tabId,
  onHighlight,
  onCitationClick: _onCitationClick,
  totalPages: _totalPages,
  isOpen = true,
  onToggle,
  isActive = true,
  pipelineStatus,
}: QAInterfaceProps) {
  const [question, setQuestion] = useState("")
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Get chat readiness from parent's pipeline status
  const isChatReady = pipelineStatus?.isChatReady ?? false
  const embeddingStatus = pipelineStatus?.embeddingStatus ?? 'pending'
  const chunkCount = pipelineStatus?.chunkCount ?? 0
  const processingMessage = pipelineStatus?.message ?? 'Preparing documents...'
  const overallProgress = pipelineStatus?.overallProgress ?? 0
  const hasErrors = pipelineStatus?.hasErrors ?? false
  const errors = pipelineStatus?.errors ?? []

  // Custom hooks - tab-specific state management
  const { sessionId, isInitializing, clearSession } = useQASession({ 
    pdfFile, 
    documentId, 
    tabId 
  })
  
  const { 
    messages, 
    showHistory, 
    setShowHistory, 
    addMessage, 
    clearMessages, 
    loadMessages 
  } = useQAMessages({ 
    pdfFile, 
    tabId, 
    sessionId 
  })
  
  const { 
    isLoading, 
    askQuestion, 
    clearThinkingState 
  } = useQAActions({ 
    sessionId, 
    pdfFile, 
    documentId,
    tabId, 
    isPipelineReady: isChatReady,
    addMessage,
    reloadMessages: loadMessages,
    createNewSession: async () => (await clearSession()) || ""
  })

  const suggestedQuestions = [
    "What is the main finding?",
    "Who are the authors?",
    "What methodology was used?",
    "What are the key conclusions?",
  ]

  const handleAskQuestion = async () => {
    if (!question.trim()) return
    
    const currentQuestion = question
    setQuestion("")
    await askQuestion(currentQuestion)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleAskQuestion()
    }
  }

  const handleClearHistory = async () => {
    clearMessages()
    clearThinkingState()
    await clearSession()
    toast({
      title: "History cleared",
      description: "All Q&A history has been cleared. Starting new session.",
    })
  }

  // Auto-scroll to bottom when new message is added
  useEffect(() => {
    if (showHistory && messages.length > 0 && scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages, showHistory])

  // Reload messages when tab becomes active to sync with backend
  useEffect(() => {
    if (isActive && sessionId && !isInitializing) {
      console.log(`[QAInterface:${tabId}] Tab became active, reloading messages to sync with backend`)
      const timeoutId = setTimeout(() => {
        loadMessages().catch((err: any) => {
          console.warn(`[QAInterface:${tabId}] Failed to reload messages when tab became active:`, err)
        })
      }, 100)
      
      return () => clearTimeout(timeoutId)
    }
  }, [isActive, sessionId, isInitializing, tabId, loadMessages])

  // Log chat readiness changes with detailed status - FIXED dependencies
  useEffect(() => {
    console.log(`[QAInterface:${tabId}] Pipeline Status Update:`, {
      isChatReady,
      embeddingStatus,
      chunkCount,
      overallProgress,
      availableFeatures: pipelineStatus?.availableFeatures,
      raw: pipelineStatus
    })
  }, [isChatReady, embeddingStatus, chunkCount, overallProgress, pipelineStatus, tabId])

  const shouldShowHistory = messages.length > 0

  // Determine if chat is disabled
  const isChatDisabled = !isActive || isLoading || isInitializing || !sessionId || !isChatReady

  // Get status message based on current state
  const getStatusMessage = () => {
    if (!isActive) return "Tab inactive"
    if (isInitializing) return "Initializing chat..."
    if (!sessionId) return "Creating session..."
    if (!isChatReady) {
      if (embeddingStatus === 'processing') {
        return `Processing embeddings...`
      }
      if (embeddingStatus === 'error') {
        return "Error processing embeddings"
      }
      return processingMessage
    }
    return "Ask anything about this document..."
  }

  // Show processing bar only when NOT ready
  const showProcessingBar = !isChatReady && embeddingStatus !== 'error'

  return (
    <React.Fragment>
      {!isOpen && onToggle && (
        <button
          onClick={onToggle}
          className="absolute right-0 top-1/2 z-10 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-border bg-background shadow-md transition-colors hover:bg-muted"
          title="Open Q&A"
        >
          <div className="flex flex-col items-center gap-1">
            <Sparkles className="h-4 w-4 text-primary" />
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
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-mono text-lg font-semibold text-foreground">
                Ask Questions
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <React.Fragment>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className="gap-2 text-xs"
                >
                  <History className="h-4 w-4" />
                  {showHistory ? 'Hide' : 'Show'} ({messages.length})
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleClearHistory} 
                  className="gap-2 text-xs"
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              </React.Fragment>
            )}
           
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
                    {embeddingStatus === 'processing' 
                      ? `Processing` 
                      : 'Queued for processing'
                    }
                  </span>
                  <span className="font-mono text-xs font-semibold text-blue-600 flex-shrink-0">
                    {overallProgress}%
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
          {/* History Section */}
          <div ref={scrollAreaRef} className="flex-1 min-h-0 overflow-y-auto">
            {shouldShowHistory ? (
              <div className="space-y-4 p-6">
                {messages.map((message, index) => (
                  <div key={message.id} className="space-y-2">
                    {/* Question */}
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                        Q
                      </div>
                      <div className="flex-1">
                        <p className="font-mono text-sm font-medium text-foreground">{message.question}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    {/* Answer */}
                    <div className="ml-9 rounded-lg border border-border bg-muted/30 p-4">
                      <div 
                        className="font-mono text-sm leading-relaxed text-foreground"
                        dangerouslySetInnerHTML={{ 
                          __html: message.answer
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
                            .replace(/`([^`]+?)`/g, '<code>$1</code>')
                            .replace(/\n/g, '<br />')
                        }}
                      />

                      {/* Citations */}
                      {message.cited_sections && message.cited_sections.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="font-mono text-xs font-medium text-muted-foreground">References:</p>
                          <div className="space-y-2">
                            {message.cited_sections.map((section, idx) => (
                              <div key={idx} className="rounded-md border border-accent/30 bg-accent/5 p-2.5 text-xs">
                                <div className="mb-1 flex items-start gap-2">
                                  <span className="font-mono font-medium text-primary">
                                    {section.citation_label || `c${idx + 1}`}:
                                  </span>
                                  <div className="flex-1">
                                    <span className="font-mono text-foreground">
                                      {section.summary || section.excerpt || "..."}
                                    </span>
                                    {section.title && (
                                      <div className="mt-1 flex items-center gap-2">
                                        <span className="font-mono text-xs text-muted-foreground">
                                          {section.title}
                                          {section.page !== undefined && ` (p. ${section.page})`}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {index < messages.length - 1 && <div className="my-4 border-t border-border" />}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md space-y-4 text-center">
                  <div className="flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      <Sparkles className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                  
                  
                  {/* Suggested Questions - Only when ready */}
                  {isChatReady && (
                    <div className="space-y-2">
                      <p className="font-mono text-xs font-medium text-muted-foreground">Try asking:</p>
                      <div className="flex flex-col gap-2">
                        {suggestedQuestions.map((q) => (
                          <button
                            key={q}
                            onClick={() => setQuestion(q)}
                            className="rounded-lg border border-border bg-muted/50 px-4 py-2 font-mono text-sm text-foreground transition-colors hover:border-primary hover:bg-primary/5"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Input Section - Fixed at Bottom */}
          <div className="border-t border-border bg-background p-6">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={getStatusMessage()}
                  disabled={isChatDisabled}
                  className="h-12 resize-none border-2 font-mono text-sm shadow-sm focus:border-primary disabled:opacity-60"
                />
              </div>
              <Button
                onClick={handleAskQuestion}
                disabled={isChatDisabled || !question.trim()}
                size="lg"
                className="h-12 gap-2 px-6 shadow-sm"
              >
                {isLoading ? (
                  <React.Fragment>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Thinking...</span>
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    <Send className="h-4 w-4" />
                    <span>Ask</span>
                  </React.Fragment>
                )}
              </Button>
            </div>

            {/* Removed the waiting message at bottom */}
            {isChatReady && (
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">Enter</kbd> to send
              </p>
            )}
          </div>
        </div>
      </aside>
    </React.Fragment>
  )
}