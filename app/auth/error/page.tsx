"use client"

import { useRouter, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"

export default function AuthErrorPage() {
  const params = useSearchParams()
  const router = useRouter()

  const rawMessage = params.get("message") ?? "Authentication failed. Please try again."
  const message = rawMessage.replace(/\+/g, " ")

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">Sign-in Error</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button
          onClick={() => router.push("/")}
          className="w-full"
          type="button"
        >
          Back to homepage
        </Button>
      </div>
    </div>
  )
}

