"use client"

import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"

export function LoginButton() {
  return (
    <Button
      onClick={() => signIn("google", { callbackUrl: "/" })}
      variant="outline"
      className="gap-2"
    >
      <Mail className="h-4 w-4" />
      Sign in with Google
    </Button>
  )
}

