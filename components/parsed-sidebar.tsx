"use client"

import { FileText, ChevronRight, ChevronLeft, Menu, Calendar, File } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useState } from "react"

interface Section {
  id: string
  title: string
  content: string
  page: number
}

interface ParsedSidebarProps {
  parsedData: {
    title?: string
    sections?: Section[]
    metadata?: {
      pages?: number
      author?: string
      date?: string
    }
  } | null
  selectedSection: string | null
  onSectionSelect: (sectionId: string) => void
  isOpen: boolean
  onToggle: () => void
}

export function ParsedSidebar({ parsedData, selectedSection, onSectionSelect, isOpen, onToggle }: ParsedSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  if (!parsedData) {
    return (
      <>
        {!isOpen && (
          <button
            onClick={onToggle}
            className="absolute left-0 top-1/2 z-10 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-border bg-background shadow-md transition-colors hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <aside
          className={cn(
            "flex flex-col border-r border-border bg-sidebar transition-all duration-300",
            isOpen ? "w-80" : "w-0 overflow-hidden",
          )}
        >
          <div className="flex h-full items-center justify-center p-6">
            <div className="text-center">
              <FileText className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
              <p className="font-mono text-sm text-muted-foreground">Processing document...</p>
            </div>
          </div>
        </aside>
      </>
    )
  }

  const { title, sections = [], metadata } = parsedData

  return (
    <>
      {!isOpen && (
        <button
          onClick={onToggle}
          className="absolute left-0 top-1/2 z-10 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-border bg-background shadow-md transition-colors hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      <aside
        className={cn(
          "relative flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
          isOpen ? "w-80" : "w-0 overflow-hidden",
        )}
      >
        <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
          <div className="flex items-center gap-2">
            <button className="rounded p-1.5 transition-colors hover:bg-sidebar-accent">
              <Menu className="h-4 w-4 text-sidebar-foreground" />
            </button>
            <button className="rounded p-1.5 transition-colors hover:bg-sidebar-accent">
              <Calendar className="h-4 w-4 text-sidebar-foreground" />
            </button>
            <button className="rounded p-1.5 transition-colors hover:bg-sidebar-accent">
              <File className="h-4 w-4 text-sidebar-foreground" />
            </button>
          </div>
          <button onClick={onToggle} className="rounded p-1.5 transition-colors hover:bg-sidebar-accent">
            <ChevronLeft className="h-4 w-4 text-sidebar-foreground" />
          </button>
        </div>

        {title && (
          <div className="border-b border-sidebar-border px-4 py-3">
            <p className="font-mono text-sm font-medium text-sidebar-foreground line-clamp-2" title={title}>
              {title}
            </p>
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="p-2">
            {sections.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <p className="text-xs text-muted-foreground">No sections found</p>
              </div>
            ) : (
              <nav className="space-y-0.5">
                {sections.map((section) => {
                  const isExpanded = expandedSections.has(section.id)
                  const hasSubsections = section.title.includes(".")

                  return (
                    <div key={section.id}>
                      <button
                        onClick={() => {
                          onSectionSelect(section.id)
                          if (hasSubsections) {
                            toggleSection(section.id)
                          }
                        }}
                        className={cn(
                          "group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors",
                          selectedSection === section.id
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "hover:bg-sidebar-accent text-sidebar-foreground",
                        )}
                      >
                        {hasSubsections && (
                          <ChevronRight
                            className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isExpanded && "rotate-90")}
                          />
                        )}
                        <div className="flex-1 overflow-hidden">
                          <div className="flex items-baseline justify-between gap-2">
                            <h3 className="truncate font-mono text-sm" title={section.title}>
                              {section.title}
                            </h3>
                          </div>
                        </div>
                      </button>
                    </div>
                  )
                })}
              </nav>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-sidebar-border bg-sidebar-accent/30 px-4 py-2">
          <p className="text-xs text-muted-foreground">
            {sections.length} {sections.length === 1 ? "section" : "sections"}
          </p>
        </div>
      </aside>
    </>
  )
}
