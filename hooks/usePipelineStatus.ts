import { useState, useEffect } from 'react'

export interface PipelineStatus {
  ready?: boolean
  building?: boolean
  chunks?: number
  percent?: number
  stage?: string
  message?: string
}

interface UsePipelineStatusOptions {
  pollInterval?: number
  enabled?: boolean
}

/**
 * Hook to poll the QA pipeline status
 * @param options - Configuration options
 * @returns Pipeline status and readiness state
 */
export function usePipelineStatus(options: UsePipelineStatusOptions = {}) {
  const { pollInterval = 2000, enabled = true } = options
  const [isPipelineReady, setIsPipelineReady] = useState<boolean | null>(null)
  const [status, setStatus] = useState<PipelineStatus>({})

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let timerId: NodeJS.Timeout

    const poll = async () => {
      if (cancelled) return

      try {
        const res = await fetch('/api/qa/status')
        const data = await res.json().catch(() => ({}))

        if (!cancelled) {
          setIsPipelineReady(Boolean(data?.ready))
          setStatus(data)
        }

        // Continue polling if not ready
        if (!data?.ready && !cancelled) {
          timerId = setTimeout(poll, pollInterval)
        }
      } catch (error) {
        console.warn('[Pipeline] Status check failed:', error)

        // Retry on error
        if (!cancelled) {
          timerId = setTimeout(poll, pollInterval)
        }
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timerId) {
        clearTimeout(timerId)
      }
    }
  }, [pollInterval, enabled])

  return { isPipelineReady, status }
}
