"use client"

import { FileText, ChevronRight, ChevronLeft, Menu, Calendar, File, Target } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useState } from "react"

interface Section {
  title: string
  page: number
  level?: number
  confidence?: number
  yPosition?: number
  details?: any
  id?: string
  content?: string
}

interface ParsedSidebarProps {
  parsedData: Section[] | { sections?: Section[] } | null
  selectedSection: string | null
  onSectionSelect: (section: Section) => void // Pass the complete section object
  isOpen: boolean
  onToggle: () => void
}

export function ParsedSidebar({ parsedData, selectedSection, onSectionSelect, isOpen, onToggle }: ParsedSidebarProps) {
  // Normalize parsedData to always be an array
  const sections = !parsedData
    ? null
    : Array.isArray(parsedData)
      ? parsedData
      : (parsedData.sections || [])

  if (!sections) {
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

        {/* Document info header */}
        <div className="border-b border-sidebar-border px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-sm font-medium text-sidebar-foreground">
              Document Structure
            </p>
            <Target className="h-4 w-4 text-sidebar-foreground" />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Pages: {sections.length > 0 ? Math.max(...sections.map(s => s.page)) : 0}
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {sections.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <p className="text-xs text-muted-foreground">No sections found</p>
              </div>
            ) : (
              <nav className="space-y-0.5">
                {sections.map((section, index) => {
                  const hasSubLevel = (section.level || 1) > 1
                  const indentLevel = ((section.level || 1) - 1) * 12 // 12px per level
                  const isSelected = selectedSection === section.title

                  return (
                    <div key={`${section.title}-${section.page}-${index}`}>
                      <button
                        onClick={() => onSectionSelect(section)} // Pass complete section object
                        className={cn(
                          "group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors",
                          isSelected
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "hover:bg-sidebar-accent text-sidebar-foreground",
                        )}
                        style={{ paddingLeft: `${12 + indentLevel}px` }}
                      >
                        {hasSubLevel && (
                          <div className="w-2 h-2 rounded-full bg-muted-foreground/30 shrink-0" />
                        )}

                        <div className="flex-1 overflow-hidden">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="truncate font-mono text-sm leading-tight" title={section.title}>
                                {section.title}
                              </h3>

                            </div>


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


      </aside>
    </>
  )
}
