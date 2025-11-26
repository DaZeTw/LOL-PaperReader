"use client"

import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"

import { useAuth } from "@/hooks/useAuth"

export function LoginButton() {
  const { login } = useAuth()

  return (
    <Button
      onClick={() => login()}
      variant="outline"
      className="gap-2"
      type="button"
    >
      <Mail className="h-4 w-4" />
      Sign in with Google
    </Button>
  )
}
