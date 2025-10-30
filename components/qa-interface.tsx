"use client"

import type React from "react"

import { useState } from "react"
import { Send, Loader2, X, Sparkles, History, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"

interface QAInterfaceProps {
  pdfFile: File
  onHighlight?: (text: string | null) => void
  onClose?: () => void
  onNewMessage?: (question: string, answer: string) => void
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

export function QAInterface({ pdfFile, onHighlight, onClose, onNewMessage }: QAInterfaceProps) {
  const [question, setQuestion] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const { toast } = useToast()

  const suggestedQuestions = [
    "What is the main finding?",
    "Who are the authors?",
    "What methodology was used?",
    "What are the key conclusions?",
  ]

  const handleAskQuestion = async () => {
    if (!question.trim()) return

    setIsLoading(true)
    const currentQuestion = question
    setQuestion("")

    try {
      const response = await fetch("/api/qa/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: currentQuestion,
          filename: pdfFile.name,
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

      const newMessage: QAMessage = {
        id: Date.now().toString(),
        question: currentQuestion,
        answer: data.answer,
        context: data.context,
        cited_sections: data.cited_sections,
        confidence: data.confidence,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, newMessage])
      setShowHistory(true)

      // Notify parent of new Q&A message
      if (onNewMessage) {
        onNewMessage(currentQuestion, data.answer)
      }
    } catch (error: any) {
      console.error("[QA] Error:", error)
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

  const handleClearHistory = () => {
    setMessages([])
    setShowHistory(false)
    toast({
      title: "History cleared",
      description: "All Q&A history has been cleared",
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-4xl rounded-b-none border-x-0 border-b-0 border-t-2 border-primary/20 bg-card shadow-2xl">
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
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex max-h-[70vh] flex-col">
          {/* History Section */}
          {showHistory && messages.length > 0 && (
            <ScrollArea className="flex-1 border-b border-border">
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
                      <p className="font-mono text-sm leading-relaxed text-foreground">{message.answer}</p>

                      {/* Citations from backend */}
                      {message.cited_sections && message.cited_sections.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="font-mono text-xs font-medium text-muted-foreground">
                            Sources ({message.cited_sections.length}):
                          </p>
                          <div className="space-y-2">
                            {message.cited_sections.map((section, idx) => (
                              <div
                                key={idx}
                                className="rounded-md border border-accent/30 bg-accent/5 p-2.5 text-xs"
                              >
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="font-mono font-medium text-primary">[{idx + 1}]</span>
                                  <span className="font-mono font-medium text-foreground">
                                    {section.title || "Document"}
                                  </span>
                                  {section.page !== undefined && (
                                    <span className="font-mono text-muted-foreground">(p. {section.page})</span>
                                  )}
                                </div>
                                {section.excerpt && (
                                  <p className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">
                                    {section.excerpt.substring(0, 300)}
                                    {section.excerpt.length > 300 ? "..." : ""}
                                  </p>
                                )}
                              </div>
                            ))}
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
            </ScrollArea>
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

            {/* Input Field */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask anything about this document..."
                  disabled={isLoading}
                  className="h-12 resize-none border-2 font-mono text-sm shadow-sm focus:border-primary"
                />
              </div>
              <Button
                onClick={handleAskQuestion}
                disabled={isLoading || !question.trim()}
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
      </Card>
    </div>
  )
}
