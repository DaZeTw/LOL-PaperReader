"use client"

import { Homepage } from "@/components/homepage"
import { ActivitySidebar } from "@/components/activity-sidebar"
import { WorkspaceManager } from "@/components/workspace-manager"
import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useChatSync } from "@/hooks/useChatSync"

export default function Home() {
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [currentView, setCurrentView] = useState<'library' | 'pdf'>('library')
  const { user, loading } = useAuth()

  // Ensure local cache syncs with database once per session
  useChatSync()

  // Handle hydration
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // If the user logs out, send them back to the homepage/sign-in screen
  useEffect(() => {
    if (!user) {
      setShowWorkspace(false)
      setCurrentView('library')
    }
  }, [user])

  const handleGetStarted = () => {
    setShowWorkspace(true)
  }

  const handleViewChange = (view: 'library') => {
    setCurrentView(view)
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
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Show homepage for unauthenticated users or before workspace is triggered
  if (!showWorkspace) {
    return (
      <Homepage 
        onGetStarted={handleGetStarted} 
        isAuthenticated={!!user} 
      />
    )
  }

  // Main application layout with ActivitySidebar + WorkspaceManager
  return (
    <div className="flex h-screen bg-background">
      {/* Global Activity Sidebar - Always visible */}
      <ActivitySidebar 
        activeView={currentView}
        onViewChange={handleViewChange}
      />
      
      {/* Main Workspace Area */}
      <div className="flex-1 overflow-hidden">
        <WorkspaceManager 
          currentView={currentView}
          onViewChange={setCurrentView}
        />
      </div>
    </div>
  )
}
