"use client"

import React, { useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { X, BookOpen, Link2, GitBranch, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { MiniGraph } from "@/components/mini-graph"
import type { ConceptData, RelatedConcept } from "@/hooks/useTaxonomyAPI"

/**
 * Props for the KeywordPopup component
 */
export interface KeywordPopupProps {
  /** Whether the popup is visible */
  isOpen: boolean
  /** The keyword being displayed */
  keyword: string
  /** Context text (e.g., occurrence count) */
  context: string
  /** Concept data from the Taxonomy API */
  concept: ConceptData | null
  /** Sibling concepts */
  siblings: RelatedConcept[]
  /** Descendant concepts */
  descendants: RelatedConcept[]
  /** Loading state */
  loading: boolean
  /** Error message if any */
  error: string | null
  /** Callback to close the popup */
  onClose: () => void
  /** Callback when a related concept is clicked */
  onNodeClick: (nodeId: string, nodeName: string) => void
  /** Position for the popup */
  position: { top: number; left: number }
}

/**
 * Maximum number of related concepts to display per category
 */
const MAX_RELATED_DISPLAY = 5

/**
 * KeywordPopup - displays keyword details, definition, and related concepts
 * 
 * Features:
 * - Keyword name and taxonomy level display
 * - Document context (occurrence count)
 * - Definition from Taxonomy API
 * - Related keywords (siblings, descendants, ambiguous)
 * - Click outside and Escape key to close
 * - Loading and error states
 * - Portal rendering to avoid z-index conflicts
 * 
 * @example
 * ```tsx
 * <KeywordPopup
 *   isOpen={true}
 *   keyword="neural network"
 *   context="Appears 15 times in this document"
 *   concept={conceptData}
 *   siblings={siblingConcepts}
 *   descendants={descendantConcepts}
 *   loading={false}
 *   error={null}
 *   onClose={() => setPopupOpen(false)}
 *   onNodeClick={(id, name) => handleNodeClick(id, name)}
 *   position={{ top: 100, left: 200 }}
 * />
 * ```
 */
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

  // Handle click outside to close
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
      // Don't close if clicking on a keyword chip (allows switching keywords)
      const target = event.target as HTMLElement
      if (!target.closest('[data-keyword-chip]')) {
        onClose()
      }
    }
  }, [onClose])

  // Handle Escape key to close
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose()
    }
  }, [onClose])

  // Set up event listeners
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

  // Calculate safe position to keep popup in viewport
  const safePosition = {
    top: Math.min(position.top, typeof window !== 'undefined' ? window.innerHeight - 500 : position.top),
    left: Math.min(position.left, typeof window !== 'undefined' ? window.innerWidth - 450 : position.left)
  }

  // Check if there are any related concepts
  const hasRelatedConcepts = siblings.length > 0 || 
    descendants.length > 0 || 
    (concept?.ambiguous_with && concept.ambiguous_with.length > 0)

  const popupContent = (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div
        ref={popupRef}
        className={cn(
          "absolute w-[420px] max-h-[80vh] pointer-events-auto",
          "bg-background border rounded-xl shadow-2xl",
          "animate-in fade-in-0 zoom-in-95 duration-200"
        )}
        style={{
          top: safePosition.top,
          left: safePosition.left
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyword-popup-title"
      >
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute top-3 right-3 h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive z-10"
          aria-label="Close popup"
        >
          <X className="h-4 w-4" />
        </Button>

        <ScrollArea className="max-h-[80vh]">
          <div className="p-5">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5 pr-10">
              <h2 
                id="keyword-popup-title"
                className="text-xl font-semibold text-primary"
              >
                {keyword}
              </h2>
              {concept?.level !== undefined && (
                <Badge 
                  variant="secondary"
                  className="bg-gradient-to-r from-primary to-purple-500 text-white border-0"
                >
                  Level {concept.level}
                </Badge>
              )}
            </div>

            {/* Loading state */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-lg text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Content when loaded */}
            {!loading && !error && (
              <div className="space-y-5">
                {/* Context section */}
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
                    <BookOpen className="h-4 w-4" />
                    Context
                  </h3>
                  <p className="text-sm bg-muted/50 p-3 rounded-lg border-l-3 border-primary italic">
                    {context || 'No context available'}
                  </p>
                </section>

                {/* Definition section */}
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
                    <BookOpen className="h-4 w-4" />
                    Definition
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {concept?.definition || 'No definition available'}
                  </p>
                </section>

                {/* Related keywords section */}
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3">
                    <Link2 className="h-4 w-4" />
                    Related Keywords
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Siblings */}
                    {siblings.length > 0 && (
                      <RelatedConceptGroup
                        label="Siblings"
                        concepts={siblings}
                        maxDisplay={MAX_RELATED_DISPLAY}
                        colorClass="sibling"
                        onConceptClick={onNodeClick}
                      />
                    )}

                    {/* Descendants */}
                    {descendants.length > 0 && (
                      <RelatedConceptGroup
                        label="Descendants"
                        concepts={descendants}
                        maxDisplay={MAX_RELATED_DISPLAY}
                        colorClass="descendant"
                        onConceptClick={onNodeClick}
                      />
                    )}

                    {/* Ambiguous concepts */}
                    {concept?.ambiguous_with && concept.ambiguous_with.length > 0 && (
                      <AmbiguousConceptGroup
                        concepts={concept.ambiguous_with}
                        onConceptClick={onNodeClick}
                      />
                    )}

                    {/* No related keywords message */}
                    {!hasRelatedConcepts && (
                      <p className="text-sm text-muted-foreground italic">
                        No related keywords found
                      </p>
                    )}
                  </div>
                </section>

                {/* Knowledge Graph */}
                <section className="border-t pt-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3">
                    <GitBranch className="h-4 w-4" />
                    Knowledge Graph
                  </h3>
                  <MiniGraph
                    concept={concept}
                    siblings={siblings}
                    descendants={descendants}
                    onNodeClick={onNodeClick}
                  />
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Click on a node to explore
                  </p>
                </section>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )

  // Render as portal to document.body
  if (typeof document !== 'undefined') {
    return createPortal(popupContent, document.body)
  }

  return null
}


/**
 * Props for RelatedConceptGroup component
 */
interface RelatedConceptGroupProps {
  label: string
  concepts: RelatedConcept[]
  maxDisplay: number
  colorClass: 'sibling' | 'descendant'
  onConceptClick: (id: string, name: string) => void
}

/**
 * Color configurations for concept tags
 */
const CONCEPT_COLORS = {
  sibling: {
    label: 'text-blue-600 dark:text-blue-400',
    tag: 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-500 hover:text-white hover:border-blue-500'
  },
  descendant: {
    label: 'text-emerald-600 dark:text-emerald-400',
    tag: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-500 hover:text-white hover:border-emerald-500'
  },
  ambiguous: {
    label: 'text-amber-600 dark:text-amber-400',
    tag: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-500 hover:text-white hover:border-amber-500'
  }
}

/**
 * RelatedConceptGroup - displays a group of related concepts (siblings or descendants)
 */
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
    <div className="space-y-2">
      <span className={cn("text-xs font-semibold uppercase tracking-wide", colors.label)}>
        {label}:
      </span>
      <div className="flex flex-wrap gap-2">
        {displayConcepts.map((concept) => (
          <button
            key={concept.id}
            onClick={() => onConceptClick(concept.id, concept.name)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
              "hover:shadow-sm active:scale-95",
              colors.tag
            )}
          >
            {concept.name}
          </button>
        ))}
        {remainingCount > 0 && (
          <span className="px-3 py-1.5 text-xs text-muted-foreground italic">
            +{remainingCount} more
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Props for AmbiguousConceptGroup component
 */
interface AmbiguousConceptGroupProps {
  concepts: string[]
  onConceptClick: (id: string, name: string) => void
}

/**
 * AmbiguousConceptGroup - displays ambiguous concepts
 */
function AmbiguousConceptGroup({
  concepts,
  onConceptClick
}: AmbiguousConceptGroupProps) {
  const colors = CONCEPT_COLORS.ambiguous

  return (
    <div className="space-y-2">
      <span className={cn("text-xs font-semibold uppercase tracking-wide", colors.label)}>
        Ambiguous with:
      </span>
      <div className="flex flex-wrap gap-2">
        {concepts.slice(0, 3).map((conceptId) => {
          const displayName = conceptId.length > 12 ? `${conceptId.slice(0, 8)}...` : conceptId
          return (
            <button
              key={conceptId}
              onClick={() => onConceptClick(conceptId, displayName)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                "hover:shadow-sm active:scale-95",
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
