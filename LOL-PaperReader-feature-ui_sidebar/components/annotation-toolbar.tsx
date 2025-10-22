"use client"

import { Highlighter, Eraser, Palette, Undo, Redo } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface AnnotationToolbarProps {
  highlightColor: string
  onColorChange: (color: string) => void
  annotationMode: "highlight" | "erase" | null
  onModeChange: (mode: "highlight" | "erase" | null) => void
}

const presetColors = [
  { name: "Yellow", value: "#fef08a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Orange", value: "#fed7aa" },
]

export function AnnotationToolbar({
  highlightColor,
  onColorChange,
  annotationMode,
  onModeChange,
}: AnnotationToolbarProps) {
  return (
    <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur-sm">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={annotationMode === "highlight" ? "default" : "ghost"}
              size="icon"
              className={cn("h-9 w-9 rounded-full", annotationMode === "highlight" && "shadow-md")}
              style={
                annotationMode === "highlight"
                  ? {
                      backgroundColor: highlightColor,
                      color: "#000",
                    }
                  : undefined
              }
            >
              <Highlighter className="h-4 w-4" />
              <span className="sr-only">Highlight</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48" side="top">
            <div className="space-y-2">
              <p className="font-mono text-xs font-medium text-foreground">Highlight Color</p>
              <div className="grid grid-cols-5 gap-2">
                {presetColors.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => {
                      onColorChange(color.value)
                      onModeChange("highlight")
                    }}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-all hover:scale-110",
                      highlightColor === color.value ? "border-foreground ring-2 ring-foreground/20" : "border-border",
                    )}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant={annotationMode === "erase" ? "default" : "ghost"}
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={() => onModeChange(annotationMode === "erase" ? null : "erase")}
        >
          <Eraser className="h-4 w-4" />
          <span className="sr-only">Erase</span>
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />

        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" disabled>
          <Undo className="h-4 w-4" />
          <span className="sr-only">Undo</span>
        </Button>

        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" disabled>
          <Redo className="h-4 w-4" />
          <span className="sr-only">Redo</span>
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />

        <div className="flex items-center gap-2 px-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <div className="h-5 w-5 rounded-full border-2 border-border" style={{ backgroundColor: highlightColor }} />
        </div>
      </div>

      <div className="mt-2 text-center">
        <p className="font-mono text-xs text-muted-foreground">
          Press <kbd className="rounded bg-muted px-1">H</kbd> to highlight •{" "}
          <kbd className="rounded bg-muted px-1">E</kbd> to erase
        </p>
      </div>
    </div>
  )
}
