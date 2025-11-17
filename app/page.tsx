"use client"

import { Homepage } from "@/components/homepage"
import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { useSession } from "next-auth/react"

const PDFWorkspace = dynamic(() => import("@/components/pdf-workspace").then(mod => ({ default: mod.PDFWorkspace })), {
  ssr: false,
})

export default function Home() {
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const { data: session, status } = useSession()

  // Handle hydration
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const handleGetStarted = () => {
    setShowWorkspace(true)
  }

  // Don't render anything until hydrated to prevent mismatch
  if (!isHydrated) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Don't render until session status is determined
  if (status === "loading") {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (showWorkspace) {
    return <PDFWorkspace />
  }

  return (
    <Homepage 
      onGetStarted={handleGetStarted} 
      isAuthenticated={!!session} 
    />
  )
}