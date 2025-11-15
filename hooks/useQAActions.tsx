import { useState } from 'react'
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
  createNewSession: () => Promise<string>
}

export function useQAActions({ 
  sessionId, 
  pdfFile, 
  tabId, 
  isPipelineReady, 
  addMessage, 
  createNewSession 
}: UseQAActionsProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const askQuestion = async (question: string) => {
    if (isPipelineReady === false) {
      toast({
        title: "Preparing documents…",
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
      return newMessage
    } catch (error: any) {
      console.error("[Chat] Error:", error)
      toast({
        title: "Failed to get answer",
        description: error.message || "There was an error processing your question.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isLoading,
    askQuestion,
  }
}