"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { 
  Library, 
  Settings, 
  RefreshCw, 
  User,
  FileText,
  ChevronRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserMenu } from "@/components/user-menu"
import { LoginButton } from "@/components/login-button"

interface ActivitySidebarProps {
  activeView: 'library' | 'pdf'
  onViewChange: (view: 'library') => void
  syncStatus?: 'idle' | 'syncing' | 'error'
}

export function ActivitySidebar({ 
  activeView, 
  onViewChange, 
  syncStatus = 'idle' 
}: ActivitySidebarProps) {
  const { data: session } = useSession()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const navigationItems = [
    {
      id: 'library',
      label: 'Library',
      icon: Library,
      active: activeView === 'library',
      onClick: () => onViewChange('library'),
      disabled: !session?.user
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      active: false,
      onClick: () => {}, // TODO: Implement settings
      disabled: !session?.user
    }
  ]

  const getSyncIcon = () => {
    switch (syncStatus) {
      case 'syncing':
        return <RefreshCw className="h-4 w-4 animate-spin" />
      case 'error':
        return <RefreshCw className="h-4 w-4 text-destructive" />
      default:
        return <RefreshCw className="h-4 w-4" />
    }
  }

  const getSyncLabel = () => {
    switch (syncStatus) {
      case 'syncing':
        return 'Syncing...'
      case 'error':
        return 'Sync Error'
      default:
        return 'Sync'
    }
  }

  return (
    <div className={cn(
      "flex h-screen flex-col border-r border-border bg-muted/30 transition-all duration-200",
      isCollapsed ? "w-12" : "w-60"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-3">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <FileText className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="font-mono text-sm font-medium">Scholar Reader</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-6 w-6 p-0"
        >
          <ChevronRight className={cn(
            "h-3 w-3 transition-transform",
            isCollapsed ? "rotate-0" : "rotate-180"
          )} />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2">
        <div className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.id}
                variant={item.active ? "secondary" : "ghost"}
                size="sm"
                onClick={item.onClick}
                disabled={item.disabled}
                className={cn(
                  "w-full justify-start gap-2 transition-all",
                  isCollapsed ? "px-2" : "px-3",
                  item.active && "bg-background shadow-sm"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && (
                  <span className="text-sm">{item.label}</span>
                )}
              </Button>
            )
          })}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-border p-2 space-y-2">
        {/* Sync Status */}
        <Button
          variant="ghost"
          size="sm"
          disabled={!session?.user}
          className={cn(
            "w-full justify-start gap-2",
            isCollapsed ? "px-2" : "px-3"
          )}
        >
          {getSyncIcon()}
          {!isCollapsed && (
            <span className="text-sm">{getSyncLabel()}</span>
          )}
        </Button>

        {/* Theme Toggle */}
        <div className={cn(
          "flex justify-center",
          !isCollapsed && "justify-start px-3"
        )}>
          <ThemeToggle />
        </div>

        {/* User Section */}
        <div className={cn(
          "flex items-center",
          isCollapsed ? "justify-center" : "px-3"
        )}>
          {session?.user ? (
            <UserMenu user={session.user} />
          ) : (
            <LoginButton />
          )}
        </div>
      </div>
    </div>
  )
}