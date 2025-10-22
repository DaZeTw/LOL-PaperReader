"use client"

import { useState, useEffect, useRef } from "react"
import { X, ExternalLink, Copy, BookOpen, Link, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface Citation {
  id: string
  type: "inline" | "reference" | "doi" | "url"
  text: string
  authors?: string[]
  title?: string
  journal?: string
  year?: number
  doi?: string
  url?: string
  page?: number
  position?: { x: number; y: number }
  confidence?: number
}

interface CitationPopupProps {
  citation: Citation | null
  isOpen: boolean
  onClose: () => void
  onViewReference: (citation: Citation) => void
  onCopyText: (text: string) => void
}

export function CitationPopup({
  citation,
  isOpen,
  onClose,
  onViewReference,
  onCopyText,
}: CitationPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen, onClose])

  // Close popup on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      return () => document.removeEventListener("keydown", handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen || !citation) return null

  const handleCopyText = () => {
    const textToCopy = citation.title || citation.text
    onCopyText(textToCopy)
    navigator.clipboard.writeText(textToCopy)
  }

  const getTypeIcon = () => {
    switch (citation.type) {
      case "doi":
        return <Link className="h-4 w-4" />
      case "url":
        return <ExternalLink className="h-4 w-4" />
      default:
        return <BookOpen className="h-4 w-4" />
    }
  }

  const getTypeColor = () => {
    switch (citation.type) {
      case "doi":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "url":
        return "bg-green-100 text-green-800 border-green-200"
      case "reference":
        return "bg-purple-100 text-purple-800 border-purple-200"
      default:
        return "bg-orange-100 text-orange-800 border-orange-200"
    }
  }

  return (
    <div
      ref={popupRef}
      className="fixed z-50 w-80 rounded-lg border border-border bg-background shadow-lg animate-in fade-in-0 zoom-in-95 duration-200"
      style={{
        left: Math.min(citation.position?.x || 0, window.innerWidth - 320),
        top: Math.max(citation.position?.y || 0 - 10, 10),
        transform: citation.position?.y && citation.position.y > window.innerHeight / 2 
          ? "translateY(-100%)" 
          : "translateY(10px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          {getTypeIcon()}
          <span className="text-sm font-medium">Citation</span>
          <Badge variant="outline" className={cn("text-xs", getTypeColor())}>
            {citation.type}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="max-h-60">
        <div className="p-3 space-y-3">
          {/* Citation Text */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Citation Text</p>
            <p className="text-xs text-foreground bg-muted/30 p-2 rounded font-mono leading-relaxed">
              {citation.text}
            </p>
          </div>

          {/* Reference Details */}
          {(citation.title || citation.authors || citation.journal) && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Reference Details</p>
              
              {citation.title && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Title</p>
                  <p className="text-sm font-medium text-foreground leading-tight">{citation.title}</p>
                </div>
              )}
              
              {citation.authors && citation.authors.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Authors</p>
                  <p className="text-sm text-foreground">{citation.authors.join(", ")}</p>
                </div>
              )}
              
              {citation.journal && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Journal</p>
                  <p className="text-sm text-foreground italic">{citation.journal}</p>
                </div>
              )}
              
              <div className="flex items-center gap-4">
                {citation.year && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Year</p>
                    <p className="text-sm text-foreground font-medium">{citation.year}</p>
                  </div>
                )}
                
                {citation.page && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Page</p>
                    <p className="text-sm text-foreground font-medium">{citation.page}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Confidence Score */}
          {citation.confidence && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Detection Confidence</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all",
                      citation.confidence > 0.8 ? "bg-green-500" : 
                      citation.confidence > 0.6 ? "bg-yellow-500" : "bg-red-500"
                    )}
                    style={{ width: `${citation.confidence * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {Math.round(citation.confidence * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleCopyText} className="h-7 text-xs">
            <Copy className="h-3 w-3 mr-1" />
            Copy
          </Button>
          
          {citation.url && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(citation.url, "_blank")}
              className="h-7 text-xs"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Link
            </Button>
          )}

          {citation.doi && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(`https://doi.org/${citation.doi}`, "_blank")}
              className="h-7 text-xs"
            >
              <FileText className="h-3 w-3 mr-1" />
              DOI
            </Button>
          )}
        </div>
        
        <Button
          variant="default"
          size="sm"
          onClick={() => onViewReference(citation)}
          className="h-7 text-xs"
        >
          View Reference
        </Button>
      </div>
    </div>
  )
}
