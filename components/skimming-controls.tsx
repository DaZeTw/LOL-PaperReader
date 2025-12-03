"use client"

import { useState } from "react"
import { Eye, EyeOff, Sparkles, FlaskConical, TrendingUp, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface SkimmingControlsProps {
  visibleCategories: Set<string>
  onToggleCategory: (category: string) => void
  onToggleAll: () => void
  highlightCounts: {
    objective: number
    method: number
    result: number
  }
}

const CATEGORIES = [
  {
    id: "objective",
    label: "Objective",
    icon: Sparkles,
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    hoverColor: "hover:bg-orange-200",
    description: "Research objectives and goals",
  },
  {
    id: "method",
    label: "Method",
    icon: FlaskConical,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    hoverColor: "hover:bg-blue-200",
    description: "Methodology and approach descriptions",
  },
  {
    id: "result",
    label: "Result",
    icon: TrendingUp,
    color: "text-green-600",
    bgColor: "bg-green-100",
    hoverColor: "hover:bg-green-200",
    description: "Results and findings",
  },
] as const

export function SkimmingControls({
  visibleCategories,
  onToggleCategory,
  onToggleAll,
  highlightCounts,
}: SkimmingControlsProps) {
  const allVisible = CATEGORIES.every((cat) => visibleCategories.has(cat.id))
  const totalHighlights = Object.values(highlightCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-background/95 backdrop-blur-sm border-b border-border">
      <TooltipProvider>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <Info className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary">
                  {totalHighlights} highlights
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Total skimming highlights on this document</p>
            </TooltipContent>
          </Tooltip>

          <div className="h-4 w-px bg-border" />

          {/* Category toggle buttons */}
          {CATEGORIES.map((category) => {
            const Icon = category.icon
            const isVisible = visibleCategories.has(category.id)
            const count = highlightCounts[category.id as keyof typeof highlightCounts]

            return (
              <Tooltip key={category.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={isVisible ? "default" : "outline"}
                    size="sm"
                    onClick={() => onToggleCategory(category.id)}
                    className={cn(
                      "gap-2 h-8 transition-all",
                      isVisible && category.bgColor,
                      isVisible && category.color,
                      isVisible && category.hoverColor,
                      !isVisible && "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-mono text-xs font-semibold">
                      {category.label}
                    </span>
                    <span className={cn(
                      "ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold",
                      isVisible ? "bg-background/50" : "bg-muted"
                    )}>
                      {count}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{category.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {count} highlight{count !== 1 ? "s" : ""}
                  </p>
                </TooltipContent>
              </Tooltip>
            )
          })}

          <div className="h-4 w-px bg-border" />

          {/* Toggle all button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleAll}
                className="gap-2 h-8"
              >
                {allVisible ? (
                  <>
                    <EyeOff className="h-4 w-4" />
                    <span className="text-xs">Hide All</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    <span className="text-xs">Show All</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {allVisible ? "Hide all highlights" : "Show all highlights"}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  )
}
