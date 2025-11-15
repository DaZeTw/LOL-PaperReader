import { useState, useEffect } from 'react'

interface PipelineStatus {
  building?: boolean
  ready?: boolean
  chunks?: number
  percent?: number
  stage?: string
  message?: string
}

export function usePipelineStatus() {
  const [isPipelineReady, setIsPipelineReady] = useState<boolean | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({})

  useEffect(() => {
    let cancelled = false
    let timer: any

    const poll = async () => {
      try {
        const res = await fetch("/api/qa/status")
        const data = await res.json().catch(() => ({}))
        if (!cancelled) {
          setIsPipelineReady(Boolean(data?.ready))
          setPipelineStatus(data)
        }
        if (!data?.ready && !cancelled) {
          timer = setTimeout(poll, 2000)
        }
      } catch {
        if (!cancelled) {
          timer = setTimeout(poll, 2000)
        }
      }
    }

    poll()
    
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  return {
    isPipelineReady,
    pipelineStatus,
  }
}