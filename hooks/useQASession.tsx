import { useState, useEffect, useRef, useMemo } from 'react'
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
  const prevPdfNameRef = useRef<string | null>(null)

  // Storage keys
  const uniqueKey = tabId ? `${pdfFile?.name || ''}_${tabId}` : (pdfFile?.name || '')
  const storageKey = `chat_session_${uniqueKey}`
  const clearedFlagKey = `chat_cleared_${uniqueKey}` // Flag to track if session was cleared
  const pdfFileName = pdfFile?.name || ''
  const pdfBaseName = useMemo(() => pdfFileName.replace(/\.pdf$/i, ''), [pdfFileName])
  const cacheKeys = useMemo<string[]>(() => {
    const keys = new Set<string>()
    if (uniqueKey) {
      keys.add(`chat_messages_${uniqueKey}`)
    } else {
      keys.add('chat_messages_')
    }
    if (pdfFileName) {
      keys.add(`chat_messages_${pdfFileName}`)
    }
    if (pdfBaseName) {
      keys.add(`chat_messages_${pdfBaseName}`)
    }
    return Array.from(keys)
  }, [uniqueKey, pdfFileName, pdfBaseName])

  const createNewSession = async (forceNew = false, retryCount = 0, maxRetries = 2) => {
    try {
      // Extract document_key from PDF name (remove .pdf extension)
      const documentKey = pdfFile?.name ? pdfFile.name.replace(/\.pdf$/i, '').trim() : null
      
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: null,
          title: `Chat: ${pdfFile.name}`,
          initial_message: null,
          force_new: forceNew, // Pass force_new flag to backend
          document_key: documentKey, // Send document_key so backend can find existing session
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
      
      // Always update localStorage with the session ID (even if it's an existing session)
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, newSessionId)
      }
      setSessionId(newSessionId)
      
      // Messages will be loaded by useQAMessages from MongoDB when sessionId is set
      if (sessionData.messages && Array.isArray(sessionData.messages) && sessionData.messages.length > 0) {
        console.log(`[Chat] Found existing session with ${sessionData.messages.length} messages in MongoDB`)
        setMessagesLoaded(true)
      } else {
        console.log(`[Chat] New session has no messages`)
        setMessagesLoaded(false)
      }
      
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
      // Set flag to indicate session was cleared - this ensures new session is created when PDF is re-uploaded
      localStorage.setItem(clearedFlagKey, 'true')
      // Clear thinking flag when session is cleared
      const thinkingFlagKey = `chat_thinking_${uniqueKey}`
      localStorage.removeItem(thinkingFlagKey)
      // Clear messages cache when session is cleared
      cacheKeys.forEach((key: string) => {
        try {
          localStorage.removeItem(key)
        } catch (error) {
          console.warn(`[Chat] Failed to clear cache key ${key}:`, error)
        }
      })
    }

    // Delete all chat sessions related to this PDF document
    // Extract document_key from PDF file name (remove .pdf extension)
    const documentKey = pdfFile?.name ? pdfFile.name.replace(/\.pdf$/i, '').trim() : null
    
    if (documentKey) {
      try {
        // Delete all sessions for this document
        const response = await fetch(`/api/chat/sessions?document_key=${encodeURIComponent(documentKey)}`, { 
          method: "DELETE" 
        })
        if (response.ok) {
          const result = await response.json()
          console.log(`[Chat] Deleted ${result.deleted || 0} chat sessions for document: ${documentKey}`)
        } else {
          console.warn("[Chat] Failed to delete sessions by document_key:", await response.text())
        }
      } catch (error) {
        console.warn("[Chat] Error deleting sessions by document_key:", error)
      }
    }

    // Also delete the current session if it exists (fallback)
    if (oldSessionId) {
      try {
        await fetch(`/api/chat/sessions/${oldSessionId}`, { method: "DELETE" })
      } catch (error) {
        console.warn("[Chat] Error deleting current session:", error)
      }
    }

    // Wait a bit to ensure DELETE completes before creating new session
    await new Promise(resolve => setTimeout(resolve, 100))

    return createNewSession(true) // Pass force_new flag
  }

  useEffect(() => {
    if (!pdfFile?.name) {
      // Reset state when no PDF
      setSessionId(null)
      setIsInitializing(false)
      prevPdfNameRef.current = null
      return
    }

    // Only reset sessionId when PDF file changes, not when just switching tabs
    // This prevents losing chat history when switching between tabs of the same PDF
    const shouldResetSession = prevPdfNameRef.current !== null && prevPdfNameRef.current !== pdfFile?.name
    prevPdfNameRef.current = pdfFile?.name

    // Reset initialization state when PDF changes (not when just switching tabs)
    setIsInitializing(true)
    if (shouldResetSession) {
      setSessionId(null)
    }

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
              // Session not found, try to find existing session by document or create new
              console.log("[Chat] Saved session not found, checking for existing session by document...")
              await createNewSession(false) // This will find existing session if available
            } else if (response.ok) {
              // Session exists, check if it has messages and load them
              const sessionData = await response.json()
              const backendMessages = sessionData.messages && Array.isArray(sessionData.messages) ? sessionData.messages : []
              
              if (backendMessages.length > 0) {
                // Session has messages in MongoDB - useQAMessages will load them
                console.log(`[Chat] Session has ${backendMessages.length} messages in MongoDB`)
                setMessagesLoaded(true)
              } else {
                // Session exists but has no messages
                console.log(`[Chat] Session exists but has no messages`)
                setMessagesLoaded(false)
              }
            }
          } catch (error) {
            console.warn("[Chat] Error verifying session:", error)
            // On error, try to create/find session
            await createNewSession(false)
          }
        } else {
          // No saved session, try to find existing or create new
          await createNewSession(false)
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
    messagesLoaded,
    createNewSession,
    clearSession,
  }
}
