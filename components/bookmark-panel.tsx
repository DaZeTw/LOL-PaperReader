"use client"

import { useState } from "react"
import { Bookmark, Plus, Trash2, Edit2, Check, X, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export interface BookmarkItem {
  id: string
  page: number
  section?: string
  note: string
  timestamp: Date
  color: string
}

interface BookmarkPanelProps {
  bookmarks: BookmarkItem[]
  currentPage: number
  onAddBookmark: (bookmark: Omit<BookmarkItem, "id" | "timestamp">) => void
  onRemoveBookmark: (id: string) => void
  onUpdateBookmark: (id: string, note: string) => void
  onJumpToBookmark: (page: number) => void
  isOpen: boolean
  onToggle: () => void
}

export function BookmarkPanel({
  bookmarks,
  currentPage,
  onAddBookmark,
  onRemoveBookmark,
  onUpdateBookmark,
  onJumpToBookmark,
  isOpen,
  onToggle,
}: BookmarkPanelProps) {
  const [newNote, setNewNote] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNote, setEditNote] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)

  const colorOptions = ["#fef08a", "#fed7aa", "#fecaca", "#d9f99d", "#bfdbfe", "#e9d5ff"]

  const handleAddBookmark = (color: string) => {
    if (newNote.trim()) {
      onAddBookmark({
        page: currentPage,
        note: newNote,
        color,
      })
      setNewNote("")
      setShowAddForm(false)
    }
  }

  const handleUpdateBookmark = (id: string) => {
    if (editNote.trim()) {
      onUpdateBookmark(id, editNote)
      setEditingId(null)
      setEditNote("")
    }
  }

  const filteredBookmarks = bookmarks.filter((bookmark) =>
    bookmark.note.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const sortedBookmarks = [...filteredBookmarks].sort((a, b) => a.page - b.page)

  return (
    <>
      {/* Toggle Button */}
      {!isOpen && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="fixed right-4 top-20 z-40 h-10 w-10 rounded-full bg-background shadow-lg hover:bg-accent"
          title="Show bookmarks"
        >
          <Bookmark className="h-5 w-5" />
          {bookmarks.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {bookmarks.length}
            </span>
          )}
        </Button>
      )}

      {/* Bookmark Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-80 transform border-l border-border bg-background shadow-2xl transition-transform duration-300",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/5 to-accent/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-primary" />
              <h2 className="font-mono text-sm font-semibold text-foreground">
                Bookmarks ({bookmarks.length})
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowAddForm(!showAddForm)}
                className="h-8 w-8"
                title="Add bookmark"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Add Bookmark Form */}
          {showAddForm && (
            <Card className="m-4 border-primary/20 bg-muted/30 p-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">Page {currentPage}</span>
                </div>
                <Input
                  placeholder="Add a note for this bookmark..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddBookmark(colorOptions[0])
                    if (e.key === "Escape") setShowAddForm(false)
                  }}
                  className="h-8 text-sm"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Color:</span>
                  <div className="flex gap-1">
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        onClick={() => handleAddBookmark(color)}
                        className="h-6 w-6 rounded-full border-2 border-background shadow-sm transition-transform hover:scale-110"
                        style={{ backgroundColor: color }}
                        title="Add bookmark with this color"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Search */}
          <div className="border-b border-border px-4 py-2">
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search bookmarks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-6 border-none bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          {/* Bookmarks List */}
          <ScrollArea className="flex-1 px-4 py-3">
            {sortedBookmarks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bookmark className="mb-3 h-12 w-12 text-muted-foreground/30" />
                <p className="font-mono text-sm text-muted-foreground">
                  {searchQuery ? "No bookmarks found" : "No bookmarks yet"}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground/70">
                  {searchQuery ? "Try a different search" : "Click + to add your first bookmark"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedBookmarks.map((bookmark) => (
                  <Card
                    key={bookmark.id}
                    className="group relative cursor-pointer overflow-hidden border-l-4 p-3 transition-all hover:shadow-md"
                    style={{ borderLeftColor: bookmark.color }}
                    onClick={() => {
                      if (!editingId) onJumpToBookmark(bookmark.page)
                    }}
                  >
                    {/* Page Badge */}
                    <div className="mb-2 flex items-center justify-between">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">
                        Page {bookmark.page}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {editingId === bookmark.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleUpdateBookmark(bookmark.id)
                              }}
                              className="h-6 w-6"
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingId(null)
                                setEditNote("")
                              }}
                              className="h-6 w-6"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingId(bookmark.id)
                                setEditNote(bookmark.note)
                              }}
                              className="h-6 w-6"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                onRemoveBookmark(bookmark.id)
                              }}
                              className="h-6 w-6 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Note */}
                    {editingId === bookmark.id ? (
                      <Input
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === "Enter") handleUpdateBookmark(bookmark.id)
                          if (e.key === "Escape") {
                            setEditingId(null)
                            setEditNote("")
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 text-sm"
                        autoFocus
                      />
                    ) : (
                      <p className="font-mono text-sm leading-relaxed text-foreground">
                        {bookmark.note}
                      </p>
                    )}

                    {/* Timestamp */}
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      {new Date(bookmark.timestamp).toLocaleDateString()} at{" "}
                      {new Date(bookmark.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          onClick={onToggle}
        />
      )}
    </>
  )
}
