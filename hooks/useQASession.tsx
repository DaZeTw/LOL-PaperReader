import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'

interface UseQASessionProps {
  pdfFile: File
  tabId?: string
}

export function useQASession({ pdfFile, tabId }: UseQASessionProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const { toast } = useToast()
  const clearedSessionIdsRef = useRef<Set<string>>(new Set())

  // Storage keys
  const uniqueKey = tabId ? `${pdfFile?.name || ''}_${tabId}` : (pdfFile?.name || '')
  const storageKey = `chat_session_${uniqueKey}`
  const messagesStorageKey = `chat_messages_${uniqueKey}`

  const createNewSession = async (retryCount = 0, maxRetries = 2) => {
    try {
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: null,
          title: `Chat: ${pdfFile.name}`,
          initial_message: null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.details || errorData.error || `HTTP ${response.status}: Failed to create session`
        
        if ((response.status === 504 || response.status === 503) && retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 5000)
          await new Promise(resolve => setTimeout(resolve, delay))
          return createNewSession(retryCount + 1, maxRetries)
        }
        
        throw new Error(errorMessage)
      }

      const sessionData = await response.json()
      const newSessionId = sessionData.session_id
      
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
    }

    if (oldSessionId) {
      try {
        await fetch(`/api/chat/sessions/${oldSessionId}`, { method: "DELETE" })
      } catch (error) {
        console.warn("[Chat] Error deleting session:", error)
      }
    }

    return createNewSession()
  }

  useEffect(() => {
    if (!pdfFile?.name) return

    const initializeSession = async () => {
      try {
        let savedSessionId = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
        
        if (savedSessionId && clearedSessionIdsRef.current.has(savedSessionId)) {
          savedSessionId = null
          if (typeof window !== 'undefined') {
            localStorage.removeItem(storageKey)
          }
        }

        if (savedSessionId) {
          setSessionId(savedSessionId)
          // Verify session exists
          try {
            const response = await fetch(`/api/chat/sessions?session_id=${savedSessionId}`)
            if (!response.ok && response.status === 404) {
              await createNewSession()
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
    createNewSession,
    clearSession,
  }
}