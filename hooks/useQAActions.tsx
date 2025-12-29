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
  documentId: string | null
  tabId?: string
  isPipelineReady: boolean | null
  addMessage: (message: QAMessage) => void
  reloadMessages?: () => Promise<void>
  createNewSession: () => Promise<string>
}

export function useQAActions({ 
  sessionId, 
  pdfFile, 
  documentId,
  tabId, 
  isPipelineReady, 
  addMessage,
  reloadMessages,
  createNewSession 
}: UseQAActionsProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const pendingQuestionRef = useRef<string | null>(null)
  const currentSessionIdRef = useRef<string | null>(null)

  // Storage keys for thinking state
  const baseKey = documentId || pdfFile?.name || ''
  const uniqueKey = tabId ? `${baseKey}_${tabId}` : baseKey
  const thinkingFlagKey = `chat_thinking_${uniqueKey}` // Flag to track if there's a pending question

  // Listen for WebSocket chat status updates
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleChatStatus = (event: CustomEvent) => {
      const { session_id, status, document_id } = event.detail
      
      // Only handle if it's for our session and document
      if (session_id === currentSessionIdRef.current && document_id === documentId) {
        console.log(
          `[QAActions:${tabId}] 💬 Received chat status: session=${session_id}, status=${status}`
        )
        
        if (status === 'answer_ready') {
          // Answer is ready - reload messages and stop loading
          setIsLoading(false)
          pendingQuestionRef.current = null
          
          if (typeof window !== 'undefined') {
            localStorage.removeItem(thinkingFlagKey)
          }
          
          // Reload messages from MongoDB
          if (reloadMessages) {
            reloadMessages().catch((err: any) => {
              console.warn(`[QAActions:${tabId}] Failed to reload messages:`, err)
            })
          }
        }
      }
    }

    window.addEventListener('chat-status', handleChatStatus as EventListener)
    
    return () => {
      window.removeEventListener('chat-status', handleChatStatus as EventListener)
    }
  }, [documentId, tabId, thinkingFlagKey, reloadMessages])

  // Restore thinking state from localStorage when sessionId changes
  useEffect(() => {
    currentSessionIdRef.current = sessionId
    
    if (!sessionId) {
      setIsLoading(false)
      pendingQuestionRef.current = null
      return
    }

    // Restore thinking state immediately from localStorage (for instant UI update)
    const hasThinkingFlag = typeof window !== 'undefined' ? localStorage.getItem(thinkingFlagKey) === 'true' : false
    
    if (hasThinkingFlag) {
      console.log(`[QAActions:${tabId}] Restoring isLoading=true from thinking flag`)
      setIsLoading(true)
    } else {
      setIsLoading(false)
      pendingQuestionRef.current = null
    }
  }, [sessionId, tabId, thinkingFlagKey])

  // Cleanup when PDF file changes
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
  }, [pdfFile?.name, tabId])

  const askQuestion = async (question: string) => {
    if (isPipelineReady === false) {
      toast({
        title: "Preparing documentsΓÇª",
        description: "We're still processing and indexing your PDF. Please wait a moment.",
      })
      return
    }

    if (!question.trim()) return

    // Set loading state IMMEDIATELY for instant UI feedback
    setIsLoading(true)
    pendingQuestionRef.current = question // Track pending question
    
    // Set thinking flag in localStorage immediately
    if (typeof window !== 'undefined') {
      localStorage.setItem(thinkingFlagKey, 'true')
    }

    let currentSessionId = sessionId

    // Ensure we have a valid session before asking a question
    const ensureValidSession = async () => {
      if (!currentSessionId) {
        currentSessionId = await createNewSession()
        return
      }

      try {
        const verifyResp = await fetch(`/api/chat/sessions/${currentSessionId}`)
        if (verifyResp.status === 404) {
          currentSessionId = await createNewSession()
        } else if (!verifyResp.ok) {
          const errorText = await verifyResp.text()
          throw new Error(errorText || `Failed to verify chat session (HTTP ${verifyResp.status})`)
        }
      } catch (error) {
        console.warn("[Chat] Failed to verify existing session, creating a new one:", error)
        currentSessionId = await createNewSession()
      }
    }

    try {
      await ensureValidSession()
    } catch (error: any) {
      // Clear loading state on error
      setIsLoading(false)
      pendingQuestionRef.current = null
      if (typeof window !== 'undefined') {
        localStorage.removeItem(thinkingFlagKey)
      }
      toast({
        title: "Failed to start chat",
        description: error?.message || "Please try again",
        variant: "destructive",
      })
      return
    }

    if (!currentSessionId) {
      setIsLoading(false)
      pendingQuestionRef.current = null
      if (typeof window !== 'undefined') {
        localStorage.removeItem(thinkingFlagKey)
      }
      toast({
        title: "Failed to start chat",
        description: "Could not initialize chat session. Please try again.",
        variant: "destructive",
      })
      return
    }

    // Update current session ref
    currentSessionIdRef.current = currentSessionId

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
      
      // Set loading to false immediately since we got the answer
      // WebSocket will handle reloading messages when answer is ready
      setIsLoading(false)
      
      // Reload messages from MongoDB to ensure consistency
      if (reloadMessages) {
        // Small delay to ensure backend has saved the message
        setTimeout(() => {
          reloadMessages().catch((err: any) => {
            console.warn("[Chat] Failed to reload messages after adding new message:", err)
          })
        }, 500)
      }
      
      return newMessage
    } catch (error: any) {
      console.error("[Chat] Error:", error)
      pendingQuestionRef.current = null // Clear pending on error
      setIsLoading(false) // Stop loading on error
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem(thinkingFlagKey)
    }
  }, [thinkingFlagKey])

  return {
    isLoading,
    askQuestion,
    clearThinkingState,
  }
}
