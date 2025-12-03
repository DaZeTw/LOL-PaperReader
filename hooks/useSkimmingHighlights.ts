import { useState, useCallback } from "react"
import type { SkimmingHighlight } from "@/components/pdf-highlight-overlay"

type PresetType = "light" | "medium" | "heavy"

interface UseSkimmingHighlightsResult {
  highlights: SkimmingHighlight[]
  loading: boolean
  error: string | null
  processing: boolean
  highlightCounts: {
    objective: number
    method: number
    result: number
  }
  enableSkimming: (file: File, preset: PresetType) => Promise<void>
  fetchHighlights: (fileName: string, preset: PresetType) => Promise<void>
  clearHighlights: () => void
}

export function useSkimmingHighlights(): UseSkimmingHighlightsResult {
  const [highlights, setHighlights] = useState<SkimmingHighlight[]>([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch highlights for an already processed file
  const fetchHighlights = useCallback(async (fileName: string, preset: PresetType = "medium") => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/pdf/skimming-data?file_name=${encodeURIComponent(fileName)}&preset=${preset}`
      )

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
      console.log(`[useSkimmingHighlights] Loaded ${data.highlights?.length || 0} highlights`)

    } catch (err: any) {
      console.error("[useSkimmingHighlights] Error fetching highlights:", err)
      setError(err.message || "Failed to load skimming highlights")
      setHighlights([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Enable skimming for a new file (triggers processing)
  const enableSkimming = useCallback(async (file: File, preset: PresetType = "medium") => {
    setProcessing(true)
    setError(null)

    try {
      console.log(`[useSkimmingHighlights] Enabling skimming for ${file.name} with preset: ${preset}`)

      const formData = new FormData()
      formData.append("file", file)
      formData.append("preset", preset)

      const response = await fetch("/api/pdf/enable-skimming", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.status === "error") {
        throw new Error(data.error)
      }

      setHighlights(data.highlights || [])
      console.log(`[useSkimmingHighlights] Skimming enabled: ${data.highlights?.length || 0} highlights`)

    } catch (err: any) {
      console.error("[useSkimmingHighlights] Error enabling skimming:", err)
      setError(err.message || "Failed to enable skimming")
      setHighlights([])
    } finally {
      setProcessing(false)
    }
  }, [])

  // Clear highlights
  const clearHighlights = useCallback(() => {
    setHighlights([])
    setError(null)
  }, [])

  // Calculate counts by category
  const highlightCounts = {
    objective: highlights.filter((h) => h.label === "objective").length,
    method: highlights.filter((h) => h.label === "method").length,
    result: highlights.filter((h) => h.label === "result").length,
  }

  return {
    highlights,
    loading,
    processing,
    error,
    highlightCounts,
    enableSkimming,
    fetchHighlights,
    clearHighlights,
  }
}
