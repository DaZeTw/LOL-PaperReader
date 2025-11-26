"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { FileText, LogIn, BookOpen, Search, Sparkles } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"

interface HomepageProps {
  onGetStarted?: () => void
  isAuthenticated?: boolean
}

/**
 * Homepage component shown when no PDFs are loaded
 * Provides an overview of features and call-to-action
 */
export function Homepage({ onGetStarted, isAuthenticated = false }: HomepageProps) {
  const [mounted, setMounted] = useState(false)
  const { login } = useAuth()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Automatically redirect to workspace when authenticated
  useEffect(() => {
    if (mounted && isAuthenticated) {
      onGetStarted?.()
    }
  }, [mounted, isAuthenticated, onGetStarted])

  const handleGetStarted = () => {
    login()
  }

  // Prevent hydration mismatch by not rendering dynamic content until mounted
  if (!mounted) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20 p-8">
        <div className="mx-auto max-w-4xl space-y-8 text-center">
          <div className="space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg">
              <FileText className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Welcome to Scholar Reader
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Your intelligent PDF reading companion. Analyze research papers, extract citations, and chat with your
              documents using AI.
            </p>
          </div>
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    )
  }

  // Show loading if authenticated (will auto-redirect)
  if (isAuthenticated) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20 p-8">
        <div className="mx-auto max-w-4xl space-y-8 text-center">
          <div className="space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg animate-pulse">
              <FileText className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Welcome to Scholar Reader
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Redirecting to workspace...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20 p-8">
      <div className="mx-auto max-w-4xl space-y-8 text-center">
        {/* Hero Section */}
        <div className="space-y-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <FileText className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Welcome to Scholar Reader
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Your intelligent PDF reading companion. Analyze research papers, extract citations, and chat with your
            documents using AI.
          </p>
        </div>

        {/* CTA Button */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Please sign in to upload and analyze PDF documents
          </p>
          <Button
            size="lg"
            onClick={handleGetStarted}
            className="gap-2 px-8 py-6 text-lg shadow-lg transition-transform hover:scale-105"
          >
            <LogIn className="h-5 w-5" />
            Sign in to Get Started
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid gap-6 pt-8 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="border-2 transition-colors hover:border-primary/50">
            <CardHeader>
              <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Multi-Tab Reading</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Open multiple PDFs simultaneously and switch between them with ease. Perfect for comparative research.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="border-2 transition-colors hover:border-primary/50">
            <CardHeader>
              <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Search className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Citation Extraction</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Automatically detect and extract citations from your papers. Navigate references with a single click.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="border-2 transition-colors hover:border-primary/50">
            <CardHeader>
              <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-lg">AI Q&A</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Ask questions about your documents and get intelligent answers powered by advanced AI.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="pt-8 text-sm text-muted-foreground">
          <p>Powered by advanced AI technology for research and learning</p>
        </div>
      </div>
    </div>
  )
}