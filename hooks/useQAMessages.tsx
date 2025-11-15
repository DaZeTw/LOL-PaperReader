import { useState, useLayoutEffect, useEffect } from 'react'

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
  messagesStorageKey: string
}

export function useQAMessages({ pdfFile, tabId, messagesStorageKey }: UseQAMessagesProps) {
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const loadMessages = () => {
    if (!pdfFile?.name || typeof window === 'undefined') return

    try {
      let savedMessages = localStorage.getItem(messagesStorageKey)
      
      // Fallback for backward compatibility
      if ((!savedMessages || savedMessages.trim() === '[]') && tabId) {
        savedMessages = localStorage.getItem(`chat_messages_${pdfFile.name}`)
      }
      
      if (savedMessages && savedMessages.trim() !== '[]') {
        const parsedMessages = JSON.parse(savedMessages)
        if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
          const restoredMessages = parsedMessages.map((msg: any) => ({
            ...msg,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          }))
          setMessages(restoredMessages)
          setShowHistory(true)
          return restoredMessages
        }
      }
    } catch (error) {
      console.warn("[Chat] Failed to load messages:", error)
    }
    
    setMessages([])
    setShowHistory(false)
    return []
  }

  const saveMessages = (messagesToSave: QAMessage[]) => {
    if (typeof window === 'undefined') return
    
    try {
      const serializedMessages = messagesToSave.map((msg) => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
      }))
      localStorage.setItem(messagesStorageKey, JSON.stringify(serializedMessages))
    } catch (error) {
      console.warn("[Chat] Failed to save messages:", error)
    }
  }

  const addMessage = (newMessage: QAMessage) => {
    const updatedMessages = [...messages, newMessage]
    setMessages(updatedMessages)
    setShowHistory(true)
    saveMessages(updatedMessages)
    return updatedMessages
  }

  const clearMessages = () => {
    setMessages([])
    setShowHistory(false)
    if (typeof window !== 'undefined') {
      localStorage.removeItem(messagesStorageKey)
    }
  }

  // Load messages on mount and when dependencies change
  useLayoutEffect(() => {
    loadMessages()
  }, [pdfFile?.name, tabId, messagesStorageKey])

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
  }
}