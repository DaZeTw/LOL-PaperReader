"use client"

import React, { useRef, useEffect, useCallback, useState, useMemo } from "react"
import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import type { ConceptData, RelatedConcept } from "@/hooks/useTaxonomyAPI"

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  ),
})

// ============================================================================
// Types
// ============================================================================

/**
 * Node types for the knowledge graph
 */
export type NodeType = "central" | "sibling" | "descendant" | "ambiguous"

/**
 * Graph node structure
 */
export interface GraphNode {
  id: string
  name: string
  type: NodeType
  val: number
  x?: number
  y?: number
}

/**
 * Graph link structure
 */
export interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: "sibling" | "descendant" | "ambiguous"
}

/**
 * Graph data structure
 */
export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

/**
 * Props for the MiniGraph component
 */
export interface MiniGraphProps {
  /** Central concept to display */
  concept: ConceptData | null
  /** Sibling concepts */
  siblings?: RelatedConcept[]
  /** Descendant concepts */
  descendants?: RelatedConcept[]
  /** Callback when a non-central node is clicked */
  onNodeClick?: (nodeId: string, nodeName: string) => void
  /** Additional CSS classes */
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Node colors by type
 */
const NODE_COLORS: Record<NodeType, string> = {
  central: "#6366f1",    // Primary/indigo
  sibling: "#3b82f6",    // Blue
  descendant: "#10b981", // Emerald/green
  ambiguous: "#f59e0b",  // Amber/orange
}

/**
 * Link colors by type (with transparency)
 */
const LINK_COLORS: Record<string, string> = {
  sibling: "rgba(59, 130, 246, 0.5)",
  descendant: "rgba(16, 185, 129, 0.5)",
  ambiguous: "rgba(245, 158, 11, 0.5)",
}

/**
 * Node sizes by type
 */
const NODE_SIZES: Record<NodeType, number> = {
  central: 12,
  sibling: 6,
  descendant: 5,
  ambiguous: 5,
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get color for a node based on its type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNodeColor(node: any): string {
  return NODE_COLORS[node.type as NodeType] || "#6b7280"
}

/**
 * Get color for a link based on its type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLinkColor(link: any): string {
  return LINK_COLORS[link.type] || "rgba(107, 114, 128, 0.5)"
}

/**
 * Truncate a label to a maximum length
 */
function truncateLabel(label: string, maxLen: number = 15): string {
  return label.length > maxLen ? `${label.slice(0, maxLen)}...` : label
}

// ============================================================================
// Component
// ============================================================================

/**
 * MiniGraph - Interactive force-directed knowledge graph visualization
 * 
 * Displays concept relationships using react-force-graph-2d:
 * - Central node: The selected concept (primary color)
 * - Sibling nodes: Related concepts at the same level (blue)
 * - Descendant nodes: Child concepts (green)
 * - Ambiguous nodes: Concepts with ambiguous relationships (amber)
 * 
 * Features:
 * - Force-directed layout for automatic positioning
 * - Click on non-central nodes to navigate
 * - Color-coded legend
 * - Responsive sizing
 * - Empty state handling
 * 
 * @example
 * ```tsx
 * <MiniGraph
 *   concept={conceptData}
 *   siblings={siblingConcepts}
 *   descendants={descendantConcepts}
 *   onNodeClick={(id, name) => handleNodeClick(id, name)}
 * />
 * ```
 */
export function MiniGraph({
  concept,
  siblings = [],
  descendants = [],
  onNodeClick,
  className,
}: MiniGraphProps) {
  const graphRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 350, height: 250 })

  // Build graph data from concept, siblings, and descendants
  const graphData = useMemo((): GraphData => {
    if (!concept) {
      return { nodes: [], links: [] }
    }

    const nodes: GraphNode[] = []
    const links: GraphLink[] = []
    const nodeIds = new Set<string>()

    // Add central node
    nodes.push({
      id: concept.id,
      name: concept.name,
      type: "central",
      val: NODE_SIZES.central,
    })
    nodeIds.add(concept.id)

    // Add sibling nodes
    siblings.forEach((sib) => {
      if (!nodeIds.has(sib.id)) {
        nodes.push({
          id: sib.id,
          name: sib.name,
          type: "sibling",
          val: NODE_SIZES.sibling,
        })
        nodeIds.add(sib.id)
        links.push({
          source: concept.id,
          target: sib.id,
          type: "sibling",
        })
      }
    })

    // Add descendant nodes
    descendants.forEach((desc) => {
      if (!nodeIds.has(desc.id)) {
        nodes.push({
          id: desc.id,
          name: desc.name,
          type: "descendant",
          val: NODE_SIZES.descendant,
        })
        nodeIds.add(desc.id)
        links.push({
          source: concept.id,
          target: desc.id,
          type: "descendant",
        })
      }
    })

    // Add ambiguous nodes
    if (concept.ambiguous_with && concept.ambiguous_with.length > 0) {
      concept.ambiguous_with.forEach((ambId) => {
        if (!nodeIds.has(ambId)) {
          nodes.push({
            id: ambId,
            name: `Ambiguous (${ambId.slice(0, 6)}...)`,
            type: "ambiguous",
            val: NODE_SIZES.ambiguous,
          })
          nodeIds.add(ambId)
          links.push({
            source: concept.id,
            target: ambId,
            type: "ambiguous",
          })
        }
      })
    }

    return { nodes, links }
  }, [concept, siblings, descendants])

  // Update dimensions when container resizes
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect()
        if (width > 0 && height > 0) {
          setDimensions({ width, height: height - 30 }) // Account for legend
        }
      }
    }

    updateDimensions()

    // Use ResizeObserver for responsive sizing
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Center graph on load/concept change
  useEffect(() => {
    if (graphRef.current && concept) {
      const timer = setTimeout(() => {
        graphRef.current?.zoomToFit(400, 30)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [concept])

  // Handle node click - use any to avoid complex library type issues
  const handleNodeClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any) => {
      // Only trigger for non-central nodes
      if (onNodeClick && node.id !== concept?.id) {
        onNodeClick(node.id, node.name)
      }
    },
    [onNodeClick, concept?.id]
  )

  // Custom node rendering - use any for library compatibility
  const nodeCanvasObject = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name || ""
      const fontSize = 10 / globalScale
      ctx.font = `${fontSize}px Inter, -apple-system, sans-serif`

      // Draw node circle
      ctx.beginPath()
      ctx.arc(node.x || 0, node.y || 0, (node.val || 5) / globalScale, 0, 2 * Math.PI)
      ctx.fillStyle = getNodeColor(node as GraphNode)
      ctx.fill()

      // Draw label below node
      ctx.textAlign = "center"
      ctx.textBaseline = "top"
      ctx.fillStyle = "#1f2937"

      const displayLabel = truncateLabel(label)
      ctx.fillText(displayLabel, node.x || 0, (node.y || 0) + (node.val || 5) / globalScale + 2)
    },
    []
  )

  // Custom pointer area for better click detection - use any for library compatibility
  const nodePointerAreaPaint = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
      ctx.beginPath()
      ctx.arc(node.x || 0, node.y || 0, (node.val || 5) / globalScale + 5, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
    },
    []
  )

  // Check if there are ambiguous concepts to show in legend
  const hasAmbiguous = concept?.ambiguous_with && concept.ambiguous_with.length > 0

  // Empty state
  if (!concept || graphData.nodes.length === 0) {
    return (
      <div
        ref={containerRef}
        className={cn(
          "w-full h-[280px] bg-muted/30 rounded-lg flex items-center justify-center border border-dashed",
          className
        )}
      >
        <span className="text-sm text-muted-foreground italic">
          No graph data available
        </span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn("w-full h-[280px] bg-muted/30 rounded-lg overflow-hidden", className)}
    >
      {/* Legend */}
      <div className="flex gap-3 px-3 py-2 text-xs bg-background/80 border-b">
        <LegendItem color={NODE_COLORS.central} label="Current" />
        <LegendItem color={NODE_COLORS.sibling} label="Sibling" />
        <LegendItem color={NODE_COLORS.descendant} label="Descendant" />
        {hasAmbiguous && <LegendItem color={NODE_COLORS.ambiguous} label="Ambiguous" />}
      </div>

      {/* Graph */}
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeLabel="name"
        nodeColor={getNodeColor}
        linkColor={getLinkColor}
        linkWidth={2}
        nodeRelSize={4}
        onNodeClick={handleNodeClick}
        cooldownTicks={50}
        d3AlphaDecay={0.05}
        d3VelocityDecay={0.3}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={nodePointerAreaPaint}
      />
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Legend item component
 */
interface LegendItemProps {
  color: string
  label: string
}

function LegendItem({ color, label }: LegendItemProps) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}

export default MiniGraph
