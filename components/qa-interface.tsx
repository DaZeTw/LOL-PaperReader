"use client"

import type React from "react"

import { useState } from "react"
import { Send, Loader2, X, MessageSquare, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"

interface QAInterfaceProps {
  pdfFile: File
  onHighlight?: (text: string | null) => void
}

interface QAMessage {
  id: string
  question: string
  answer: string
  context?: string
  timestamp: Date
}

export function QAInterface({ pdfFile, onHighlight }: QAInterfaceProps) {
  const [question, setQuestion] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [showOverlay, setShowOverlay] = useState(false)
  const { toast } = useToast()

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
        throw new Error("Failed to get answer")
      }

      const data = await response.json()

      const newMessage: QAMessage = {
        id: Date.now().toString(),
        question: currentQuestion,
        answer: data.answer,
        context: data.context,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, newMessage])
      setShowOverlay(true)
    } catch (error) {
      console.error("[v0] QA error:", error)
      toast({
        title: "Failed to get answer",
        description: "There was an error processing your question",
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

  return (
    <>
      <div className="border-t-2 border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5 px-4 py-4 shadow-lg">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-mono text-sm font-medium text-foreground">Ask Questions About This Document</h3>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowOverlay(true)} className="ml-auto gap-2 text-xs">
                <MessageSquare className="h-3 w-3" />
                View {messages.length} {messages.length === 1 ? "Answer" : "Answers"}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="e.g., What is the main finding? Who are the authors?"
                disabled={isLoading}
                className="h-12 border-2 pr-10 font-mono text-sm shadow-sm"
              />
            </div>
            <Button
              onClick={handleAskQuestion}
              disabled={isLoading || !question.trim()}
              size="lg"
              className="h-12 gap-2 px-6"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Asking...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Ask</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {showOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="relative mx-4 w-full max-w-3xl border-2 border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border bg-primary/5 px-6 py-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h2 className="font-mono text-lg font-medium text-foreground">Q&A History</h2>
                <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-xs text-primary-foreground">
                  {messages.length}
                </span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowOverlay(false)} className="h-8 w-8">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>

            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-6 p-6">
                {messages.length === 0 ? (
                  <div className="py-12 text-center">
                    <MessageSquare className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                    <p className="font-mono text-sm text-muted-foreground">No questions asked yet</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className="space-y-3">
                      <div>
                        <p className="mb-1 font-mono text-xs text-muted-foreground">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                        <div className="rounded-lg bg-primary/10 px-4 py-3">
                          <p className="font-mono text-sm font-medium text-foreground">{message.question}</p>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                        <p className="mb-2 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Answer
                        </p>
                        <p className="font-mono text-sm leading-relaxed text-foreground">{message.answer}</p>
                      </div>

                      {message.context && (
                        <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Retrieved Context
                            </p>
                            {onHighlight && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onHighlight(message.context || null)}
                                className="h-6 gap-1 px-2 text-xs"
                              >
                                Highlight in PDF
                              </Button>
                            )}
                          </div>
                          <p className="font-mono text-xs leading-relaxed text-muted-foreground">{message.context}</p>
                        </div>
                      )}

                      {message.id !== messages[messages.length - 1].id && (
                        <div className="border-t border-border pt-6" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>
      )}
    </>
  )
}
