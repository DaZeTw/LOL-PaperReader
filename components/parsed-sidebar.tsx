"use client"

import { FileText, ChevronRight } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

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
}

export function ParsedSidebar({ parsedData, selectedSection, onSectionSelect }: ParsedSidebarProps) {
  if (!parsedData) {
    return (
      <aside className="w-80 border-r border-border bg-sidebar">
        <div className="flex h-full items-center justify-center p-6">
          <div className="text-center">
            <FileText className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
            <p className="font-mono text-sm text-muted-foreground">Processing document...</p>
          </div>
        </div>
      </aside>
    )
  }

  const { title, sections = [], metadata } = parsedData

  return (
    <aside className="flex w-80 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Header */}
      <div className="border-b border-sidebar-border px-4 py-4">
        <h2 className="mb-1 font-mono text-sm font-medium text-sidebar-foreground">Document Structure</h2>
        {title && (
          <p className="truncate text-xs text-muted-foreground" title={title}>
            {title}
          </p>
        )}
      </div>

      {/* Metadata */}
      {metadata && (
        <div className="border-b border-sidebar-border bg-sidebar-accent/50 px-4 py-3">
          <dl className="space-y-1 text-xs">
            {metadata.pages && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Pages:</dt>
                <dd className="font-mono text-sidebar-foreground">{metadata.pages}</dd>
              </div>
            )}
            {metadata.author && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Author:</dt>
                <dd className="truncate font-mono text-sidebar-foreground" title={metadata.author}>
                  {metadata.author}
                </dd>
              </div>
            )}
            {metadata.date && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Date:</dt>
                <dd className="font-mono text-sidebar-foreground">{metadata.date}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Sections List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {sections.length === 0 ? (
            <div className="px-2 py-8 text-center">
              <p className="text-xs text-muted-foreground">No sections found</p>
            </div>
          ) : (
            <nav className="space-y-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => onSectionSelect(section.id)}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-md px-3 py-2.5 text-left transition-colors",
                    selectedSection === section.id
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "hover:bg-sidebar-accent text-sidebar-foreground",
                  )}
                >
                  <ChevronRight
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 transition-transform",
                      selectedSection === section.id && "rotate-90",
                    )}
                  />
                  <div className="flex-1 overflow-hidden">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h3 className="truncate font-mono text-sm font-medium" title={section.title}>
                        {section.title}
                      </h3>
                      <span
                        className={cn(
                          "shrink-0 font-mono text-xs",
                          selectedSection === section.id
                            ? "text-sidebar-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        p.{section.page}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "line-clamp-2 text-xs leading-relaxed",
                        selectedSection === section.id ? "text-sidebar-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {section.content}
                    </p>
                  </div>
                </button>
              ))}
            </nav>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-sidebar-border bg-sidebar-accent/30 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {sections.length} {sections.length === 1 ? "section" : "sections"} parsed
        </p>
      </div>
    </aside>
  )
}
