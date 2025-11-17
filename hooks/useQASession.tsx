import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'

interface UseQASessionProps {
  pdfFile: File
  tabId?: string
}

export function useQASession({ pdfFile, tabId }: UseQASessionProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [messagesLoaded, setMessagesLoaded] = useState(false) // Track if messages were loaded from backend
  const { toast } = useToast()
  const clearedSessionIdsRef = useRef<Set<string>>(new Set())

  // Storage keys
  const uniqueKey = tabId ? `${pdfFile?.name || ''}_${tabId}` : (pdfFile?.name || '')
  const storageKey = `chat_session_${uniqueKey}`
  const messagesStorageKey = `chat_messages_${uniqueKey}`
  const clearedFlagKey = `chat_cleared_${uniqueKey}` // Flag to track if session was cleared

  const convertBackendMessagesToQAMessages = (backendMessages: any[]): any[] => {
    // Backend messages are in format: [{role: "user", content: "...", metadata: {...}}, {role: "assistant", content: "...", metadata: {...}}, ...]
    // Frontend QAMessages are in format: [{id, question, answer, cited_sections, timestamp, ...}, ...]
    const qaMessages: any[] = []
    
    for (let i = 0; i < backendMessages.length; i++) {
      const message = backendMessages[i]
      
      if (message.role === "user") {
        // Find the next assistant message as the answer
        const assistantMessage = backendMessages[i + 1]
        
        if (assistantMessage && assistantMessage.role === "assistant") {
          const messageId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
          const qaMessage = {
            id: messageId,
            question: message.content,
            answer: assistantMessage.content,
            context: undefined,
            cited_sections: assistantMessage.metadata?.cited_sections || assistantMessage.metadata?.citations || [],
            confidence: assistantMessage.metadata?.confidence,
            timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
          }
          qaMessages.push(qaMessage)
          i++ // Skip the assistant message as we've already processed it
        }
      }
    }
    
    return qaMessages
  }

  const createNewSession = async (forceNew = false, retryCount = 0, maxRetries = 2) => {
    try {
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: null,
          title: `Chat: ${pdfFile.name}`,
          initial_message: null,
          force_new: forceNew, // Pass force_new flag to backend
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.details || errorData.error || `HTTP ${response.status}: Failed to create session`
        
        if ((response.status === 504 || response.status === 503) && retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 5000)
          await new Promise(resolve => setTimeout(resolve, delay))
          return createNewSession(forceNew, retryCount + 1, maxRetries)
        }
        
        throw new Error(errorMessage)
      }

      const sessionData = await response.json()
      const newSessionId = sessionData.session_id
      
      // If session has existing messages, convert and save them to localStorage
      if (sessionData.messages && Array.isArray(sessionData.messages) && sessionData.messages.length > 0) {
        console.log(`[Chat] Found existing session with ${sessionData.messages.length} messages, loading them...`)
        const qaMessages = convertBackendMessagesToQAMessages(sessionData.messages)
        
        if (qaMessages.length > 0 && typeof window !== 'undefined') {
          // Save messages to localStorage
          const serializedMessages = qaMessages.map((msg) => ({
            ...msg,
            timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
          }))
          localStorage.setItem(messagesStorageKey, JSON.stringify(serializedMessages))
          console.log(`[Chat] Loaded ${qaMessages.length} messages from existing session`)
          // Trigger a custom event to notify useQAMessages to reload
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('chatMessagesLoaded', { detail: { messagesStorageKey } }))
          }
          setMessagesLoaded(true)
        }
      }
      
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, newSessionId)
      }
      setSessionId(newSessionId)
      return newSessionId
    } catch (error) {
      console.error("[Chat] Failed to create session:", error)
      throw error
    }
  }

  const clearSession = async () => {
    const oldSessionId = sessionId
    if (oldSessionId) {
      clearedSessionIdsRef.current.add(oldSessionId)
    }

    setSessionId(null)
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem(storageKey)
      localStorage.removeItem(messagesStorageKey)
      // Set flag to indicate session was cleared - this ensures new session is created when PDF is re-uploaded
      localStorage.setItem(clearedFlagKey, 'true')
    }

    if (oldSessionId) {
      try {
        await fetch(`/api/chat/sessions/${oldSessionId}`, { method: "DELETE" })
      } catch (error) {
        console.warn("[Chat] Error deleting session:", error)
      }
    }

    // Wait a bit to ensure DELETE completes before creating new session
    await new Promise(resolve => setTimeout(resolve, 100))

    return createNewSession(true) // Pass force_new flag
  }

  useEffect(() => {
    if (!pdfFile?.name) return

    const initializeSession = async () => {
      try {
        let savedSessionId = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
        const wasCleared = typeof window !== 'undefined' ? localStorage.getItem(clearedFlagKey) === 'true' : false
        
        if (savedSessionId && clearedSessionIdsRef.current.has(savedSessionId)) {
          savedSessionId = null
          if (typeof window !== 'undefined') {
            localStorage.removeItem(storageKey)
          }
        }

        // If session was cleared, always create new session with force_new=true
        if (wasCleared) {
          console.log("[Chat] Session was cleared previously, creating new session with force_new=true")
          if (typeof window !== 'undefined') {
            localStorage.removeItem(clearedFlagKey) // Clear the flag after using it
          }
          await createNewSession(true) // Force new session
          return
        }

        if (savedSessionId) {
          setSessionId(savedSessionId)
          // Verify session exists and load messages if available
          try {
            const response = await fetch(`/api/chat/sessions?session_id=${savedSessionId}`)
            if (!response.ok && response.status === 404) {
              await createNewSession()
            } else if (response.ok) {
              // Session exists, check if it has messages and load them
              const sessionData = await response.json()
              if (sessionData.messages && Array.isArray(sessionData.messages) && sessionData.messages.length > 0) {
                // Check if messages are already in localStorage
                const existingMessages = typeof window !== 'undefined' ? localStorage.getItem(messagesStorageKey) : null
                if (!existingMessages || existingMessages.trim() === '[]') {
                  // Load messages from backend session
                  console.log(`[Chat] Loading ${sessionData.messages.length} messages from existing session`)
                  const qaMessages = convertBackendMessagesToQAMessages(sessionData.messages)
                  if (qaMessages.length > 0 && typeof window !== 'undefined') {
                    const serializedMessages = qaMessages.map((msg) => ({
                      ...msg,
                      timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
                    }))
                    localStorage.setItem(messagesStorageKey, JSON.stringify(serializedMessages))
                    console.log(`[Chat] Loaded ${qaMessages.length} messages from existing session`)
                    // Trigger a custom event to notify useQAMessages to reload
                    window.dispatchEvent(new CustomEvent('chatMessagesLoaded', { detail: { messagesStorageKey } }))
                    setMessagesLoaded(true)
                  }
                }
              }
            }
          } catch (error) {
            console.warn("[Chat] Error verifying session:", error)
          }
        } else {
          await createNewSession()
        }
      } catch (error: any) {
        console.error("[Chat] Failed to initialize session:", error)
        toast({
          title: "Session initialization failed",
          description: error?.message || "Chat may not work properly",
          variant: "destructive",
        })
      } finally {
        setIsInitializing(false)
      }
    }

    initializeSession()
  }, [pdfFile?.name, tabId])

  return {
    sessionId,
    isInitializing,
    storageKey,
    messagesStorageKey,
    messagesLoaded,
    createNewSession,
    clearSession,
  }
}