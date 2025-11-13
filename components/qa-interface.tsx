"use client"

import type React from "react"

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react"
import { Send, Loader2, X, Sparkles, History, Trash2, MessageSquarePlus, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils";

interface QAInterfaceProps {
  pdfFile: File
  tabId?: string // Optional tab ID for unique localStorage keys
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

export function QAInterface({ pdfFile, tabId, onHighlight, onClose, onNewMessage, isOpen = true, onToggle }: QAInterfaceProps) {
  // CRITICAL: Log immediately when function is called (before any hooks)
  console.log("[Chat] 🚀 QAInterface FUNCTION CALLED - PDF:", pdfFile?.name, "Tab:", tabId, "isOpen:", isOpen)
  
  const [question, setQuestion] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isPipelineReady, setIsPipelineReady] = useState<boolean | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<{building?: boolean, ready?: boolean, chunks?: number, percent?: number, stage?: string, message?: string}>({})
  // Use simple state - we'll load from localStorage in useLayoutEffect
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [showHistory, setShowHistory] = useState(false)
  // Add a force update trigger to ensure re-render
  const [, setForceUpdate] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const { toast } = useToast()
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const clearedSessionIdsRef = useRef<Set<string>>(new Set())
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])
  
  const clearStorageKeysForPdf = (pdfName: string): number => {
    if (typeof window === "undefined" || !pdfName) {
      return 0
    }

    const baseMessagePrefix = `chat_messages_${pdfName}`
    const baseSessionPrefix = `chat_session_${pdfName}`
    const keysToRemove: string[] = []

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key) {
        continue
      }
      if (key.startsWith(baseMessagePrefix) || key.startsWith(baseSessionPrefix)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key)
      console.log("[Chat] 🧹 Removed localStorage key during clear:", key)
    })

    return keysToRemove.length
  }
  
  // Debug: Log when component mounts/updates
  useEffect(() => {
    console.log("[Chat] 🎯 QAInterface component mounted/updated - PDF:", pdfFile?.name, "Tab:", tabId)
  }, [pdfFile?.name, tabId])
  
  // CRITICAL: Watch for pdfFile.name changes and force load messages when it becomes available
  // This handles the case where component mounts before pdfFile.name is set
  useEffect(() => {
    if (!pdfFile?.name) {
      console.log("[Chat] ⏳ Waiting for pdfFile.name to be available...")
      return
    }
    
    // Force check and load messages from localStorage when pdfFile.name becomes available
    const currentUniqueKey = tabId ? `${pdfFile.name}_${tabId}` : pdfFile.name
    const currentMessagesStorageKey = `chat_messages_${currentUniqueKey}`
    
    console.log("[Chat] 🔍 WATCHER: pdfFile.name is now available, checking localStorage:", currentMessagesStorageKey)
    
    if (typeof window !== 'undefined') {
      try {
        let savedMessages = localStorage.getItem(currentMessagesStorageKey)
        
        // Fallback: try without tabId
        if ((!savedMessages || savedMessages.trim() === '[]' || savedMessages.trim() === '') && tabId) {
          savedMessages = localStorage.getItem(`chat_messages_${pdfFile.name}`)
        }
        
        if (savedMessages && savedMessages.trim() !== '[]' && savedMessages.trim() !== '') {
          try {
            const parsedMessages = JSON.parse(savedMessages)
            if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
              const restoredMessages = parsedMessages.map((msg: any) => ({
                ...msg,
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
              }))
              
              // Only update if we don't already have these messages
              setMessages((prev) => {
                if (prev.length === restoredMessages.length) {
                  const prevQuestions = prev.map(m => m.question).join('|')
                  const restoredQuestions = restoredMessages.map(m => m.question).join('|')
                  if (prevQuestions === restoredQuestions) {
                    return prev
                  }
                }
                console.log("[Chat] 🔍 WATCHER: Loading", restoredMessages.length, "messages from localStorage")
                return restoredMessages
              })
              setShowHistory(true)
              setForceUpdate(prev => prev + 1)
              console.log("[Chat] 🔍 WATCHER: Messages loaded and state updated")
            }
          } catch (e) {
            console.warn("[Chat] WATCHER: Failed to parse messages:", e)
          }
        }
      } catch (e) {
        console.warn("[Chat] WATCHER: Failed to check localStorage:", e)
      }
    }
  }, [pdfFile?.name, tabId])

  // Storage key based on PDF filename AND tab ID to maintain separate sessions per tab
  // This ensures each tab has its own independent chat history
  // Use useMemo to ensure stable reference and trigger useEffect correctly
  const uniqueKey = useMemo(() => {
    return tabId ? `${pdfFile?.name || ''}_${tabId}` : (pdfFile?.name || '')
  }, [pdfFile?.name, tabId])
  
  const storageKey = useMemo(() => `chat_session_${uniqueKey}`, [uniqueKey])
  const messagesStorageKey = useMemo(() => `chat_messages_${uniqueKey}`, [uniqueKey])

  const suggestedQuestions = [
    "What is the main finding?",
    "Who are the authors?",
    "What methodology was used?",
    "What are the key conclusions?",
  ]

  // STEP 1: Load messages from localStorage IMMEDIATELY and FORCE re-render
  // This runs synchronously before paint, ensuring UI updates immediately
  useLayoutEffect(() => {
    // Only proceed if we have valid pdfFile.name
    if (!pdfFile?.name) {
      console.log("[Chat] Waiting for pdfFile.name...")
      return
    }
    
    // Calculate storage key inside useEffect to ensure it's always current
    const currentUniqueKey = tabId ? `${pdfFile.name}_${tabId}` : pdfFile.name
    const currentMessagesStorageKey = `chat_messages_${currentUniqueKey}`
    
    console.log("[Chat] 📦 STEP 1: Loading from localStorage - Key:", currentMessagesStorageKey, "PDF:", pdfFile.name, "Tab:", tabId)
    
    if (typeof window !== 'undefined') {
      try {
        // Try to load with current key (includes tabId if available)
        let savedMessages = localStorage.getItem(currentMessagesStorageKey)
        console.log("[Chat] 📦 STEP 1: Checking localStorage for key:", currentMessagesStorageKey, "PDF:", pdfFile.name, "Tab:", tabId, "Found:", savedMessages ? "Yes" : "No")
        
        // Fallback: If not found and we have tabId, try loading without tabId (for backward compatibility)
        if ((!savedMessages || savedMessages.trim() === '[]' || savedMessages.trim() === '') && tabId) {
          const fallbackKey = `chat_messages_${pdfFile.name}`
          const fallbackMessages = localStorage.getItem(fallbackKey)
          if (fallbackMessages && fallbackMessages.trim() !== '[]' && fallbackMessages.trim() !== '') {
            console.log("[Chat] Found history with fallback key (without tabId), using it:", fallbackKey)
            savedMessages = fallbackMessages
            // Migrate to new key format for future use
            try {
              localStorage.setItem(currentMessagesStorageKey, fallbackMessages)
            } catch (e) {
              console.warn("[Chat] Failed to migrate to new key format:", e)
            }
          }
        }
        
        // Only load if messages exist AND not empty
        if (savedMessages && savedMessages.trim() !== '[]' && savedMessages.trim() !== '') {
          try {
            const parsedMessages = JSON.parse(savedMessages)
            if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
              // Restore Date objects from ISO strings
              const restoredMessages = parsedMessages.map((msg: any) => ({
                ...msg,
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
              }))
              console.log("[Chat] ✅ STEP 1: Loaded", restoredMessages.length, "messages from localStorage for", pdfFile.name)
              
              // CRITICAL: Use React.startTransition or flushSync to ensure immediate update
              // Set both states and force update in the same batch
              setMessages(restoredMessages)
              setShowHistory(true)
              // Force a re-render by updating a dummy state
              setForceUpdate(prev => prev + 1)
              console.log("[Chat] ✅ STEP 1: State updated synchronously - messages:", restoredMessages.length, "showHistory: true, forceUpdate triggered")
            } else {
              console.log("[Chat] ⚠️ STEP 1: No messages in localStorage (empty array)")
              setMessages([])
              setShowHistory(false)
            }
          } catch (parseError) {
            console.warn("[Chat] ❌ STEP 1: Failed to parse messages from localStorage:", parseError)
            localStorage.removeItem(currentMessagesStorageKey)
            setMessages([])
            setShowHistory(false)
          }
        } else {
          console.log("[Chat] ⚠️ STEP 1: No messages in localStorage (cleared or empty) for", pdfFile.name)
          setMessages([])
          setShowHistory(false)
        }
      } catch (e) {
        console.warn("[Chat] Failed to load messages from localStorage:", e)
        setMessages([])
        setShowHistory(false)
      }
    }
    // Run when pdfFile.name or tabId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFile?.name, tabId])

  // STEP 2: Initialize session (async, but doesn't block history display)
  useEffect(() => {
    // Only proceed if we have valid pdfFile.name
    if (!pdfFile?.name) {
      console.log("[Chat] Waiting for pdfFile.name before initializing session...")
      return
    }
    
    console.log("[Chat] 🔄 STEP 2: Initializing session for PDF:", pdfFile.name, "Tab:", tabId)
    
    const initializeSession = async () => {
      try {
        // Recalculate storage keys inside useEffect to ensure they're always current
        // This is critical because tabId might change and we need the correct keys
        const currentUniqueKey = tabId ? `${pdfFile.name}_${tabId}` : pdfFile.name
        const currentStorageKey = `chat_session_${currentUniqueKey}`
        const currentMessagesStorageKey = `chat_messages_${currentUniqueKey}`

        // CRITICAL: Load messages from localStorage FIRST, before checking session
        // This ensures messages are available even if session check fails
        console.log("[Chat] 🔍 STEP 2: Loading messages from localStorage FIRST")
        if (typeof window !== 'undefined') {
          try {
            let savedMessages = localStorage.getItem(currentMessagesStorageKey)
            
            // Fallback: try without tabId
            if ((!savedMessages || savedMessages.trim() === '[]' || savedMessages.trim() === '') && tabId) {
              savedMessages = localStorage.getItem(`chat_messages_${pdfFile.name}`)
            }
            
            if (savedMessages && savedMessages.trim() !== '[]' && savedMessages.trim() !== '') {
              try {
                const parsedMessages = JSON.parse(savedMessages)
                if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
                  const restoredMessages = parsedMessages.map((msg: any) => ({
                    ...msg,
                    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                  }))
                  console.log("[Chat] ✅ STEP 2: Loaded", restoredMessages.length, "messages from localStorage BEFORE session check")
                  setMessages(restoredMessages)
                  setShowHistory(true)
                  setForceUpdate(prev => prev + 1)
                }
              } catch (e) {
                console.warn("[Chat] STEP 2: Failed to parse messages:", e)
              }
            }
          } catch (e) {
            console.warn("[Chat] STEP 2: Failed to load messages:", e)
          }
        }
        
        // Check if we have a saved session_id in localStorage
        let savedSessionId = typeof window !== 'undefined' ? localStorage.getItem(currentStorageKey) : null
        if (savedSessionId && clearedSessionIdsRef.current.has(savedSessionId)) {
          console.log("[Chat] 🚫 STEP 2: Saved session was cleared earlier, ignoring:", savedSessionId)
          if (typeof window !== 'undefined') {
            localStorage.removeItem(currentStorageKey)
            localStorage.removeItem(currentMessagesStorageKey)
          }
          savedSessionId = null
        }
        console.log("[Chat] 🔍 STEP 2: Checking localStorage for session:", currentStorageKey, "Found:", savedSessionId ? "Yes" : "No")
        
        if (savedSessionId) {
          // Set session ID immediately so user can chat while we verify
          setSessionId(savedSessionId)
          console.log("[Chat] ✅ Found saved session ID, verifying with backend:", savedSessionId)
          
          // Verify session still exists and sync with backend (background sync)
          // This doesn't block UI - history is already shown from localStorage
          try {
            console.log("[Chat] 🔍 Fetching session from backend:", savedSessionId)
            const sessionResponse = await fetch(`/api/chat/sessions?session_id=${savedSessionId}`)
            if (sessionResponse.ok) {
              if (clearedSessionIdsRef.current.has(savedSessionId)) {
                console.log("[Chat] 🚫 STEP 2: Received session verification for cleared session, ignoring:", savedSessionId)
                return
              }
              const sessionData = await sessionResponse.json()
              console.log("[Chat] ✅ Verified existing session:", savedSessionId)
              
              // Load chat history from backend and merge with localStorage
              // Only update if backend has different/more messages
              if (sessionData.messages && sessionData.messages.length > 0) {
                const historyMessages: QAMessage[] = []
                let currentQ: { question: string; timestamp: Date } | null = null
                
                for (const msg of sessionData.messages) {
                  if (msg.role === "user") {
                    currentQ = { question: msg.content, timestamp: new Date(msg.timestamp) }
                  } else if (msg.role === "assistant" && currentQ) {
                    // Use message timestamp or generate unique ID
                    const messageId = msg.timestamp || `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
                    historyMessages.push({
                      id: messageId,
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
                // Only update if we got messages from backend AND they're different from current
                // This prevents overwriting messages that were just loaded from localStorage
                if (historyMessages.length > 0) {
                  // Check if we already have messages (from localStorage) - only update if backend has more/different
                  setMessages((currentMessages) => {
                    // If we already have messages loaded from localStorage, be careful about overwriting
                    if (currentMessages.length > 0) {
                      // If backend has same or fewer messages, keep localStorage version (it's already displayed)
                      if (historyMessages.length <= currentMessages.length) {
                        // Check if messages are the same (compare by question text)
                        const currentQuestions = currentMessages.map(m => m.question).join('|')
                        const backendQuestions = historyMessages.map(m => m.question).join('|')
                        if (currentQuestions === backendQuestions || historyMessages.length < currentMessages.length) {
                          console.log("[Chat] ⚠️ STEP 2: Keeping localStorage messages (already displayed), backend has same/fewer messages")
                          return currentMessages
                        }
                      }
                      // Backend has more messages - use backend as source of truth
                      console.log("[Chat] ✅ STEP 2: Backend has more messages, updating from backend")
                    } else {
                      // No current messages, use backend
                      console.log("[Chat] ✅ STEP 2: No current messages, using backend messages")
                    }
                    console.log("[Chat] ✅ STEP 2: Updating messages from backend:", historyMessages.length, "messages")
                    return historyMessages
                  })
                  setShowHistory(true)
                  
                  // Save to localStorage for next time (convert Date to ISO string)
                  if (typeof window !== 'undefined') {
                    try {
                      const messagesToSave = historyMessages.map((msg) => ({
                        ...msg,
                        timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
                      }))
                      localStorage.setItem(currentMessagesStorageKey, JSON.stringify(messagesToSave))
                    } catch (e) {
                      console.warn("[Chat] Failed to save messages to localStorage:", e)
                    }
                  }
                  console.log("[Chat] Synced", historyMessages.length, "messages from backend (background)")
                } else {
                  console.log("[Chat] Backend has no messages, keeping localStorage messages if any")
                }
              }
            } else if (sessionResponse.status === 404) {
              // Session not found in DB, but we have it in localStorage
              // This might mean DB was reset or session expired
              console.log("[Chat] ⚠️ Session not found in database (404), will create new one")
              // Clear localStorage to avoid confusion
              if (typeof window !== 'undefined') {
                localStorage.removeItem(currentStorageKey)
                localStorage.removeItem(currentMessagesStorageKey)
              }
              await createNewSession()
            } else {
              // Other error (500, 503, etc.) - don't create new session yet
              // Just log and keep using localStorage session ID
              console.warn("[Chat] ⚠️ Failed to verify session:", sessionResponse.status, "Keeping localStorage session ID")
              // Don't throw error, just use what we have
            }
          } catch (error: any) {
            // Network error or other exception - non-blocking
            console.warn("[Chat] ⚠️ Error verifying session (non-blocking):", error.message || error)
            // Don't create new session on network errors - keep existing one
            // User can still chat using localStorage session
          }
        } else {
          // No saved session, create new one
          console.log("[Chat] No saved session found, creating new session...")
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

    const createNewSession = async (retryCount = 0, maxRetries = 2) => {
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
          
          // Special handling for timeout errors - retry with exponential backoff
          if ((response.status === 504 || response.status === 503) && retryCount < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 5000) // Max 5 seconds
            console.log(`[Chat] Retrying session creation after ${delay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`)
            await new Promise(resolve => setTimeout(resolve, delay))
            return createNewSession(retryCount + 1, maxRetries)
          }
          
          // Special handling for timeout errors
          if (response.status === 504 || response.status === 503) {
            throw new Error(`Connection timeout: ${errorMessage}. Please check if MongoDB is running and backend is accessible.`)
          }
          
          throw new Error(errorMessage)
        }

        const sessionData = await response.json()
        const newSessionId = sessionData.session_id
        
        // Recalculate storage key inside function to ensure it's current
        const currentUniqueKey = tabId ? `${pdfFile.name}_${tabId}` : pdfFile.name
        const currentStorageKey = `chat_session_${currentUniqueKey}`
        
        // Save session_id to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(currentStorageKey, newSessionId)
        }
        setSessionId(newSessionId)
        console.log("[Chat] Created new session:", newSessionId)
      } catch (error: any) {
        console.error("[Chat] Failed to create session:", error)
        throw error
      }
    }

    initializeSession()
    // Start polling pipeline readiness
    let cancelled = false
    let timer: any
    const poll = async () => {
      try {
        const res = await fetch("/api/qa/status")
        const data = await res.json().catch(() => ({}))
        if (!cancelled) {
          setIsPipelineReady(Boolean(data?.ready))
          setPipelineStatus(data)
        }
        if (!data?.ready && !cancelled) {
          timer = setTimeout(poll, 2000)
        }
      } catch {
        if (!cancelled) {
          timer = setTimeout(poll, 2000)
        }
      }
    }
    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // Include tabId and pdfFile.name in dependencies to ensure we initialize when PDF or tab changes
    // Use pdfFile?.name to handle cases where pdfFile might be undefined initially
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFile?.name, tabId])

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
    
    // Recalculate storage keys to ensure they're current
    const currentUniqueKey = tabId ? `${pdfFile.name}_${tabId}` : pdfFile.name
    const currentStorageKey = `chat_session_${currentUniqueKey}`
    const currentMessagesStorageKey = `chat_messages_${currentUniqueKey}`
    
    // Also check localStorage to ensure we have the latest session_id
    if (typeof window !== 'undefined') {
      const storedSessionId = localStorage.getItem(currentStorageKey)
      console.log("[Chat] Stored sessionId in localStorage:", storedSessionId)
      if (storedSessionId && storedSessionId !== currentSessionId) {
        console.log("[Chat] ⚠️ Warning: localStorage sessionId differs from state, using localStorage value")
        currentSessionId = storedSessionId
        setSessionId(storedSessionId)
      }
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
          localStorage.setItem(currentStorageKey, currentSessionId)
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

      // Generate unique message ID to avoid React key conflicts
      const messageId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const newMessage: QAMessage = {
        id: messageId,
        question: currentQuestion,
        answer: data.answer,
        context: undefined,
        cited_sections: data.cited_sections,
        confidence: data.confidence,
        timestamp: new Date(),
      }

      const updatedMessages = [...messages, newMessage]
      console.log("[Chat] 💬 Adding new message - total messages:", updatedMessages.length)
      
      // CRITICAL: Set messages and showHistory, then force re-render
      setMessages(updatedMessages)
      setShowHistory(true)
      // Force re-render to ensure UI updates
      setForceUpdate(prev => prev + 1)
      console.log("[Chat] 💬 State updated - messages:", updatedMessages.length, "showHistory: true, forceUpdate triggered")

      // Save messages to localStorage for persistence (convert Date to ISO string)
      if (typeof window !== 'undefined') {
        try {
          const messagesToSave = updatedMessages.map((msg) => ({
            ...msg,
            timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
          }))
          localStorage.setItem(currentMessagesStorageKey, JSON.stringify(messagesToSave))
          console.log("[Chat] 💬 Saved", updatedMessages.length, "messages to localStorage")
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
    // Recalculate storage keys to ensure they're current
    const currentUniqueKey = tabId ? `${pdfFile.name}_${tabId}` : pdfFile.name
    const currentStorageKey = `chat_session_${currentUniqueKey}`
    const currentMessagesStorageKey = `chat_messages_${currentUniqueKey}`
    
    // Store old session ID before clearing to verify new one is different
    const oldSessionId = sessionId
    if (oldSessionId) {
      clearedSessionIdsRef.current.add(oldSessionId)
    }
    
    // CRITICAL: Clear state FIRST to prevent UI showing old messages
    setMessages([])
    setShowHistory(false)
    setSessionId(null)  // Reset immediately to prevent loading old session
    
    // Clear localStorage messages AND session_id COMPLETELY
    if (typeof window !== 'undefined') {
      try {
        let removedCount = 0
        if (localStorage.getItem(currentMessagesStorageKey) !== null) {
          localStorage.removeItem(currentMessagesStorageKey)
          removedCount += 1
        }
        if (localStorage.getItem(currentStorageKey) !== null) {
          localStorage.removeItem(currentStorageKey)
          removedCount += 1
        }
        removedCount += clearStorageKeysForPdf(pdfFile.name)
        console.log("[Chat] ✅ Cleared localStorage - removed", removedCount, "keys for PDF:", pdfFile.name)
      } catch (e) {
        console.warn("[Chat] Failed to clear messages from localStorage:", e)
      }
    }
    
    if (oldSessionId) {
      try {
        const deleteResponse = await fetch(`/api/chat/sessions/${oldSessionId}`, {
          method: "DELETE",
          signal: AbortSignal.timeout(10000),
        })
        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          console.warn("[Chat] ⚠️ Failed to delete old session on clear:", oldSessionId, deleteResponse.status)
        } else {
          console.log("[Chat] 🗑️ Deleted old session on clear:", oldSessionId)
        }
      } catch (error) {
        console.warn("[Chat] ⚠️ Error deleting old session on clear:", error)
      }
    }
    
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
          title: `Chat: ${pdfFile.name} - ${timestamp} - ${randomId}`, // Add timestamp + random to ensure unique session
          initial_message: null,
        }),
        // Add timeout to prevent hanging (10 seconds should be enough for session creation)
        signal: AbortSignal.timeout(10000), // 10 seconds timeout
      })

      if (response.ok) {
        const sessionData = await response.json()
        const newSessionId = sessionData.session_id
        
        // Verify it's actually a new session (not the old one)
        if (newSessionId !== oldSessionId) {
          // Save new session_id to localStorage IMMEDIATELY
          if (typeof window !== 'undefined') {
            localStorage.setItem(currentStorageKey, newSessionId)
            // CRITICAL: Also clear messagesStorageKey again to ensure it's empty
            localStorage.removeItem(currentMessagesStorageKey)
          }
          setSessionId(newSessionId)
          console.log("[Chat] ✅ Created NEW session after clear:", newSessionId)
          console.log("[Chat] Old session was:", oldSessionId)
        } else {
          console.warn("[Chat] ⚠️ Warning: New session ID matches old one! Backend may have returned existing session.")
          // Still set it anyway to continue
          if (typeof window !== 'undefined') {
            localStorage.setItem(currentStorageKey, newSessionId)
            localStorage.removeItem(currentMessagesStorageKey)
          }
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
    // Recalculate storage keys to ensure they're current
    const currentUniqueKey = tabId ? `${pdfFile.name}_${tabId}` : pdfFile.name
    const currentStorageKey = `chat_session_${currentUniqueKey}`
    const currentMessagesStorageKey = `chat_messages_${currentUniqueKey}`
    
    try {
      setIsInitializing(true)
      
      // Clear current messages and history
      setMessages([])
      setShowHistory(false)
      
      // Clear localStorage messages
      if (typeof window !== 'undefined') {
        try {
          let removedCount = 0
          if (localStorage.getItem(currentMessagesStorageKey) !== null) {
            localStorage.removeItem(currentMessagesStorageKey)
            removedCount += 1
          }
          removedCount += clearStorageKeysForPdf(pdfFile.name)
          console.log("[Chat] ✅ Cleared", removedCount, "localStorage keys before starting new chat for PDF:", pdfFile.name)
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
        localStorage.setItem(currentStorageKey, newSessionId)
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

  // CRITICAL: Auto-show history when messages are loaded
  // This ensures history is visible even if showHistory wasn't set properly during load
  useEffect(() => {
    console.log("[Chat] 🔔 Checking messages state - messages.length:", messages.length, "showHistory:", showHistory)
    if (messages.length > 0) {
      if (!showHistory) {
        console.log("[Chat] 🔔 Auto-showing history - messages found but showHistory was false")
        setShowHistory(true)
        setForceUpdate(prev => prev + 1)
      }
      console.log("[Chat] 🔔 History should be visible - messages:", messages.length, "showHistory:", showHistory)
    }
  }, [messages.length, showHistory, messages])
  
  // Debug: Log render with current state
  const shouldShowHistory = messages.length > 0
  console.log("[Chat] 🎨 RENDER - messages:", messages.length, "showHistory:", showHistory, "shouldShowHistory:", shouldShowHistory)
  
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
          {/* CRITICAL: Always show history if we have messages - don't rely on showHistory state */}
          {shouldShowHistory && (
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
