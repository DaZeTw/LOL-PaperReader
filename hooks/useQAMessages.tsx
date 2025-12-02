import { useState, useLayoutEffect, useEffect, useCallback, useRef } from 'react'

interface QAMessage {
  id: string
  question: string
  answer: string
  context?: string
  cited_sections?: any[]
  confidence?: number
  timestamp: Date
}

interface UseQAMessagesProps {
  pdfFile: File
  tabId?: string
  sessionId: string | null
}

const convertBackendMessagesToQAMessages = (backendMessages: any[]): QAMessage[] => {
  // Backend messages are in format: [{role: "user", content: "...", metadata: {...}}, {role: "assistant", content: "...", metadata: {...}}, ...]
  // Frontend QAMessages are in format: [{id, question, answer, cited_sections, timestamp, ...}, ...]
  const qaMessages: QAMessage[] = []
  
  for (let i = 0; i < backendMessages.length; i++) {
    const message = backendMessages[i]
    
    if (message.role === "user") {
      // Find the next assistant message as the answer
      const assistantMessage = backendMessages[i + 1]
      
      if (assistantMessage && assistantMessage.role === "assistant") {
        const messageId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        const qaMessage: QAMessage = {
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

export function useQAMessages({ pdfFile, tabId, sessionId }: UseQAMessagesProps) {
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const currentSessionIdRef = useRef<string | null>(null)
  
  // Storage key for messages cache per tab
  const uniqueKey = tabId ? `${pdfFile?.name || ''}_${tabId}` : (pdfFile?.name || '')
  const messagesCacheKey = `chat_messages_${uniqueKey}`

  // Helper function to restore messages from cache with proper Date conversion
  const restoreFromCache = useCallback((): QAMessage[] | null => {
    if (typeof window === 'undefined') return null
    try {
      const cached = localStorage.getItem(messagesCacheKey)
      if (cached) {
        const cachedMessages = JSON.parse(cached)
        if (Array.isArray(cachedMessages) && cachedMessages.length > 0) {
          // Convert timestamp strings back to Date objects
          const restoredMessages = cachedMessages.map((msg: any) => ({
            ...msg,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          }))
          console.log(`[QAMessages:${tabId}] Restored ${restoredMessages.length} messages from cache`)
          return restoredMessages
        }
      }
    } catch (e) {
      console.warn(`[QAMessages:${tabId}] Failed to restore from cache:`, e)
    }
    return null
  }, [messagesCacheKey, tabId])

  const loadMessages = useCallback(async () => {
    if (!sessionId) {
      // Try to restore from cache when sessionId is null (e.g., during tab switch)
      const cachedMessages = restoreFromCache()
      if (cachedMessages) {
        setMessages(cachedMessages)
        setShowHistory(true)
        return
      }
      setMessages([])
      setShowHistory(false)
      currentSessionIdRef.current = null
      return
    }

    // If sessionId changed, try to restore from cache first before clearing
    if (currentSessionIdRef.current && currentSessionIdRef.current !== sessionId) {
      console.log(`[QAMessages:${tabId}] Session changed, checking cache. Old: ${currentSessionIdRef.current}, New: ${sessionId}`)
      // Don't clear immediately - wait for backend response
    }
    
    currentSessionIdRef.current = sessionId

    setIsLoading(true)
    try {
      // Fetch messages from backend API
      const response = await fetch(`/api/chat/sessions?session_id=${sessionId}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          // Session not found, try cache first
          const cachedMessages = restoreFromCache()
          if (cachedMessages) {
            console.log(`[QAMessages:${tabId}] Session not found, restored ${cachedMessages.length} messages from cache`)
            setMessages(cachedMessages)
            setShowHistory(true)
            setIsLoading(false)
            return
          }
          // No cache, clear messages
          console.log(`[QAMessages:${tabId}] Session not found, clearing messages`)
          setMessages([])
          setShowHistory(false)
          return
        }
        throw new Error(`Failed to fetch messages: ${response.status}`)
      }

      const sessionData = await response.json()
      const backendMessages = sessionData.messages && Array.isArray(sessionData.messages) ? sessionData.messages : []
      
      if (backendMessages.length > 0) {
        const qaMessages = convertBackendMessagesToQAMessages(backendMessages)
        console.log(`[QAMessages:${tabId}] Loaded ${qaMessages.length} messages from MongoDB for session ${sessionId}`)
        
        // Only update if we're still on the same session
        if (currentSessionIdRef.current === sessionId) {
          setMessages(qaMessages)
          setShowHistory(qaMessages.length > 0)
          // Cache messages for this tab
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(messagesCacheKey, JSON.stringify(qaMessages))
            } catch (e) {
              console.warn(`[QAMessages:${tabId}] Failed to cache messages:`, e)
            }
          }
        }
      } else {
        // No messages in session - try to restore from cache
        if (currentSessionIdRef.current === sessionId) {
          const cachedMessages = restoreFromCache()
          if (cachedMessages) {
            console.log(`[QAMessages:${tabId}] No backend messages, restored ${cachedMessages.length} from cache`)
            setMessages(cachedMessages)
            setShowHistory(true)
            setIsLoading(false)
            return
          }
          // No cache, keep existing messages if any
          setMessages((prevMessages) => {
            if (prevMessages.length === 0) {
              setShowHistory(false)
            }
            return prevMessages
          })
        }
      }
    } catch (error) {
      console.warn(`[QAMessages:${tabId}] Failed to load messages from backend:`, error)
      // On error, try to restore from cache
      const cachedMessages = restoreFromCache()
      if (cachedMessages) {
        console.log(`[QAMessages:${tabId}] Error loading, restored ${cachedMessages.length} from cache`)
        setMessages(cachedMessages)
        setShowHistory(true)
        setIsLoading(false)
        return
      }
      // No cache, keep existing messages if session didn't change
      if (currentSessionIdRef.current !== sessionId) {
        setMessages([])
        setShowHistory(false)
      }
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, tabId, messagesCacheKey, restoreFromCache])

  const addMessage = (newMessage: QAMessage) => {
    const updatedMessages = [...messages, newMessage]
    setMessages(updatedMessages)
    setShowHistory(true)
    // Cache messages to localStorage for persistence when switching tabs
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(messagesCacheKey, JSON.stringify(updatedMessages))
      } catch (e) {
        console.warn(`[QAMessages:${tabId}] Failed to cache messages:`, e)
      }
    }
    return updatedMessages
  }

  const clearMessages = () => {
    setMessages([])
    setShowHistory(false)
    // Clear cache when messages are cleared
    if (typeof window !== 'undefined') {
      localStorage.removeItem(messagesCacheKey)
    }
  }

  // Load messages when sessionId changes
  useLayoutEffect(() => {
    // When sessionId changes, try to restore from cache first to prevent flicker
    if (currentSessionIdRef.current !== sessionId) {
      const cachedMessages = restoreFromCache()
      if (cachedMessages) {
        console.log(`[QAMessages:${tabId}] Restoring ${cachedMessages.length} messages from cache during session change`)
        setMessages(cachedMessages)
        setShowHistory(true)
        // Still load from backend to sync, but don't clear UI
      } else if (sessionId === null) {
        // No sessionId and no cache, clear messages
        setMessages([])
        setShowHistory(false)
      }
    }
    // Then load messages for the new session (will update if different from cache)
    if (sessionId) {
      loadMessages()
    } else {
      // No sessionId, try cache (already done above)
      loadMessages()
    }
  }, [sessionId, loadMessages, restoreFromCache, tabId])

  // Auto-show history when messages exist
  useEffect(() => {
    if (messages.length > 0 && !showHistory) {
      setShowHistory(true)
    }
  }, [messages.length])

  return {
    messages,
    showHistory,
    setShowHistory,
    addMessage,
    clearMessages,
    loadMessages,
    isLoading,
  }
}