import { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'

interface QAMessage {
  id: string
  question: string
  answer: string
  context?: string
  cited_sections?: any[]
  confidence?: number
  timestamp: Date
}

interface UseQAActionsProps {
  sessionId: string | null
  pdfFile: File
  tabId?: string
  isPipelineReady: boolean | null
  addMessage: (message: QAMessage) => void
  reloadMessages?: () => Promise<void>
  createNewSession: () => Promise<string>
}

export function useQAActions({ 
  sessionId, 
  pdfFile, 
  tabId, 
  isPipelineReady, 
  addMessage,
  reloadMessages,
  createNewSession 
}: UseQAActionsProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const pendingQuestionRef = useRef<string | null>(null)
  const checkPendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Storage keys for thinking state
  const uniqueKey = tabId ? `${pdfFile?.name || ''}_${tabId}` : (pdfFile?.name || '')
  const thinkingFlagKey = `chat_thinking_${uniqueKey}` // Flag to track if there's a pending question

  // Check if there's a pending question (user message without assistant response)
  const checkPendingQuestion = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/chat/sessions?session_id=${sessionId}`)
      if (!response.ok) return false
      
      const sessionData = await response.json()
      const backendMessages = sessionData.messages && Array.isArray(sessionData.messages) ? sessionData.messages : []
      
      if (backendMessages.length === 0) return false
      
      // Check if last message is a user message (no assistant response yet)
      const lastMessage = backendMessages[backendMessages.length - 1]
      if (lastMessage.role === "user") {
        pendingQuestionRef.current = lastMessage.content
        // Save thinking state to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(thinkingFlagKey, 'true')
        }
        console.log(`[QAActions:${tabId}] Found pending question: "${lastMessage.content.substring(0, 50)}..."`)
        return true
      }
      
      // Answer has arrived - clear thinking flag
      pendingQuestionRef.current = null
      if (typeof window !== 'undefined') {
        localStorage.removeItem(thinkingFlagKey)
      }
      return false
    } catch (error) {
      console.warn(`[QAActions:${tabId}] Failed to check pending question:`, error)
      return false
    }
  }, [tabId, thinkingFlagKey])

  // Stop polling - defined first to avoid initialization error
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }, [])

  // Start polling for pending question (only when we think there's a pending question)
  const startPolling = useCallback(() => {
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }

    if (!sessionId) return

    // Only poll if we have thinking flag set
    const hasThinkingFlag = typeof window !== 'undefined' ? localStorage.getItem(thinkingFlagKey) === 'true' : false
    if (!hasThinkingFlag) return

    console.log(`[QAActions:${tabId}] Starting polling for pending question`)
    pollingIntervalRef.current = setInterval(() => {
      if (!sessionId) {
        stopPolling()
        return
      }
      
      // Check if thinking flag is still set before making API call
      const hasThinkingFlag = typeof window !== 'undefined' ? localStorage.getItem(thinkingFlagKey) === 'true' : false
      if (!hasThinkingFlag) {
        // Flag was cleared, stop polling
        setIsLoading(false)
        stopPolling()
        return
      }
      
      // Make API call to check if answer has arrived
      checkPendingQuestion(sessionId).then((hasPending: boolean) => {
        if (hasPending) {
          setIsLoading(true)
        } else {
          // Answer has arrived - stop polling and loading
          setIsLoading(false)
          stopPolling()
        }
      })
    }, 2000) // Check every 2 seconds
  }, [sessionId, checkPendingQuestion, tabId, thinkingFlagKey, stopPolling])

  // Check for pending question when sessionId changes or component mounts
  useEffect(() => {
    if (!sessionId) {
      // Even without sessionId, check thinking flag to restore state immediately
      const hasThinkingFlag = typeof window !== 'undefined' ? localStorage.getItem(thinkingFlagKey) === 'true' : false
      if (hasThinkingFlag) {
        // Restore thinking state immediately, even without sessionId
        console.log(`[QAActions:${tabId}] Restoring thinking state from flag (no sessionId yet)`)
        setIsLoading(true)
      } else {
        setIsLoading(false)
        pendingQuestionRef.current = null
      }
      stopPolling()
      return
    }

    // Clear any existing timeout
    if (checkPendingTimeoutRef.current) {
      clearTimeout(checkPendingTimeoutRef.current)
    }

    // Restore thinking state immediately from localStorage (for instant UI update)
    const hasThinkingFlag = typeof window !== 'undefined' ? localStorage.getItem(thinkingFlagKey) === 'true' : false
    
    if (hasThinkingFlag) {
      // Immediately restore thinking state for instant UI feedback
      console.log(`[QAActions:${tabId}] Restoring isLoading=true from thinking flag (immediate)`)
      setIsLoading(true)
      // Then verify with backend
      checkPendingQuestion(sessionId).then((hasPending: boolean) => {
        if (hasPending) {
          // Confirmed - start polling
          startPolling()
        } else {
          // No pending question, clear flag and stop loading
          setIsLoading(false)
          if (typeof window !== 'undefined') {
            localStorage.removeItem(thinkingFlagKey)
          }
        }
      })
    } else {
      // No thinking flag, check backend once to be sure
      checkPendingQuestion(sessionId).then((hasPending: boolean) => {
        if (hasPending) {
          setIsLoading(true)
          startPolling()
        } else {
          setIsLoading(false)
        }
      })
    }

    return () => {
      stopPolling()
      if (checkPendingTimeoutRef.current) {
        clearTimeout(checkPendingTimeoutRef.current)
      }
    }
  }, [sessionId, checkPendingQuestion, tabId, thinkingFlagKey, startPolling, stopPolling])

  // Cleanup when PDF file changes (not when just switching tabs) or component unmounts
  // Only clear thinking flag when the actual PDF file changes, not when tabId changes
  const prevPdfNameRef = useRef<string | null>(null)
  useEffect(() => {
    const currentPdfName = pdfFile?.name || null
    
    // Only cleanup if PDF file actually changed (not just tab switch)
    if (prevPdfNameRef.current !== null && prevPdfNameRef.current !== currentPdfName) {
      // PDF file changed - clear thinking flag for the old PDF
      const oldThinkingFlagKey = `chat_thinking_${prevPdfNameRef.current}_${tabId || ''}`
      if (typeof window !== 'undefined') {
        localStorage.removeItem(oldThinkingFlagKey)
      }
    }
    
    prevPdfNameRef.current = currentPdfName
    
    return () => {
      // Only cleanup on unmount, not on every render
      // This ensures we don't clear thinking flag when just switching tabs
      stopPolling()
    }
  }, [pdfFile?.name, tabId, stopPolling])

  const askQuestion = async (question: string) => {
    if (isPipelineReady === false) {
      toast({
        title: "Preparing documentsΓÇª",
        description: "We're still processing and indexing your PDF. Please wait a moment.",
      })
      return
    }

    if (!question.trim()) return

    let currentSessionId = sessionId

    // Create session if none exists
    if (!currentSessionId) {
      try {
        currentSessionId = await createNewSession()
      } catch (error: any) {
        toast({
          title: "Failed to start chat",
          description: error?.message || "Please try again",
          variant: "destructive",
        })
        return
      }
    }

    setIsLoading(true)
    pendingQuestionRef.current = question // Track pending question
    
    // Set thinking flag in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(thinkingFlagKey, 'true')
    }
    
    // Start polling to check when answer arrives
    startPolling()

    try {
      const response = await fetch("/api/chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: currentSessionId,
          question,
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

      if (data.error) {
        throw new Error(data.details || data.error || "Backend service unavailable")
      }

      // Clear pending question and thinking flag since we got the answer
      pendingQuestionRef.current = null
      if (typeof window !== 'undefined') {
        localStorage.removeItem(thinkingFlagKey)
      }
      stopPolling() // Stop polling since we got the answer

      const messageId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const newMessage: QAMessage = {
        id: messageId,
        question,
        answer: data.answer,
        context: undefined,
        cited_sections: data.cited_sections,
        confidence: data.confidence,
        timestamp: new Date(),
      }

      addMessage(newMessage)
      
      // Reload messages from MongoDB to ensure consistency
      if (reloadMessages) {
        // Small delay to ensure backend has saved the message
        setTimeout(() => {
          reloadMessages().catch((err: any) => {
            console.warn("[Chat] Failed to reload messages after adding new message:", err)
          })
        }, 500)
      }
      
      // Set loading to false immediately since we got the answer
      setIsLoading(false)
      return newMessage
    } catch (error: any) {
      console.error("[Chat] Error:", error)
      pendingQuestionRef.current = null // Clear pending on error
      setIsLoading(false) // Stop loading on error
      stopPolling() // Stop polling on error
      // Clear thinking flag on error
      if (typeof window !== 'undefined') {
        localStorage.removeItem(thinkingFlagKey)
      }
      toast({
        title: "Failed to get answer",
        description: error.message || "There was an error processing your question.",
        variant: "destructive",
      })
    }
  }

  // Function to clear thinking state (called when chat is cleared or PDF is deleted)
  const clearThinkingState = useCallback(() => {
    pendingQuestionRef.current = null
    setIsLoading(false)
    stopPolling()
    if (typeof window !== 'undefined') {
      localStorage.removeItem(thinkingFlagKey)
    }
  }, [thinkingFlagKey, stopPolling])

  return {
    isLoading,
    askQuestion,
    clearThinkingState,
  }
}
