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

export const convertBackendMessagesToQAMessages = (backendMessages: any[]): QAMessage[] => {
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

export function useQAMessages({ pdfFile: _pdfFile, tabId, sessionId }: UseQAMessagesProps) {
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const currentSessionIdRef = useRef<string | null>(null)

  const loadMessages = useCallback(async () => {
    if (!sessionId) {
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
    
    setIsLoading(true)
    try {
      currentSessionIdRef.current = sessionId

      // Fetch messages from backend API
      const response = await fetch(`/api/chat/sessions?session_id=${sessionId}`)
      
      if (!response.ok) {
        if (response.status === 404) {
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
        }
      } else {
        // No messages in session - try to restore from cache
        if (currentSessionIdRef.current === sessionId) {
          setMessages([])
          setShowHistory(false)
        }
      }
    } catch (error) {
      console.warn(`[QAMessages:${tabId}] Failed to load messages from backend:`, error)
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, tabId])

  const addMessage = (newMessage: QAMessage) => {
    const updatedMessages = [...messages, newMessage]
    setMessages(updatedMessages)
    setShowHistory(true)
    return updatedMessages
  }

  const clearMessages = () => {
    setMessages([])
    setShowHistory(false)
  }

  // Load messages when sessionId changes
  useLayoutEffect(() => {
    if (!sessionId) {
      setMessages([])
      setShowHistory(false)
      currentSessionIdRef.current = null
      return
    }

    if (currentSessionIdRef.current !== sessionId) {
      currentSessionIdRef.current = sessionId
    }

    loadMessages()
  }, [sessionId, loadMessages, tabId])

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