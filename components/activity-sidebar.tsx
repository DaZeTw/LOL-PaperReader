"use client"

import { useSession } from "next-auth/react"
import { 
  Library, 
  Settings, 
  FileText
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserMenu } from "@/components/user-menu"
import { LoginButton } from "@/components/login-button"

interface ActivitySidebarProps {
  activeView: 'library' | 'pdf'
  onViewChange: (view: 'library') => void
}

export function ActivitySidebar({ 
  activeView, 
  onViewChange
}: ActivitySidebarProps) {
  const { data: session } = useSession()

  const navigationItems = [
    {
      id: 'library',
      label: 'Library',
      icon: Library,
      active: activeView === 'library',
      onClick: () => onViewChange('library'),
      disabled: !session?.user
    }
  ]

  return (
    <div className="flex h-full w-12 flex-col border-r border-border bg-muted/30">
      {/* Header - Just icon */}
      <div className="border-b border-border p-2 flex justify-center">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
          <FileText className="h-3 w-3 text-primary-foreground" />
        </div>
      </div>

      {/* Navigation - Icons only */}
      <nav className="flex-1 p-2">
        <div className="space-y-2">
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
                  "w-8 h-8 p-0",
                  item.active && "bg-background shadow-sm"
                )}
                title={item.label} // Tooltip on hover
              >
                <Icon className="h-4 w-4" />
              </Button>
            )
          })}
        </div>
      </nav>

      {/* Bottom Section - Icons only */}
      <div className="border-t border-border p-2 space-y-2 mt-auto">
        {/* Settings */}
        <Button
          variant="ghost"
          size="sm"
          disabled={!session?.user}
          className="w-8 h-8 p-0"
          onClick={() => {}} // TODO: Implement settings
          title="Settings" // Tooltip on hover
        >
          <Settings className="h-4 w-4" />
        </Button>

        {/* Theme Toggle */}
        <div className="flex justify-center">
          <ThemeToggle />
        </div>

        {/* User Section */}
        <div className="flex justify-center">
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