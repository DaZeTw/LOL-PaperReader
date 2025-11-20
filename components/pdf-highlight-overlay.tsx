"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export interface SkimmingHighlight {
  id: number
  text: string
  section: string
  label: "novelty" | "method" | "result"
  score: number
  boxes: {
    left: number
    top: number
    width: number
    height: number
    page: number
  }[]
  block_id: string
}

interface PDFHighlightOverlayProps {
  pageNumber: number
  pageWidth: number
  pageHeight: number
  highlights: SkimmingHighlight[]
  visibleCategories: Set<string>
  onHighlightClick?: (highlight: SkimmingHighlight) => void
}

const CATEGORY_COLORS = {
  novelty: "rgba(254, 240, 138, 0.4)", // yellow
  method: "rgba(147, 197, 253, 0.4)",  // blue
  result: "rgba(134, 239, 172, 0.4)",  // green
} as const

const CATEGORY_BORDERS = {
  novelty: "rgba(234, 179, 8, 0.6)",
  method: "rgba(59, 130, 246, 0.6)",
  result: "rgba(34, 197, 94, 0.6)",
} as const

export function PDFHighlightOverlay({
  pageNumber,
  pageWidth,
  pageHeight,
  highlights,
  visibleCategories,
  onHighlightClick,
}: PDFHighlightOverlayProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  // Filter highlights for current page and visible categories
  const pageHighlights = highlights.filter((h) => {
    if (!visibleCategories.has(h.label)) return false
    return h.boxes.some((box) => box.page === pageNumber - 1) // Convert to 0-indexed
  })

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ width: `${pageWidth}px`, height: `${pageHeight}px` }}
    >
      {pageHighlights.map((highlight) => {
        const currentPageBoxes = highlight.boxes.filter(
          (box) => box.page === pageNumber - 1
        )

        return currentPageBoxes.map((box, boxIdx) => {
          const isHovered = hoveredId === highlight.id
          const backgroundColor = CATEGORY_COLORS[highlight.label]
          const borderColor = CATEGORY_BORDERS[highlight.label]

          // Convert relative coordinates to pixels
          const left = box.left * pageWidth
          const top = box.top * pageHeight
          const width = box.width * pageWidth
          const height = box.height * pageHeight

          return (
            <div
              key={`${highlight.id}-${boxIdx}`}
              className={cn(
                "absolute transition-all duration-200 pointer-events-auto cursor-pointer",
                isHovered && "z-10"
              )}
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                backgroundColor,
                borderLeft: `3px solid ${borderColor}`,
                opacity: isHovered ? 1 : 0.7,
                transform: isHovered ? "scale(1.02)" : "scale(1)",
              }}
              onMouseEnter={() => setHoveredId(highlight.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onHighlightClick?.(highlight)}
              title={highlight.text}
            />
          )
        })
      })}

      {/* Tooltip for hovered highlight */}
      {hoveredId !== null && (
        <HighlightTooltip
          highlight={pageHighlights.find((h) => h.id === hoveredId)!}
          pageWidth={pageWidth}
        />
      )}
    </div>
  )
}

function HighlightTooltip({
  highlight,
  pageWidth,
}: {
  highlight: SkimmingHighlight
  pageWidth: number
}) {
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY })
    }
    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [])

  const labelColors = {
    novelty: "bg-yellow-100 text-yellow-900 border-yellow-300",
    method: "bg-blue-100 text-blue-900 border-blue-300",
    result: "bg-green-100 text-green-900 border-green-300",
  }

  return (
    <div
      className="fixed z-50 max-w-md p-3 bg-background border-2 rounded-lg shadow-xl pointer-events-none"
      style={{
        left: `${position.x + 15}px`,
        top: `${position.y + 15}px`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            "px-2 py-1 text-xs font-semibold rounded border",
            labelColors[highlight.label]
          )}
        >
          {highlight.label.toUpperCase()}
        </span>
        <span className="text-xs text-muted-foreground">
          Score: {highlight.score.toFixed(1)}
        </span>
      </div>
      <p className="text-sm text-foreground line-clamp-4">{highlight.text}</p>
      {highlight.section && (
        <p className="mt-2 text-xs text-muted-foreground italic">
          {highlight.section}
        </p>
      )}
    </div>
  )
}
