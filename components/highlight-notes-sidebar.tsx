"use client"

import React from "react"
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SkimmingHighlight } from "./pdf-highlight-overlay"

interface HighlightNotesSidebarProps {
  highlights: SkimmingHighlight[]
  visibleCategories: Set<string>
  onHighlightClick: (highlight: SkimmingHighlight) => void
  isOpen?: boolean
  onToggle?: () => void
  hiddenHighlightIds?: Set<number>
  onHighlightToggle?: (highlightId: number) => void
}

const CATEGORY_INFO = {
  novelty: {
    color: "bg-yellow-100 border-yellow-300 text-yellow-900",
    label: "Novelty",
    icon: "💡",
  },
  method: {
    color: "bg-blue-100 border-blue-300 text-blue-900",
    label: "Method",
    icon: "🔬",
  },
  result: {
    color: "bg-green-100 border-green-300 text-green-900",
    label: "Result",
    icon: "📊",
  },
} as const

export function HighlightNotesSidebar({
  highlights,
  visibleCategories,
  onHighlightClick,
  isOpen = true,
  onToggle,
  hiddenHighlightIds = new Set(),
  onHighlightToggle,
}: HighlightNotesSidebarProps) {
  // Group highlights by category
  const highlightsByCategory = highlights.reduce((acc, highlight) => {
    if (!visibleCategories.has(highlight.label)) return acc
    if (!acc[highlight.label]) {
      acc[highlight.label] = []
    }
    acc[highlight.label].push(highlight)
    return acc
  }, {} as Record<string, SkimmingHighlight[]>)

  // Sort categories and highlights by score
  const sortedCategories = Object.keys(highlightsByCategory).sort()
  Object.keys(highlightsByCategory).forEach((category) => {
    highlightsByCategory[category].sort((a, b) => b.score - a.score)
  })

  return (
    <>
      {!isOpen && onToggle && (
        <button
          onClick={onToggle}
          className="absolute right-0 top-1/2 z-10 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-border bg-background shadow-md transition-colors hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
      <aside
        className={cn(
          "relative flex flex-col border-l border-border bg-sidebar transition-all duration-300 h-full",
          isOpen ? "w-96" : "w-0 overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/5 to-accent/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <span className="text-xl">📌</span>
            </div>
            <div>
              <h2 className="font-mono text-lg font-semibold text-foreground">Highlights</h2>
              <p className="font-mono text-xs text-muted-foreground">
                {highlights.filter((h) => visibleCategories.has(h.label)).length} notes
              </p>
            </div>
          </div>
          {onToggle && (
            <button onClick={onToggle} className="rounded p-1.5 transition-colors hover:bg-muted">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Highlights List */}
        <div className="flex-1 overflow-y-auto p-4">
          {highlights.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="font-mono text-sm text-muted-foreground">No highlights available</p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  Enable highlights to see key sections
                </p>
              </div>
            </div>
          ) : sortedCategories.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="font-mono text-sm text-muted-foreground">No categories selected</p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  Toggle categories to view highlights
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {sortedCategories.map((category) => {
                const categoryHighlights = highlightsByCategory[category]
                const categoryInfo = CATEGORY_INFO[category as keyof typeof CATEGORY_INFO]

                return (
                  <div key={category} className="space-y-3">
                    {/* Category Header */}
                    <div className="flex items-center gap-2 sticky top-0 bg-sidebar py-2 z-10">
                      <span className="text-lg">{categoryInfo.icon}</span>
                      <h3 className="font-mono text-sm font-semibold text-foreground">
                        {categoryInfo.label}
                      </h3>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {categoryHighlights.length}
                      </span>
                    </div>

                    {/* Highlight Cards */}
                    <div className="space-y-2">
                      {categoryHighlights.map((highlight) => {
                        const isHidden = hiddenHighlightIds.has(highlight.id)
                        return (
                          <div
                            key={highlight.id}
                            className={cn(
                              "relative w-full text-left rounded-lg border p-3 transition-all group",
                              categoryInfo.color,
                              isHidden && "opacity-50"
                            )}
                          >
                            {/* Toggle Button */}
                            {onHighlightToggle && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onHighlightToggle(highlight.id)
                                }}
                                className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background transition-colors opacity-0 group-hover:opacity-100"
                                title={isHidden ? "Show highlight" : "Hide highlight"}
                              >
                                {isHidden ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}

                            {/* Clickable content area */}
                            <button
                              onClick={() => onHighlightClick(highlight)}
                              className="w-full text-left"
                            >
                              {/* Metadata */}
                              <div className="flex items-center justify-between mb-2 pr-8">
                                <span className="font-mono text-xs font-semibold">
                                  Page {highlight.boxes[0].page + 1}
                                </span>
                                <span className="font-mono text-xs opacity-75">
                                  Score: {highlight.score.toFixed(1)}
                                </span>
                              </div>

                              {/* Section Title */}
                              {highlight.section && (
                                <p className="font-mono text-xs font-medium mb-2 opacity-90">
                                  {highlight.section}
                                </p>
                              )}

                              {/* Highlight Text */}
                              <p className="font-mono text-xs leading-relaxed line-clamp-4">
                                {highlight.text}
                              </p>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
