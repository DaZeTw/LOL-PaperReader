"use client"

import { useState, ReactNode } from "react"
import { X, LucideIcon, MessageSquare, BookmarkIcon, Sparkles, FileText, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { QAInterface } from "@/components/qa-interface"
import { HighlightNotesSidebar } from "@/components/highlight-notes-sidebar"
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"

interface SidebarTab {
  id: string
  icon: LucideIcon
  label: string
  content: ReactNode
  disabled?: boolean
}

interface RightSidebarProps {
  // Props for QA
  tabId: string
  pdfFile: File
  onCitationClick: (page: number, text?: string) => void
  totalPages: number
  
  // Props for Highlights
  highlights: SkimmingHighlight[]
  highlightsLoading: boolean
  visibleCategories: Set<string>
  onHighlightClick: (highlight: SkimmingHighlight) => void
  hiddenHighlightIds: Set<number>
  onHighlightToggle: (highlightId: number) => void
  activeHighlightIds: Set<number>
  
  // Sidebar control
  isOpen: boolean
  onToggle: () => void
  className?: string
}

export function RightSidebar({
  tabId,
  pdfFile,
  onCitationClick,
  totalPages,
  highlights,
  highlightsLoading,
  visibleCategories,
  onHighlightClick,
  hiddenHighlightIds,
  onHighlightToggle,
  activeHighlightIds,
  isOpen,
  onToggle,
  className,
}: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState("qa")

  // Define tabs internally
  const tabs: SidebarTab[] = [
    {
      id: "qa",
      icon: MessageSquare,
      label: "Q&A",
      content: (
        <QAInterface
          tabId={tabId}
          pdfFile={pdfFile}
          onHighlight={() => {}}
          onCitationClick={onCitationClick}
          totalPages={totalPages}
          isOpen={true}
          onToggle={() => {}}
        />
      ),
    },
    {
      id: "highlights",
      icon: BookmarkIcon,
      label: "Highlights",
      disabled: highlightsLoading || highlights.length === 0,
      content: (
        <HighlightNotesSidebar
          highlights={highlights}
          visibleCategories={visibleCategories}
          onHighlightClick={onHighlightClick}
          isOpen={true}
          onToggle={() => {}}
          hiddenHighlightIds={hiddenHighlightIds}
          onHighlightToggle={onHighlightToggle}
          activeHighlightIds={activeHighlightIds}
        />
      ),
    },
    {
      id: "summary",
      icon: Sparkles,
      label: "AI Summary",
      content: <div className="p-4">AI Summary coming soon...</div>,
    },
    {
      id: "notes",
      icon: FileText,
      label: "Notes",
      content: <div className="p-4">Notes coming soon...</div>,
    },
    {
      id: "settings",
      icon: Settings,
      label: "Settings",
      content: <div className="p-4">Settings coming soon...</div>,
    },
  ]

  const activeTabData = tabs.find(tab => tab.id === activeTab)

  if (!isOpen) {
    return (
      <div className="flex flex-col gap-2 absolute right-4 top-20 z-10">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id)
              onToggle()
            }}
            variant="default"
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
            title={tab.label}
            disabled={tab.disabled}
          >
            <tab.icon className="h-5 w-5" />
          </Button>
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Tab Switcher - Utility Bar */}
      <div className="absolute right-[384px] top-20 z-10 flex flex-col gap-1 bg-background border border-border rounded-lg shadow-md overflow-hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "p-3 transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted",
              tab.disabled && "opacity-50 cursor-not-allowed"
            )}
            title={tab.label}
            disabled={tab.disabled}
          >
            <tab.icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      {/* Sidebar Content */}
      <div
        className={cn(
          "flex h-full w-96 flex-col border-l bg-background",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">{activeTabData?.label}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTabData?.content}
        </div>
      </div>
    </>
  )
}