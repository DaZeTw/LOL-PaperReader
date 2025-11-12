"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Send, Loader2, X, Sparkles, History, Trash2, MessageSquarePlus, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { usePipelineStatus } from "@/hooks/usePipelineStatus"
import { safeLocalStorage } from "@/lib/localStorage"
import { formatMessageAnswer } from "@/lib/formatMessageAnswer"

interface QAInterfaceProps {
  tabId: string // Tab ID for session isolation
  pdfFile: File
  onHighlight?: (text: string | null) => void
  onClose?: () => void
  onNewMessage?: (question: string, answer: string) => void
  isOpen?: boolean
  onToggle?: () => void
}

interface CitedSection {
  doc_id?: string
  title?: string
  page?: number
  excerpt?: string
}

interface QAMessage {
  id: string
  question: string
  answer: string
  context?: string
  cited_sections?: CitedSection[]
  confidence?: number
  timestamp: Date
}

export function QAInterface({ tabId, pdfFile, onHighlight, onClose, onNewMessage, isOpen = true, onToggle }: QAInterfaceProps) {
  const [question, setQuestion] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const { toast } = useToast()
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Use custom hook for pipeline status polling
  const { isPipelineReady, status: pipelineStatus } = usePipelineStatus()

  // Storage keys now include tabId for complete session isolation
  // This prevents different tabs (even with same file) from sharing sessions
  const storageKey = `chat_session_${tabId}_${pdfFile.name}`
  const messagesStorageKey = `chat_messages_${tabId}_${pdfFile.name}`

  const suggestedQuestions = [
    "What is the main finding?",
    "Who are the authors?",
    "What methodology was used?",
    "What are the key conclusions?",
  ]

  // Initialize session on mount
  useEffect(() => {
    const initializeSession = async () => {
      try {
        // FIRST: Load messages from localStorage immediately (instant restore)
        const savedMessages = safeLocalStorage.getJSON<any[]>(messagesStorageKey)
        if (savedMessages && savedMessages.length > 0) {
          // Restore Date objects from ISO strings
          const restoredMessages = savedMessages.map((msg: any) => ({
            ...msg,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          }))
          setMessages(restoredMessages)
          setShowHistory(true)
          console.log("[Chat] Loaded", restoredMessages.length, "messages from localStorage (pre-backend)")
        } else {
          console.log("[Chat] No messages in localStorage - starting fresh")
        }

        // THEN: Check if we have a saved session_id in localStorage
        const savedSessionId = safeLocalStorage.getItem(storageKey)
        
        if (savedSessionId) {
          // Set session ID immediately so user can chat while we verify
          setSessionId(savedSessionId)
          
          // Verify session still exists and sync with backend
          try {
            const sessionResponse = await fetch(`/api/chat/sessions?session_id=${savedSessionId}`)
            if (sessionResponse.ok) {
              const sessionData = await sessionResponse.json()
              console.log("[Chat] ✅ Verified existing session:", savedSessionId)
              
              // Load chat history from backend and merge with localStorage
              if (sessionData.messages && sessionData.messages.length > 0) {
                const historyMessages: QAMessage[] = []
                let currentQ: { question: string; timestamp: Date } | null = null
                
                for (const msg of sessionData.messages) {
                  if (msg.role === "user") {
                    currentQ = { question: msg.content, timestamp: new Date(msg.timestamp) }
                  } else if (msg.role === "assistant" && currentQ) {
                    historyMessages.push({
                      id: msg.timestamp || Date.now().toString(),
                      question: currentQ.question,
                      answer: msg.content,
                      cited_sections: msg.metadata?.cited_sections,
                      confidence: msg.metadata?.confidence,
                      timestamp: currentQ.timestamp,
                    })
                    currentQ = null
                  }
                }
                
                // Update with backend messages (backend is source of truth)
                if (historyMessages.length > 0) {
                  setMessages(historyMessages)
                  setShowHistory(true)

                  // Save to localStorage for next time (convert Date to ISO string)
                  const messagesToSave = historyMessages.map((msg) => ({
                    ...msg,
                    timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
                  }))
                  safeLocalStorage.setJSON(messagesStorageKey, messagesToSave)
                  console.log("[Chat] Synced", historyMessages.length, "messages from backend")
                }
              }
            } else if (sessionResponse.status === 404) {
              // Session not found in DB, but we have it in localStorage
              // This might mean DB was reset or session expired
              console.log("[Chat] ⚠️ Session not found in database (404), will create new one")
              // Clear localStorage to avoid confusion
              safeLocalStorage.removeItem(storageKey)
              safeLocalStorage.removeItem(messagesStorageKey)
              await createNewSession()
            } else {
              // Other error (500, 503, etc.) - don't create new session yet
              // Just log and keep using localStorage session ID
              console.warn("[Chat] ⚠️ Failed to verify session:", sessionResponse.status, "Keeping localStorage session ID")
              // Don't throw error, just use what we have
            }
          } catch (error: any) {
            // Network error or other exception
            console.warn("[Chat] ⚠️ Error verifying session:", error.message || error)
            // Don't create new session on network errors - keep existing one
            // Only create if we don't have a saved session at all
            if (!savedSessionId) {
              console.log("[Chat] No saved session, creating new one")
              await createNewSession()
            } else {
              console.log("[Chat] Keeping existing session ID from localStorage despite verification error")
            }
          }
        } else {
          // No saved session, create new one
          await createNewSession()
        }
      } catch (error: any) {
        console.error("[Chat] Failed to initialize session:", error)
        const errorMessage = error?.message || "Unknown error"
        
        toast({
          title: "Session initialization failed",
          description: errorMessage.includes("timeout") || errorMessage.includes("504") || errorMessage.includes("503")
            ? "Backend connection timeout. Please check if MongoDB is running."
            : errorMessage.length > 100 
            ? errorMessage.substring(0, 100) + "..."
            : errorMessage || "Chat may not work properly. Please refresh the page.",
          variant: "destructive",
          duration: 10000, // Show longer for important errors
        })
      } finally {
        setIsInitializing(false)
      }
    }

    const createNewSession = async () => {
      try {
        const response = await fetch("/api/chat/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: null, // Use null for anonymous sessions
            title: `Chat: ${tabId}_${pdfFile.name}`, // Include tabId for session isolation
            initial_message: null,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = errorData.details || errorData.error || `HTTP ${response.status}: Failed to create session`
          
          // Special handling for timeout errors
          if (response.status === 504 || response.status === 503) {
            throw new Error(`Connection timeout: ${errorMessage}. Please check if MongoDB is running and backend is accessible.`)
          }
          
          throw new Error(errorMessage)
        }

        const sessionData = await response.json()
        const newSessionId = sessionData.session_id

        // Save session_id to localStorage
        safeLocalStorage.setItem(storageKey, newSessionId)
        setSessionId(newSessionId)
        console.log("[Chat] Created new session:", newSessionId)
      } catch (error: any) {
        console.error("[Chat] Failed to create session:", error)
        throw error
      }
    }

    initializeSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, pdfFile.name]) // Re-initialize when tab changes

  const handleAskQuestion = async () => {
    // Block asking if pipeline is not ready
    if (isPipelineReady === false) {
      toast({
        title: "Preparing documents…",
        description: "We're still processing and indexing your PDF. Please wait a moment.",
      })
      return
    }
    // Ensure we have a session ID before asking
    let currentSessionId = sessionId
    
    console.log("[Chat] handleAskQuestion called")
    console.log("[Chat] Current sessionId from state:", sessionId)
    console.log("[Chat] Checking localStorage for sessionId...")
    
    // Also check localStorage to ensure we have the latest session_id
    const storedSessionId = safeLocalStorage.getItem(storageKey)
    console.log("[Chat] Stored sessionId in localStorage:", storedSessionId)
    if (storedSessionId && storedSessionId !== currentSessionId) {
      console.log("[Chat] ⚠️ Warning: localStorage sessionId differs from state, using localStorage value")
      currentSessionId = storedSessionId
      setSessionId(storedSessionId)
    }
    
    // If no session ID, create one first
    if (!currentSessionId) {
      console.log("[Chat] No session ID, creating new session before asking...")
      try {
        const response = await fetch("/api/chat/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: null,
            title: `Chat: ${tabId}_${pdfFile.name}`, // Include tabId for session isolation
            initial_message: null,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to create session`)
        }

        const sessionData = await response.json()
        currentSessionId = sessionData.session_id

        // Save session_id to localStorage
        safeLocalStorage.setItem(storageKey, currentSessionId)
        setSessionId(currentSessionId)
        console.log("[Chat] Created new session before asking:", currentSessionId)
      } catch (error: any) {
        console.error("[Chat] Failed to create session before asking:", error)
        toast({
          title: "Failed to start chat",
          description: error?.message || "Please try again",
          variant: "destructive",
        })
        return
      }
    }

    if (!question.trim()) return

    setIsLoading(true)
    const currentQuestion = question
    setQuestion("")

    try {
      console.log("[Chat] Sending question to backend with session_id:", currentSessionId)
      console.log("[Chat] Question:", currentQuestion)
      
      const response = await fetch("/api/chat/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: currentSessionId,
          question: currentQuestion,
          retriever: "hybrid",
          generator: "openai",
          image_policy: "auto",
          top_k: 5,
          max_tokens: 1024,
          user_images: [],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to get answer`)
      }

      const data = await response.json()

      // Check if this is an error response from backend
      if (data.error) {
        throw new Error(data.details || data.error || "Backend service unavailable")
      }

      const newMessage: QAMessage = {
        id: Date.now().toString(),
        question: currentQuestion,
        answer: data.answer,
        context: undefined,
        cited_sections: data.cited_sections,
        confidence: data.confidence,
        timestamp: new Date(),
      }

      const updatedMessages = [...messages, newMessage]
      setMessages(updatedMessages)
      setShowHistory(true)

      // Save messages to localStorage for persistence (convert Date to ISO string)
      const messagesToSave = updatedMessages.map((msg) => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
      }))
      safeLocalStorage.setJSON(messagesStorageKey, messagesToSave)

      // Notify parent of new Q&A message
      if (onNewMessage) {
        onNewMessage(currentQuestion, data.answer)
      }
    } catch (error: any) {
      console.error("[Chat] Error:", error)
      const errorMessage =
        error.message || "There was an error processing your question. Please ensure the backend is running."
      toast({
        title: "Failed to get answer",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleAskQuestion()
    }
  }

  const handleClearHistory = async () => {
    // Store old session ID before clearing to verify new one is different
    const oldSessionId = sessionId
    
    // CRITICAL: Clear state FIRST to prevent UI showing old messages
    setMessages([])
    setShowHistory(false)
    setSessionId(null)  // Reset immediately to prevent loading old session
    
    // Clear localStorage messages AND session_id COMPLETELY
    safeLocalStorage.removeItem(messagesStorageKey)
    safeLocalStorage.removeItem(storageKey) // Clear session_id too
    console.log("[Chat] ✅ Cleared localStorage - messages and session_id removed")
    
    // Create new session with unique title (timestamp + random) to ensure it's a new session
    try {
      const timestamp = new Date().toISOString()
      const randomId = Math.random().toString(36).substring(7) // Add random to ensure uniqueness
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: null,
          title: `Chat: ${tabId}_${pdfFile.name} - ${timestamp} - ${randomId}`, // Include tabId + timestamp + random to ensure unique session
          initial_message: null,
        }),
      })

      if (response.ok) {
        const sessionData = await response.json()
        const newSessionId = sessionData.session_id
        
        // Verify it's actually a new session (not the old one)
        if (newSessionId !== oldSessionId) {
          // Save new session_id to localStorage IMMEDIATELY
          safeLocalStorage.setItem(storageKey, newSessionId)
          // CRITICAL: Also clear messagesStorageKey again to ensure it's empty
          safeLocalStorage.removeItem(messagesStorageKey)
          setSessionId(newSessionId)
          console.log("[Chat] ✅ Created NEW session after clear:", newSessionId)
          console.log("[Chat] Old session was:", oldSessionId)
        } else {
          console.warn("[Chat] ⚠️ Warning: New session ID matches old one! Backend may have returned existing session.")
          // Still set it anyway to continue
          safeLocalStorage.setItem(storageKey, newSessionId)
          safeLocalStorage.removeItem(messagesStorageKey)
          setSessionId(newSessionId)
        }
      } else {
        console.error("[Chat] Failed to create new session - response not OK:", response.status)
      }
    } catch (error) {
      console.error("[Chat] Failed to create new session after clear:", error)
    }
    
    toast({
      title: "History cleared",
      description: "All Q&A history has been cleared. Starting new session.",
    })
  }

  const handleNewChat = async () => {
    try {
      setIsInitializing(true)
      
      // Clear current messages and history
      setMessages([])
      setShowHistory(false)
      
      // Clear localStorage messages
      safeLocalStorage.removeItem(messagesStorageKey)

      // Create new session with same PDF filename
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: null, // Use null for anonymous sessions
          title: `Chat: ${tabId}_${pdfFile.name}`, // Include tabId for session isolation
          initial_message: null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.details || errorData.error || `HTTP ${response.status}: Failed to create new session`
        
        // Special handling for timeout errors
        if (response.status === 504 || response.status === 503) {
          throw new Error(`Connection timeout: ${errorMessage}. Please check if MongoDB is running and backend is accessible.`)
        }
        
        throw new Error(errorMessage)
      }

      const sessionData = await response.json()
      const newSessionId = sessionData.session_id

      // Save new session_id to localStorage
      safeLocalStorage.setItem(storageKey, newSessionId)
      setSessionId(newSessionId)
      console.log("[Chat] Created new chat session:", newSessionId)
      
      toast({
        title: "New chat started",
        description: "Previous chat history has been cleared",
      })
    } catch (error: any) {
      console.error("[Chat] Failed to create new chat session:", error)
      toast({
        title: "Failed to start new chat",
        description: error?.message || "Please try again",
        variant: "destructive",
      })
    } finally {
      setIsInitializing(false)
    }
  }

  // Auto-scroll to bottom when new message is added
  useEffect(() => {
    if (showHistory && messages.length > 0 && scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages, showHistory])

  return (
    <>
      {!isOpen && onToggle && (
        <button
          onClick={onToggle}
          className="absolute right-0 top-1/2 z-10 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-border bg-background shadow-md transition-colors hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
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

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
          {/* History Section */}
          {showHistory && messages.length > 0 && (
            <div
              ref={scrollAreaRef}
              className="flex-1 min-h-0 overflow-y-auto border-b border-border"
            >
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
                        className="font-mono text-sm leading-relaxed text-foreground [&_strong]:font-semibold [&_em]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs"
                        dangerouslySetInnerHTML={{ __html: formatMessageAnswer(message.answer) }}
                      />

                      {/* Citations from backend */}
                      {message.cited_sections && message.cited_sections.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="font-mono text-xs font-medium text-muted-foreground">
                            References:
                          </p>
                          <div className="space-y-2">
                            {message.cited_sections.map((section, idx) => {
                              // Use citation_label if available, otherwise use citation_number, otherwise fallback to index
                              const citationLabel = section.citation_label || 
                                                   (section.citation_number ? `c${section.citation_number}` : `c${idx + 1}`)
                              // Use summary if available, otherwise use excerpt
                              const summary = section.summary || section.excerpt || ""
                              
                              return (
                                <div
                                  key={idx}
                                  className="rounded-md border border-accent/30 bg-accent/5 p-2.5 text-xs"
                                >
                                  <div className="mb-1 flex items-start gap-2">
                                    <span className="font-mono font-medium text-primary">{citationLabel}:</span>
                                    <div className="flex-1">
                                      <span className="font-mono text-foreground">
                                        {summary || section.excerpt || "..."}
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
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Fallback: context string if no cited_sections */}
                      {!message.cited_sections && message.context && (
                        <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="font-mono text-xs font-medium text-muted-foreground">Source Context</p>
                            {onHighlight && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onHighlight(message.context || null)}
                                className="h-6 gap-1 px-2 text-xs hover:bg-accent/20"
                              >
                                Highlight
                              </Button>
                            )}
                          </div>
                          <p className="font-mono text-xs leading-relaxed text-muted-foreground">{message.context}</p>
                        </div>
                      )}

                      {/* Confidence indicator */}
                      {message.confidence !== undefined && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">Confidence:</span>
                          <div className="flex-1 rounded-full bg-muted h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${(message.confidence * 100).toFixed(0)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-muted-foreground">
                            {(message.confidence * 100).toFixed(0)}%
                          </span>
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

            {/* Pipeline Status Progress */}
            {isPipelineReady === false && (
              <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="font-mono text-sm font-medium text-foreground">
                      Preparing documents...
                    </span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {typeof pipelineStatus.percent === 'number' ? `${pipelineStatus.percent}%` : ''}
                    {pipelineStatus.chunks !== undefined && pipelineStatus.chunks > 0 ? ` • ${pipelineStatus.chunks} chunks` : ''}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div 
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.max(10, Math.min(99, Number(pipelineStatus.percent ?? 10)))}%`
                    }}
                  />
                </div>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {pipelineStatus.message || 'Building search index and embeddings. This may take 1-2 minutes...'}
                </p>
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
                  disabled={isLoading || isInitializing || !sessionId || isPipelineReady === false}
                  className="h-12 resize-none border-2 font-mono text-sm shadow-sm focus:border-primary"
                />
              </div>
              <Button
                onClick={handleAskQuestion}
                disabled={isLoading || !question.trim() || isInitializing || !sessionId || isPipelineReady === false}
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

            {/* Helper Text */}
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">Enter</kbd> to send
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
