"use client"

import type React from "react"
import { FileText, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface TabItem {
  id: string
  label: string
  icon?: React.ReactNode
}

interface TabBarProps {
  tabs: TabItem[]
  activeTabId: string | null
  onTabClick: (tabId: string) => void
  onTabClose: (tabId: string, e: React.MouseEvent) => void
  onNewTab?: () => void
  showNewButton?: boolean
  className?: string
}

/**
 * Reusable TabBar component for displaying and managing tabs
 * Features:
 * - Active tab highlighting
 * - Close button on hover
 * - Scrollable tab list
 * - Optional "New" button
 * - Customizable icons
 */
export function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
  showNewButton = true,
  className,
}: TabBarProps) {
  if (tabs.length === 0 && !showNewButton) {
    return null
  }

  return (
    <div className={cn("flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1", className)}>
      <div className="flex flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => onTabClick(tab.id)}
            className={cn(
              "group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer",
              activeTabId === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.icon || <FileText className="h-3.5 w-3.5 shrink-0" />}
            <span className="max-w-[150px] truncate font-mono text-xs">{tab.label}</span>
            <button
              onClick={(e) => onTabClose(tab.id, e)}
              className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/20 group-hover:opacity-100"
              aria-label={`Close ${tab.label}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      {showNewButton && onNewTab && (
        <Button variant="ghost" size="sm" onClick={onNewTab} className="h-7 gap-1.5 px-2 text-xs">
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      )}
    </div>
  )
}

