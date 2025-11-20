import { useState, useEffect } from "react"
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"

interface UseSkimmingHighlightsResult {
  highlights: SkimmingHighlight[]
  loading: boolean
  error: string | null
  highlightCounts: {
    novelty: number
    method: number
    result: number
  }
}

export function useSkimmingHighlights(): UseSkimmingHighlightsResult {
  const [highlights, setHighlights] = useState<SkimmingHighlight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchHighlights = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/pdf/skimming-data")

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()

        if (data.status === "empty") {
          setHighlights([])
          return
        }

        if (data.status === "error") {
          throw new Error(data.error)
        }

        setHighlights(data.highlights || [])

      } catch (err: any) {
        console.error("[useSkimmingHighlights] Error fetching highlights:", err)
        setError(err.message || "Failed to load skimming highlights")
        setHighlights([])
      } finally {
        setLoading(false)
      }
    }

    fetchHighlights()
  }, [])

  // Calculate counts by category
  const highlightCounts = {
    novelty: highlights.filter((h) => h.label === "novelty").length,
    method: highlights.filter((h) => h.label === "method").length,
    result: highlights.filter((h) => h.label === "result").length,
  }

  return {
    highlights,
    loading,
    error,
    highlightCounts,
  }
}
