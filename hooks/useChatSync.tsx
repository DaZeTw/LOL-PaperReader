import { useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { convertBackendMessagesToQAMessages } from '@/hooks/useQAMessages'

interface BackendMessage {
  role: string
  content: string
  metadata?: Record<string, unknown>
  timestamp?: string
}

interface BackendSession {
  session_id: string
  title?: string | null
  messages?: BackendMessage[]
  metadata?: Record<string, any>
  updated_at?: string
}

interface ChatSessionListResponse {
  sessions: BackendSession[]
}

function deriveCandidateFilenames(session: BackendSession): string[] {
  const candidates = new Set<string>()
  const meta = session.metadata || {}

  const documentFilename = typeof meta.document_filename === 'string' ? meta.document_filename.trim() : ''
  if (documentFilename) {
    candidates.add(documentFilename)
  }

  const documentKey = typeof meta.document_key === 'string' ? meta.document_key.trim() : ''
  if (documentKey) {
    candidates.add(`${documentKey}.pdf`)
  }

  const title = typeof session.title === 'string' ? session.title.trim() : ''
  if (title) {
    const withoutPrefix = title.startsWith('Chat:') ? title.replace('Chat:', '').trim() : title
    if (withoutPrefix) {
      candidates.add(withoutPrefix)
    }
  }

  // Also add session_id-based fallback to avoid missing keys
  if (session.session_id) {
    candidates.add(`${session.session_id}.pdf`)
  }

  // Expand candidates by removing .pdf extension (used for tabless cache keys)
  const allKeys = new Set<string>()
  candidates.forEach((name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    allKeys.add(trimmed)
    const withoutExt = trimmed.replace(/\.pdf$/i, '')
    if (withoutExt) {
      allKeys.add(withoutExt)
    }
  })

  return Array.from(allKeys)
}

export function useChatSync(): void {
  const { user } = useAuth()
  const hasSyncedRef = useRef(false)
  const syncFlagKey = 'chat_sync_completed'

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (!user?.id) {
      return
    }
    if (hasSyncedRef.current) {
      return
    }
    if (sessionStorage.getItem(syncFlagKey) === 'true') {
      hasSyncedRef.current = true
      return
    }

    const abortController = new AbortController()

    const syncFromDatabase = async () => {
      try {
        console.log('[ChatSync] Starting chat history sync from MongoDB')
        const response = await fetch(`/api/chat/sessions?user_id=${encodeURIComponent(user.id)}`, {
          signal: abortController.signal,
        })
        if (!response.ok) {
          console.warn('[ChatSync] Failed to fetch sessions for sync:', response.status)
          return
        }

        const data: ChatSessionListResponse = await response.json()
        if (!data.sessions || data.sessions.length === 0) {
          console.log('[ChatSync] No sessions found to sync')
          return
        }

        let sessionsSynced = 0
        data.sessions.forEach((session) => {
          const backendMessages = Array.isArray(session.messages) ? session.messages : []
          if (backendMessages.length === 0) {
            return
          }

          const qaMessages = convertBackendMessagesToQAMessages(backendMessages)
          if (!qaMessages.length) {
            return
          }

          const candidateNames = deriveCandidateFilenames(session)
          if (!candidateNames.length) {
            return
          }

          candidateNames.forEach((name: string) => {
            const cacheKey = `chat_messages_${name}`
            try {
              localStorage.setItem(cacheKey, JSON.stringify(qaMessages))
              console.log(`[ChatSync] Cached ${qaMessages.length} messages to key ${cacheKey}`)
            } catch (error) {
              console.warn(`[ChatSync] Failed to cache messages to key ${cacheKey}:`, error)
            }
          })

          sessionsSynced += 1
        })

        console.log(`[ChatSync] ✅ Completed sync for ${sessionsSynced} sessions`)
        sessionStorage.setItem(syncFlagKey, 'true')
        hasSyncedRef.current = true
      } catch (error) {
        if (abortController.signal.aborted) {
          console.log('[ChatSync] Sync aborted')
          return
        }
        console.error('[ChatSync] Error syncing chat history:', error)
      }
    }

    syncFromDatabase()

    return () => {
      abortController.abort()
    }
  }, [user?.id])
}

