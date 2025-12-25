"use client"

import React, { useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { X, BookOpen, Link2, GitBranch, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MiniGraph } from "@/components/mini-graph"
import type { ConceptData, RelatedConcept } from "@/hooks/useTaxonomyAPI"

/**
 * Props for the KeywordPopup component
 */
export interface KeywordPopupProps {
  isOpen: boolean
  keyword: string
  context: string
  concept: ConceptData | null
  siblings: RelatedConcept[]
  descendants: RelatedConcept[]
  loading: boolean
  error: string | null
  onClose: () => void
  onNodeClick: (nodeId: string, nodeName: string) => void
  position: { top: number; left: number }
}

const MAX_RELATED_DISPLAY = 5

export function KeywordPopup({
  isOpen,
  keyword,
  context,
  concept,
  siblings,
  descendants,
  loading,
  error,
  onClose,
  onNodeClick,
  position
}: KeywordPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
      const target = event.target as HTMLElement
      if (!target.closest('[data-keyword-chip]')) {
        onClose()
      }
    }
  }, [onClose])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleClickOutside, handleKeyDown])

  if (!isOpen) return null

  // Calculate safe position
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800

  const popupWidth = 360
  const popupMaxHeight = 420

  let safeTop = position.top
  let safeLeft = position.left

  if (safeLeft + popupWidth > viewportWidth - 20) {
    safeLeft = viewportWidth - popupWidth - 20
  }
  if (safeLeft < 20) safeLeft = 20

  if (safeTop + popupMaxHeight > viewportHeight - 20) {
    safeTop = viewportHeight - popupMaxHeight - 20
  }
  if (safeTop < 20) safeTop = 20

  const hasRelatedConcepts = siblings.length > 0 ||
    descendants.length > 0 ||
    (concept?.ambiguous_with && concept.ambiguous_with.length > 0)

  const popupContent = (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div
        ref={popupRef}
        data-keyword-popup
        className={cn(
          "absolute pointer-events-auto",
          "bg-background rounded-lg overflow-hidden",
          "border border-border",
          "shadow-lg",
          "animate-in fade-in-0 zoom-in-95 duration-150"
        )}
        style={{
          top: safeTop,
          left: safeLeft,
          width: popupWidth,
          maxHeight: popupMaxHeight
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
            <h2 className="text-sm font-semibold text-foreground truncate">
              {keyword}
            </h2>
            {concept?.level !== undefined && (
              <Badge variant="secondary" className="text-xs flex-shrink-0">
                L{concept.level}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6 flex-shrink-0 ml-2"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Scrollable content */}
        <div
          className="overflow-y-auto"
          style={{ maxHeight: popupMaxHeight - 52 }}
        >
          <div className="p-4 space-y-4">
            {/* Loading state */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">
                  Loading definition...
                </span>
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-md border border-destructive/20">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Content */}
            {!loading && !error && (
              <>
                {/* Definition */}
                <section>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <BookOpen className="h-3 w-3" />
                    Definition
                  </h3>
                  <p className="text-sm text-foreground leading-relaxed bg-muted/50 p-3 rounded-md border-l-2 border-primary">
                    {concept?.definition || 'No definition available.'}
                  </p>
                </section>

                {/* Related Keywords */}
                {hasRelatedConcepts && (
                  <section>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Link2 className="h-3 w-3" />
                      Related Keywords
                    </h3>
                    <div className="space-y-3">
                      {siblings.length > 0 && (
                        <RelatedConceptGroup
                          label="Siblings"
                          concepts={siblings}
                          maxDisplay={MAX_RELATED_DISPLAY}
                          colorClass="sibling"
                          onConceptClick={onNodeClick}
                        />
                      )}
                      {descendants.length > 0 && (
                        <RelatedConceptGroup
                          label="Descendants"
                          concepts={descendants}
                          maxDisplay={MAX_RELATED_DISPLAY}
                          colorClass="descendant"
                          onConceptClick={onNodeClick}
                        />
                      )}
                      {concept?.ambiguous_with && concept.ambiguous_with.length > 0 && (
                        <AmbiguousConceptGroup
                          concepts={concept.ambiguous_with}
                          onConceptClick={onNodeClick}
                        />
                      )}
                    </div>
                  </section>
                )}

                {/* Knowledge Graph */}
                <section className="border-t border-border pt-3">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <GitBranch className="h-3 w-3" />
                    Knowledge Graph
                  </h3>
                  <div className="bg-muted/30 rounded-md p-2">
                    <MiniGraph
                      concept={concept}
                      siblings={siblings}
                      descendants={descendants}
                      onNodeClick={onNodeClick}
                    />
                    <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Current
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        Sibling
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Descendant
                      </span>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(popupContent, document.body)
  }

  return null
}

interface RelatedConceptGroupProps {
  label: string
  concepts: RelatedConcept[]
  maxDisplay: number
  colorClass: 'sibling' | 'descendant'
  onConceptClick: (id: string, name: string) => void
}

const CONCEPT_COLORS = {
  sibling: {
    label: 'text-blue-600 dark:text-blue-400',
    tag: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-800/50'
  },
  descendant: {
    label: 'text-emerald-600 dark:text-emerald-400',
    tag: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-800/50'
  },
  ambiguous: {
    label: 'text-amber-600 dark:text-amber-400',
    tag: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-800/50'
  }
}

function RelatedConceptGroup({
  label,
  concepts,
  maxDisplay,
  colorClass,
  onConceptClick
}: RelatedConceptGroupProps) {
  const colors = CONCEPT_COLORS[colorClass]
  const displayConcepts = concepts.slice(0, maxDisplay)
  const remainingCount = concepts.length - maxDisplay

  return (
    <div>
      <span className={cn("text-[10px] font-semibold uppercase tracking-wide", colors.label)}>
        {label}:
      </span>
      <div className="flex flex-wrap gap-1 mt-1">
        {displayConcepts.map((concept) => (
          <button
            key={concept.id}
            onClick={() => onConceptClick(concept.id, concept.name)}
            className={cn(
              "px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
              colors.tag
            )}
          >
            {concept.name}
          </button>
        ))}
        {remainingCount > 0 && (
          <span className="px-2 py-0.5 text-[11px] text-muted-foreground">
            +{remainingCount}
          </span>
        )}
      </div>
    </div>
  )
}

interface AmbiguousConceptGroupProps {
  concepts: string[]
  onConceptClick: (id: string, name: string) => void
}

function AmbiguousConceptGroup({
  concepts,
  onConceptClick
}: AmbiguousConceptGroupProps) {
  const colors = CONCEPT_COLORS.ambiguous

  return (
    <div>
      <span className={cn("text-[10px] font-semibold uppercase tracking-wide", colors.label)}>
        Ambiguous:
      </span>
      <div className="flex flex-wrap gap-1 mt-1">
        {concepts.slice(0, 3).map((conceptId) => {
          const displayName = conceptId.length > 12 ? `${conceptId.slice(0, 10)}...` : conceptId
          return (
            <button
              key={conceptId}
              onClick={() => onConceptClick(conceptId, displayName)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                colors.tag
              )}
            >
              {displayName}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default KeywordPopup
