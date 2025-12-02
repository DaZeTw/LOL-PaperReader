"use client"

import React, { useState, useRef, useEffect } from "react"
import { Send, Loader2, Sparkles, History, Trash2, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useQASession } from "@/hooks/useQASession"
import { useQAMessages } from "@/hooks/useQAMessages"
import { usePipelineStatus } from "@/hooks/usePipelineStatus"
import { useQAActions } from "@/hooks/useQAActions"

interface QAInterfaceProps {
  pdfFile: File
  tabId?: string
  onHighlight?: (text: string | null) => void
  isOpen?: boolean
  onToggle?: () => void
  isActive?: boolean
}

export function QAInterface({ pdfFile, tabId, onHighlight, isOpen = true, onToggle, isActive = true }: QAInterfaceProps) {
  const [question, setQuestion] = useState("")
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Custom hooks
  const { sessionId, isInitializing, clearSession } = useQASession({ pdfFile, tabId })
  const { messages, showHistory, setShowHistory, addMessage, clearMessages, loadMessages } = useQAMessages({ 
    pdfFile, 
    tabId, 
    sessionId 
  })
  const { isPipelineReady, pipelineStatus } = usePipelineStatus({ pdfFile, tabId })
  const { isLoading, askQuestion, clearThinkingState } = useQAActions({ 
    sessionId, 
    pdfFile, 
    tabId, 
    isPipelineReady, 
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
    clearThinkingState() // Clear thinking state when chat is cleared
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
      // Use a small delay to avoid race conditions
      const timeoutId = setTimeout(() => {
        loadMessages().catch((err: any) => {
          console.warn(`[QAInterface:${tabId}] Failed to reload messages when tab became active:`, err)
        })
      }, 100)
      
      return () => clearTimeout(timeoutId)
    }
  }, [isActive, sessionId, isInitializing, tabId, loadMessages])

  const shouldShowHistory = messages.length > 0

  return (
    <>
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
              <h2 className="font-mono text-lg font-semibold text-foreground">Ask Questions</h2>
              <p className="font-mono text-xs text-muted-foreground">Get instant answers from your document</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className="gap-2 text-xs"
                >
                  <History className="h-4 w-4" />
                  History ({messages.length})
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClearHistory} className="gap-2 text-xs">
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              </>
            )}
            {onToggle && (
              <button onClick={onToggle} className="rounded p-1.5 transition-colors hover:bg-muted">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Compact Processing Status Bar */}
        {isPipelineReady === false && (
          <div className="border-b border-border bg-primary/5 px-6 py-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium text-foreground">
                    Preparing documents...
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {typeof pipelineStatus.percent === 'number' ? `${pipelineStatus.percent}%` : ''}
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div 
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(10, Math.min(99, Number(pipelineStatus.percent ?? 10)))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* History Section */}
          {shouldShowHistory && (
            <div ref={scrollAreaRef} className="flex-1 min-h-0 overflow-y-auto border-b border-border">
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
            </div>
          )}

          {/* Input Section */}
          <div className="p-6">
            {/* Suggested Questions */}
            {messages.length === 0 && (
              <div className="mb-4">
                <p className="mb-2 font-mono text-xs font-medium text-muted-foreground">Try asking:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuestion(q)}
                      className="rounded-full border border-border bg-muted/50 px-3 py-1.5 font-mono text-xs text-foreground transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Field */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    isInitializing 
                      ? "Initializing chat..." 
                      : isPipelineReady === false
                      ? "Preparing documents, please wait..."
                      : "Ask anything about this document..."
                  }
                  disabled={!isActive || isLoading || isInitializing || !sessionId || isPipelineReady === false}
                  className="h-12 resize-none border-2 font-mono text-sm shadow-sm focus:border-primary"
                />
              </div>
              <Button
                onClick={handleAskQuestion}
                disabled={!isActive || isLoading || !question.trim() || isInitializing || !sessionId || isPipelineReady === false}
                size="lg"
                className="h-12 gap-2 px-6 shadow-sm"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Thinking...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Ask</span>
                  </>
                )}
              </Button>
            </div>

            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">Enter</kbd> to send
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
