"use client"

import { useState, useEffect } from "react"
import { Keyboard, X, Command } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface KeyboardShortcut {
  category: string
  shortcuts: Array<{
    keys: string[]
    description: string
    action: string
  }>
}

interface KeyboardShortcutsPanelProps {
  isOpen: boolean
  onClose: () => void
}

const shortcuts: KeyboardShortcut[] = [
  {
    category: "Navigation",
    shortcuts: [
      { keys: ["→", "L"], description: "Next page", action: "nextPage" },
      { keys: ["←", "H"], description: "Previous page", action: "prevPage" },
      { keys: ["G"], description: "Go to page", action: "goToPage" },
      { keys: ["Home"], description: "First page", action: "firstPage" },
      { keys: ["End"], description: "Last page", action: "lastPage" },
    ],
  },
  {
    category: "Zoom & View",
    shortcuts: [
      { keys: ["+", "="], description: "Zoom in", action: "zoomIn" },
      { keys: ["-"], description: "Zoom out", action: "zoomOut" },
      { keys: ["0"], description: "Reset zoom", action: "resetZoom" },
      { keys: ["W"], description: "Fit to width", action: "fitWidth" },
      { keys: ["F"], description: "Fullscreen", action: "fullscreen" },
    ],
  },
  {
    category: "Search & Tools",
    shortcuts: [
      { keys: ["Ctrl", "F"], description: "Search in PDF", action: "search" },
      { keys: ["/"], description: "Quick search", action: "quickSearch" },
      { keys: ["Esc"], description: "Close panels", action: "closePanels" },
    ],
  },
  {
    category: "Bookmarks",
    shortcuts: [
      { keys: ["B"], description: "Add bookmark", action: "addBookmark" },
      { keys: ["Ctrl", "B"], description: "Show bookmarks", action: "showBookmarks" },
    ],
  },
  {
    category: "Q&A",
    shortcuts: [
      { keys: ["Q"], description: "Open Q&A", action: "openQA" },
      { keys: ["Ctrl", "Enter"], description: "Send question", action: "sendQuestion" },
    ],
  },
  {
    category: "Sidebars",
    shortcuts: [
      { keys: ["["], description: "Toggle left sidebar", action: "toggleLeft" },
      { keys: ["]"], description: "Toggle right sidebar", action: "toggleRight" },
    ],
  },
  {
    category: "Other",
    shortcuts: [
      { keys: ["?"], description: "Show shortcuts", action: "showShortcuts" },
      { keys: ["Ctrl", "E"], description: "Export annotations", action: "exportAnnotations" },
    ],
  },
]

export function KeyboardShortcutsPanel({ isOpen, onClose }: KeyboardShortcutsPanelProps) {
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Close on Escape
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [isOpen, onClose])

  const filteredShortcuts = shortcuts
    .map((category) => ({
      ...category,
      shortcuts: category.shortcuts.filter(
        (shortcut) =>
          shortcut.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          shortcut.keys.some((key) => key.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    }))
    .filter((category) => category.shortcuts.length > 0)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-3xl border-2 border-primary/20 bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/5 to-accent/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Keyboard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-mono text-lg font-semibold text-foreground">Keyboard Shortcuts</h2>
              <p className="font-mono text-xs text-muted-foreground">
                Quick reference for all available shortcuts
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="border-b border-border px-6 py-3">
          <input
            type="text"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            autoFocus
          />
        </div>

        {/* Shortcuts List */}
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 p-6">
            {filteredShortcuts.length === 0 ? (
              <div className="py-12 text-center">
                <Keyboard className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                <p className="font-mono text-sm text-muted-foreground">No shortcuts found</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground/70">
                  Try a different search term
                </p>
              </div>
            ) : (
              filteredShortcuts.map((category, idx) => (
                <div key={idx}>
                  <h3 className="mb-3 font-mono text-sm font-semibold text-primary">
                    {category.category}
                  </h3>
                  <div className="space-y-2">
                    {category.shortcuts.map((shortcut, shortcutIdx) => (
                      <div
                        key={shortcutIdx}
                        className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-2.5 transition-colors hover:bg-muted/50"
                      >
                        <span className="font-mono text-sm text-foreground">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, keyIdx) => (
                            <div key={keyIdx} className="flex items-center gap-1">
                              {keyIdx > 0 && (
                                <span className="text-xs text-muted-foreground">+</span>
                              )}
                              <kbd className="flex h-7 min-w-[28px] items-center justify-center rounded border border-border bg-background px-2 font-mono text-xs font-semibold text-foreground shadow-sm">
                                {key}
                              </kbd>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border bg-muted/30 px-6 py-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-muted-foreground">
              Press <kbd className="rounded border border-border bg-background px-1.5 py-0.5">?</kbd>{" "}
              anytime to view shortcuts
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Press <kbd className="rounded border border-border bg-background px-1.5 py-0.5">Esc</kbd>{" "}
              to close
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

// Hook for handling global keyboard shortcuts
export function useKeyboardShortcuts({
  onNextPage,
  onPrevPage,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitWidth,
  onFullscreen,
  onSearch,
  onAddBookmark,
  onShowBookmarks,
  onOpenQA,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  onShowShortcuts,
  onExportAnnotations,
  onGoToPage,
}: {
  onNextPage?: () => void
  onPrevPage?: () => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onResetZoom?: () => void
  onFitWidth?: () => void
  onFullscreen?: () => void
  onSearch?: () => void
  onAddBookmark?: () => void
  onShowBookmarks?: () => void
  onOpenQA?: () => void
  onToggleLeftSidebar?: () => void
  onToggleRightSidebar?: () => void
  onShowShortcuts?: () => void
  onExportAnnotations?: () => void
  onGoToPage?: () => void
}) {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      const key = e.key.toLowerCase()
      const ctrl = e.ctrlKey || e.metaKey

      // Navigation
      if (key === "arrowright" || key === "l") {
        e.preventDefault()
        onNextPage?.()
      } else if (key === "arrowleft" || key === "h") {
        e.preventDefault()
        onPrevPage?.()
      } else if (key === "g") {
        e.preventDefault()
        onGoToPage?.()
      }

      // Zoom
      else if ((key === "+" || key === "=") && !ctrl) {
        e.preventDefault()
        onZoomIn?.()
      } else if (key === "-" && !ctrl) {
        e.preventDefault()
        onZoomOut?.()
      } else if (key === "0" && !ctrl) {
        e.preventDefault()
        onResetZoom?.()
      } else if (key === "w") {
        e.preventDefault()
        onFitWidth?.()
      } else if (key === "f") {
        e.preventDefault()
        onFullscreen?.()
      }

      // Search
      else if (key === "/" || (ctrl && key === "f")) {
        e.preventDefault()
        onSearch?.()
      }

      // Bookmarks
      else if (key === "b" && !ctrl) {
        e.preventDefault()
        onAddBookmark?.()
      } else if (key === "b" && ctrl) {
        e.preventDefault()
        onShowBookmarks?.()
      }

      // Q&A
      else if (key === "q") {
        e.preventDefault()
        onOpenQA?.()
      }

      // Sidebars
      else if (key === "[") {
        e.preventDefault()
        onToggleLeftSidebar?.()
      } else if (key === "]") {
        e.preventDefault()
        onToggleRightSidebar?.()
      }

      // Other
      else if (key === "?" && !ctrl) {
        e.preventDefault()
        onShowShortcuts?.()
      } else if (key === "e" && ctrl) {
        e.preventDefault()
        onExportAnnotations?.()
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [
    onNextPage,
    onPrevPage,
    onZoomIn,
    onZoomOut,
    onResetZoom,
    onFitWidth,
    onFullscreen,
    onSearch,
    onAddBookmark,
    onShowBookmarks,
    onOpenQA,
    onToggleLeftSidebar,
    onToggleRightSidebar,
    onShowShortcuts,
    onExportAnnotations,
    onGoToPage,
  ])
}
