"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Send, Loader2, X, Sparkles, History, Trash2, MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"

interface QAInterfaceProps {
  pdfFile: File
  onHighlight?: (text: string | null) => void
  onClose?: () => void
  onNewMessage?: (question: string, answer: string) => void
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

export function QAInterface({ pdfFile, onHighlight, onClose, onNewMessage }: QAInterfaceProps) {
  const [question, setQuestion] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const { toast } = useToast()
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Storage key based on PDF filename to maintain separate sessions per PDF
  const storageKey = `chat_session_${pdfFile.name}`
  const messagesStorageKey = `chat_messages_${pdfFile.name}`

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
        // Only load if session_id exists (not cleared)
        if (typeof window !== 'undefined') {
          try {
            const savedSessionId = localStorage.getItem(storageKey)
            // Only load messages if we have a valid session_id (not cleared)
            if (savedSessionId) {
              const savedMessages = localStorage.getItem(messagesStorageKey)
              if (savedMessages) {
                const parsedMessages = JSON.parse(savedMessages)
                if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
                  // Restore Date objects from ISO strings
                  const restoredMessages = parsedMessages.map((msg: any) => ({
                    ...msg,
                    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                  }))
                  setMessages(restoredMessages)
                  setShowHistory(true)
                  console.log("[Chat] Loaded", restoredMessages.length, "messages from localStorage")
                }
              }
            }
          } catch (e) {
            console.warn("[Chat] Failed to load messages from localStorage:", e)
          }
        }

        // THEN: Check if we have a saved session_id in localStorage
        const savedSessionId = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
        
        if (savedSessionId) {
          // Set session ID immediately so user can chat while we verify
          setSessionId(savedSessionId)
          
          // Verify session still exists and sync with backend
          try {
            const sessionResponse = await fetch(`/api/chat/sessions?session_id=${savedSessionId}`)
            if (sessionResponse.ok) {
              const sessionData = await sessionResponse.json()
              console.log("[Chat] Using existing session:", savedSessionId)
              
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
                  if (typeof window !== 'undefined') {
                    try {
                      const messagesToSave = historyMessages.map((msg) => ({
                        ...msg,
                        timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
                      }))
                      localStorage.setItem(messagesStorageKey, JSON.stringify(messagesToSave))
                    } catch (e) {
                      console.warn("[Chat] Failed to save messages to localStorage:", e)
                    }
                  }
                  console.log("[Chat] Synced", historyMessages.length, "messages from backend")
                }
              }
            } else {
              // Session not found, create new one
              throw new Error("Session not found")
            }
          } catch (error) {
            console.log("[Chat] Session not found, creating new one")
            // Session expired or not found, create new one
            await createNewSession()
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
            title: `Chat: ${pdfFile.name}`,
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
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, newSessionId)
        }
        setSessionId(newSessionId)
        console.log("[Chat] Created new session:", newSessionId)
      } catch (error: any) {
        console.error("[Chat] Failed to create session:", error)
        throw error
      }
    }

    initializeSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFile.name])

  const handleAskQuestion = async () => {
    // Ensure we have a session ID before asking
    let currentSessionId = sessionId
    
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
            title: `Chat: ${pdfFile.name}`,
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
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, currentSessionId)
        }
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
      if (typeof window !== 'undefined') {
        try {
          const messagesToSave = updatedMessages.map((msg) => ({
            ...msg,
            timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
          }))
          localStorage.setItem(messagesStorageKey, JSON.stringify(messagesToSave))
        } catch (e) {
          console.warn("[Chat] Failed to save messages to localStorage:", e)
        }
      }

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
    setMessages([])
    setShowHistory(false)
    // Clear localStorage messages AND session_id
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(messagesStorageKey)
        localStorage.removeItem(storageKey) // Clear session_id too
        setSessionId(null) // Reset session ID
      } catch (e) {
        console.warn("[Chat] Failed to clear messages from localStorage:", e)
      }
    }
    
    // Create new session to ensure clean start
    try {
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: null,
          title: `Chat: ${pdfFile.name}`,
          initial_message: null,
        }),
      })

      if (response.ok) {
        const sessionData = await response.json()
        const newSessionId = sessionData.session_id
        
        // Save new session_id to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, newSessionId)
        }
        setSessionId(newSessionId)
        console.log("[Chat] Created new session after clear:", newSessionId)
      }
    } catch (error) {
      console.error("[Chat] Failed to create new session after clear:", error)
    }
    
    toast({
      title: "History cleared",
      description: "All Q&A history has been cleared",
    })
  }

  const handleNewChat = async () => {
    try {
      setIsInitializing(true)
      
      // Clear current messages and history
      setMessages([])
      setShowHistory(false)
      
      // Clear localStorage messages
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(messagesStorageKey)
        } catch (e) {
          console.warn("[Chat] Failed to clear messages from localStorage:", e)
        }
      }

      // Create new session with same PDF filename
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: null, // Use null for anonymous sessions
          title: `Chat: ${pdfFile.name}`,
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
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, newSessionId)
      }
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-4xl rounded-b-none border-x-0 border-b-0 border-t-2 border-primary/20 bg-card shadow-2xl">
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
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex max-h-[70vh] flex-col overflow-hidden">
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
                        dangerouslySetInnerHTML={{ 
                          __html: (() => {
                            // Escape HTML first to prevent XSS
                            const escapeHtml = (text: string) => {
                              const map: Record<string, string> = {
                                '&': '&amp;',
                                '<': '&lt;',
                                '>': '&gt;',
                                '"': '&quot;',
                                "'": '&#039;',
                              }
                              return text.replace(/[&<>"']/g, (m) => map[m])
                            }
                            
                            let html = escapeHtml(message.answer)
                            // Process markdown - bold first (to avoid conflicts with italic)
                            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            // Then italic (single asterisks, avoiding ones that are part of bold)
                            // Match single * that are not immediately preceded or followed by another *
                            html = html.replace(/(?<!\*)\*([^*<]+?)\*(?!\*)/g, '<em>$1</em>')
                            // Code blocks (backticks)
                            html = html.replace(/`([^`]+?)`/g, '<code>$1</code>')
                            // Line breaks
                            html = html.replace(/\n/g, '<br />')
                            return html
                          })()
                        }}
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

            {/* Input Field */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={isInitializing ? "Initializing chat..." : "Ask anything about this document..."}
                  disabled={isLoading || isInitializing || !sessionId}
                  className="h-12 resize-none border-2 font-mono text-sm shadow-sm focus:border-primary"
                />
              </div>
              <Button
                onClick={handleAskQuestion}
                disabled={isLoading || !question.trim() || isInitializing || !sessionId}
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
      </Card>
    </div>
  )
}
