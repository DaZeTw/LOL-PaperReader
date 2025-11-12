# React Hooks Architecture

## Overview

This document specifies the custom React hooks for authentication, user session management, and corpus operations in LOL-PaperReader.

---

## Hooks Summary

| Hook | Purpose | Returns | Dependencies |
|------|---------|---------|--------------|
| `useAuth()` | Authentication state & operations | `{ user, login, logout, ... }` | AuthContext |
| `useCorpus()` | Corpus management & selection | `{ corpora, selectCorpus, ... }` | CorpusContext, useAuth |
| `useProtectedRoute()` | Route protection & redirects | `{ isLoading, isAuthenticated }` | useAuth, useRouter |
| `useSession()` | Enhanced session management | `{ session, createSession, ... }` | useAuth, useCorpus |
| `useDocumentUpload()` | Document upload to corpus | `{ upload, progress, ... }` | useCorpus |
| `useCorpusQuery()` | Q&A scoped to corpus | `{ ask, history, ... }` | useSession, useCorpus |

---

## 1. useAuth Hook

### Purpose
Provides authentication state and operations throughout the application.

### Implementation

```typescript
// contexts/auth-context.tsx

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  email: string
  name: string
  profile_picture?: string
  created_at: string
}

interface AuthContextType {
  // State
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Operations
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
  updateUser: (data: Partial<User>) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Check if user is already authenticated on mount
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/auth/me', {
        credentials: 'include' // Send httpOnly cookie
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch (err) {
      console.error('Auth check failed:', err)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const login = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Login failed')
      }

      const data = await response.json()
      setUser(data.user)

      // Redirect to corpus page after successful login
      router.push('/corpus')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed'
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [router])

  const signup = useCallback(async (
    name: string,
    email: string,
    password: string
  ) => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Signup failed')
      }

      const data = await response.json()
      setUser(data.user)

      // Auto-login after signup
      router.push('/corpus')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Signup failed'
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [router])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })

      setUser(null)
      router.push('/login')
    } catch (err) {
      console.error('Logout failed:', err)
      // Clear local state even if API call fails
      setUser(null)
      router.push('/login')
    }
  }, [router])

  const refreshToken = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Token refresh failed')
      }

      // Token is refreshed via httpOnly cookie
      // Re-check auth status
      await checkAuth()
    } catch (err) {
      console.error('Token refresh failed:', err)
      // If refresh fails, logout user
      setUser(null)
      router.push('/login')
    }
  }, [router])

  const updateUser = useCallback(async (data: Partial<User>) => {
    try {
      const response = await fetch('/api/auth/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        throw new Error('Update failed')
      }

      const updatedUser = await response.json()
      setUser(updatedUser.user)
    } catch (err) {
      console.error('User update failed:', err)
      throw err
    }
  }, [])

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    signup,
    logout,
    refreshToken,
    updateUser
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

### Usage Example

```typescript
// In a component
function LoginForm() {
  const { login, isLoading, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password)
      // Redirected by login function
    } catch (err) {
      // Error displayed via error state
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <Input value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <Button type="submit" disabled={isLoading}>
        {isLoading ? 'Logging in...' : 'Login'}
      </Button>
    </form>
  )
}
```

---

## 2. useCorpus Hook

### Purpose
Manages corpus state, selection, and CRUD operations.

### Implementation

```typescript
// contexts/corpus-context.tsx

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './auth-context'

interface Corpus {
  id: string
  user_id: string
  name: string
  description?: string
  document_count: number
  total_size_bytes: number
  created_at: string
  updated_at: string
  tags: string[]
}

interface Document {
  id: string
  corpus_id: string
  file_name: string
  file_size: number
  uploaded_at: string
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  parsed_data?: any
}

interface CorpusContextType {
  // State
  corpora: Corpus[]
  activeCorpus: Corpus | null
  activeCorpusDocuments: Document[]
  isLoading: boolean
  error: string | null

  // Operations
  fetchCorpora: () => Promise<void>
  selectCorpus: (corpusId: string) => Promise<void>
  createCorpus: (data: CreateCorpusInput) => Promise<Corpus>
  updateCorpus: (corpusId: string, data: Partial<Corpus>) => Promise<void>
  deleteCorpus: (corpusId: string) => Promise<void>
  fetchDocuments: (corpusId: string) => Promise<void>
}

interface CreateCorpusInput {
  name: string
  description?: string
  tags?: string[]
}

const CorpusContext = createContext<CorpusContextType | undefined>(undefined)

export function CorpusProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [activeCorpus, setActiveCorpus] = useState<Corpus | null>(null)
  const [activeCorpusDocuments, setActiveCorpusDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch corpora when user authenticates
  useEffect(() => {
    if (isAuthenticated) {
      fetchCorpora()
    } else {
      setCorpora([])
      setActiveCorpus(null)
      setActiveCorpusDocuments([])
    }
  }, [isAuthenticated])

  // Restore active corpus from localStorage
  useEffect(() => {
    if (corpora.length > 0) {
      const savedCorpusId = localStorage.getItem('active_corpus_id')
      if (savedCorpusId) {
        const corpus = corpora.find(c => c.id === savedCorpusId)
        if (corpus) {
          selectCorpus(corpus.id)
        }
      }
    }
  }, [corpora])

  const fetchCorpora = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/corpus/list', {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to fetch corpora')
      }

      const data = await response.json()
      setCorpora(data.corpora)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Fetch failed'
      setError(errorMessage)
      console.error('Fetch corpora failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const selectCorpus = useCallback(async (corpusId: string) => {
    try {
      setIsLoading(true)
      setError(null)

      // Fetch corpus details
      const response = await fetch(`/api/corpus/${corpusId}`, {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to fetch corpus')
      }

      const data = await response.json()
      setActiveCorpus(data.corpus)

      // Save to localStorage
      localStorage.setItem('active_corpus_id', corpusId)

      // Fetch documents for this corpus
      await fetchDocuments(corpusId)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Select failed'
      setError(errorMessage)
      console.error('Select corpus failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const createCorpus = useCallback(async (input: CreateCorpusInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/corpus/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input)
      })

      if (!response.ok) {
        throw new Error('Failed to create corpus')
      }

      const data = await response.json()
      const newCorpus = data.corpus

      // Update local state
      setCorpora(prev => [...prev, newCorpus])

      // Auto-select new corpus
      setActiveCorpus(newCorpus)
      localStorage.setItem('active_corpus_id', newCorpus.id)

      return newCorpus
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Create failed'
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateCorpus = useCallback(async (
    corpusId: string,
    data: Partial<Corpus>
  ) => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`/api/corpus/${corpusId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        throw new Error('Failed to update corpus')
      }

      const updatedCorpus = await response.json()

      // Update local state
      setCorpora(prev =>
        prev.map(c => c.id === corpusId ? updatedCorpus.corpus : c)
      )

      if (activeCorpus?.id === corpusId) {
        setActiveCorpus(updatedCorpus.corpus)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Update failed'
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [activeCorpus])

  const deleteCorpus = useCallback(async (corpusId: string) => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`/api/corpus/${corpusId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to delete corpus')
      }

      // Update local state
      setCorpora(prev => prev.filter(c => c.id !== corpusId))

      if (activeCorpus?.id === corpusId) {
        setActiveCorpus(null)
        setActiveCorpusDocuments([])
        localStorage.removeItem('active_corpus_id')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Delete failed'
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [activeCorpus])

  const fetchDocuments = useCallback(async (corpusId: string) => {
    try {
      const response = await fetch(`/api/corpus/${corpusId}/documents`, {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }

      const data = await response.json()
      setActiveCorpusDocuments(data.documents)
    } catch (err) {
      console.error('Fetch documents failed:', err)
      setActiveCorpusDocuments([])
    }
  }, [])

  const value = {
    corpora,
    activeCorpus,
    activeCorpusDocuments,
    isLoading,
    error,
    fetchCorpora,
    selectCorpus,
    createCorpus,
    updateCorpus,
    deleteCorpus,
    fetchDocuments
  }

  return <CorpusContext.Provider value={value}>{children}</CorpusContext.Provider>
}

export function useCorpus() {
  const context = useContext(CorpusContext)
  if (context === undefined) {
    throw new Error('useCorpus must be used within CorpusProvider')
  }
  return context
}
```

### Usage Example

```typescript
function CorpusPage() {
  const { corpora, isLoading, createCorpus } = useCorpus()
  const [showDialog, setShowDialog] = useState(false)

  const handleCreateCorpus = async (name: string, description: string) => {
    try {
      await createCorpus({ name, description })
      setShowDialog(false)
      toast({ title: 'Corpus created successfully' })
    } catch (err) {
      toast({ title: 'Failed to create corpus', variant: 'destructive' })
    }
  }

  if (isLoading) return <LoadingSpinner />

  return (
    <div>
      <Button onClick={() => setShowDialog(true)}>New Corpus</Button>
      <CorpusGrid corpora={corpora} />
      <NewCorpusDialog open={showDialog} onSubmit={handleCreateCorpus} />
    </div>
  )
}
```

---

## 3. useProtectedRoute Hook

### Purpose
Protects routes from unauthorized access, handles redirects.

### Implementation

```typescript
// hooks/use-protected-route.ts

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'

interface UseProtectedRouteOptions {
  redirectTo?: string
  redirectIfAuthenticated?: boolean
}

export function useProtectedRoute(options: UseProtectedRouteOptions = {}) {
  const {
    redirectTo = '/login',
    redirectIfAuthenticated = false
  } = options

  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoading) return // Wait for auth check

    if (redirectIfAuthenticated && isAuthenticated) {
      // Redirect authenticated users away from auth pages
      router.push('/corpus')
    } else if (!redirectIfAuthenticated && !isAuthenticated) {
      // Redirect unauthenticated users to login
      const returnUrl = encodeURIComponent(pathname)
      router.push(`${redirectTo}?redirect=${returnUrl}`)
    }
  }, [isAuthenticated, isLoading, redirectTo, redirectIfAuthenticated, router, pathname])

  return { isLoading, isAuthenticated }
}
```

### Usage Example

```typescript
// In a protected page
function CorpusPage() {
  const { isLoading } = useProtectedRoute()

  if (isLoading) {
    return <LoadingSpinner />
  }

  return <div>Corpus content...</div>
}

// In an auth page (login/signup)
function LoginPage() {
  const { isLoading } = useProtectedRoute({ redirectIfAuthenticated: true })

  if (isLoading) {
    return <LoadingSpinner />
  }

  return <LoginForm />
}
```

---

## 4. useSession Hook (Enhanced)

### Purpose
Enhanced session management with user and corpus context.

### Implementation

```typescript
// hooks/use-session.ts

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useCorpus } from '@/contexts/corpus-context'

interface ChatSession {
  session_id: string
  user_id: string
  corpus_id: string
  title?: string
  messages: Message[]
  created_at: string
  updated_at: string
  message_count: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  cited_sections?: any[]
}

interface UseSessionOptions {
  documentName?: string
  autoCreate?: boolean
}

export function useSession(options: UseSessionOptions = {}) {
  const { documentName, autoCreate = true } = options
  const { user } = useAuth()
  const { activeCorpus } = useCorpus()

  const [session, setSession] = useState<ChatSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate session storage key
  const getStorageKey = useCallback(() => {
    if (!activeCorpus) return null
    return `chat_session_${activeCorpus.id}_${documentName || 'default'}`
  }, [activeCorpus, documentName])

  // Load or create session on mount
  useEffect(() => {
    if (!user || !activeCorpus) return

    const storageKey = getStorageKey()
    if (!storageKey) return

    const savedSessionId = localStorage.getItem(storageKey)

    if (savedSessionId) {
      verifySession(savedSessionId)
    } else if (autoCreate) {
      createSession()
    }
  }, [user, activeCorpus, documentName])

  const verifySession = async (sessionId: string) => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/chat/sessions?session_id=${sessionId}`, {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        setSession(data.session)
      } else {
        // Session not found, create new one
        if (autoCreate) {
          await createSession()
        }
      }
    } catch (err) {
      console.error('Session verification failed:', err)
      if (autoCreate) {
        await createSession()
      }
    } finally {
      setIsLoading(false)
    }
  }

  const createSession = async (title?: string) => {
    if (!user || !activeCorpus) {
      setError('User or corpus not available')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          user_id: user.id,
          corpus_id: activeCorpus.id,
          title: title || `Session for ${documentName || 'Document'}`
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create session')
      }

      const data = await response.json()
      setSession(data.session)

      // Save to localStorage
      const storageKey = getStorageKey()
      if (storageKey) {
        localStorage.setItem(storageKey, data.session.session_id)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Session creation failed'
      setError(errorMessage)
      console.error('Create session failed:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const addMessage = useCallback((message: Message) => {
    setSession(prev => {
      if (!prev) return null

      const updatedSession = {
        ...prev,
        messages: [...prev.messages, message],
        message_count: prev.message_count + 1,
        updated_at: new Date().toISOString()
      }

      // Save to localStorage
      const storageKey = getStorageKey()
      if (storageKey) {
        localStorage.setItem(`${storageKey}_messages`, JSON.stringify(updatedSession.messages))
      }

      return updatedSession
    })
  }, [getStorageKey])

  const clearSession = useCallback(() => {
    const storageKey = getStorageKey()
    if (storageKey) {
      localStorage.removeItem(storageKey)
      localStorage.removeItem(`${storageKey}_messages`)
    }
    setSession(null)
  }, [getStorageKey])

  return {
    session,
    isLoading,
    error,
    createSession,
    addMessage,
    clearSession
  }
}
```

### Usage Example

```typescript
function QAInterface({ documentName }: { documentName: string }) {
  const { session, addMessage, isLoading } = useSession({ documentName })
  const [question, setQuestion] = useState('')

  const handleAsk = async () => {
    if (!session) return

    addMessage({
      role: 'user',
      content: question,
      timestamp: new Date().toISOString()
    })

    // Call API to get answer
    const response = await fetch('/api/chat/ask', {
      method: 'POST',
      body: JSON.stringify({
        session_id: session.session_id,
        question
      })
    })

    const data = await response.json()

    addMessage({
      role: 'assistant',
      content: data.answer,
      timestamp: new Date().toISOString(),
      cited_sections: data.cited_sections
    })
  }

  return (
    <div>
      <MessageList messages={session?.messages || []} />
      <Input value={question} onChange={(e) => setQuestion(e.target.value)} />
      <Button onClick={handleAsk} disabled={isLoading}>Ask</Button>
    </div>
  )
}
```

---

## 5. useDocumentUpload Hook

### Purpose
Handles document upload to corpus with progress tracking.

### Implementation

```typescript
// hooks/use-document-upload.ts

import { useState, useCallback } from 'react'
import { useCorpus } from '@/contexts/corpus-context'

interface UploadProgress {
  progress: number
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error'
  message: string
}

export function useDocumentUpload() {
  const { activeCorpus, fetchDocuments } = useCorpus()
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    progress: 0,
    status: 'idle',
    message: ''
  })

  const upload = useCallback(async (file: File) => {
    if (!activeCorpus) {
      throw new Error('No active corpus selected')
    }

    try {
      setUploadProgress({
        progress: 0,
        status: 'uploading',
        message: 'Uploading document...'
      })

      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100
          setUploadProgress({
            progress,
            status: 'uploading',
            message: `Uploading: ${Math.round(progress)}%`
          })
        }
      })

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          setUploadProgress({
            progress: 100,
            status: 'processing',
            message: 'Processing document...'
          })

          // Wait for processing to complete (poll status or use WebSocket)
          setTimeout(async () => {
            setUploadProgress({
              progress: 100,
              status: 'completed',
              message: 'Upload completed!'
            })

            // Refresh document list
            await fetchDocuments(activeCorpus.id)

            // Reset after 2 seconds
            setTimeout(() => {
              setUploadProgress({
                progress: 0,
                status: 'idle',
                message: ''
              })
            }, 2000)
          }, 2000)
        } else {
          throw new Error('Upload failed')
        }
      })

      // Handle errors
      xhr.addEventListener('error', () => {
        setUploadProgress({
          progress: 0,
          status: 'error',
          message: 'Upload failed'
        })
      })

      // Send request
      xhr.open('POST', `/api/corpus/${activeCorpus.id}/upload`)
      xhr.send(formData)
    } catch (err) {
      setUploadProgress({
        progress: 0,
        status: 'error',
        message: err instanceof Error ? err.message : 'Upload failed'
      })
      throw err
    }
  }, [activeCorpus, fetchDocuments])

  const reset = useCallback(() => {
    setUploadProgress({
      progress: 0,
      status: 'idle',
      message: ''
    })
  }, [])

  return {
    upload,
    uploadProgress,
    reset
  }
}
```

### Usage Example

```typescript
function UploadDocumentDialog() {
  const { upload, uploadProgress } = useDocumentUpload()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      await upload(selectedFile)
      toast({ title: 'Document uploaded successfully' })
    } catch (err) {
      toast({ title: 'Upload failed', variant: 'destructive' })
    }
  }

  return (
    <Dialog>
      <Input type="file" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />

      {uploadProgress.status !== 'idle' && (
        <div>
          <Progress value={uploadProgress.progress} />
          <p>{uploadProgress.message}</p>
        </div>
      )}

      <Button onClick={handleUpload} disabled={uploadProgress.status === 'uploading'}>
        Upload
      </Button>
    </Dialog>
  )
}
```

---

## 6. useCorpusQuery Hook

### Purpose
Q&A queries scoped to active corpus.

### Implementation

```typescript
// hooks/use-corpus-query.ts

import { useState, useCallback } from 'react'
import { useSession } from './use-session'
import { useCorpus } from '@/contexts/corpus-context'

interface QueryOptions {
  retriever?: 'hybrid' | 'dense' | 'sparse'
  generator?: string
  top_k?: number
  max_tokens?: number
}

export function useCorpusQuery(options: QueryOptions = {}) {
  const { session, addMessage } = useSession()
  const { activeCorpus } = useCorpus()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ask = useCallback(async (question: string, userOptions?: QueryOptions) => {
    if (!session || !activeCorpus) {
      throw new Error('No active session or corpus')
    }

    try {
      setIsLoading(true)
      setError(null)

      // Add user message immediately
      addMessage({
        role: 'user',
        content: question,
        timestamp: new Date().toISOString()
      })

      const response = await fetch('/api/chat/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: AbortSignal.timeout(180000), // 3 min timeout
        body: JSON.stringify({
          session_id: session.session_id,
          corpus_id: activeCorpus.id,
          question,
          retriever: userOptions?.retriever || options.retriever || 'hybrid',
          generator: userOptions?.generator || options.generator || 'gpt-4',
          top_k: userOptions?.top_k || options.top_k || 5,
          max_tokens: userOptions?.max_tokens || options.max_tokens || 500
        })
      })

      if (!response.ok) {
        throw new Error('Query failed')
      }

      const data = await response.json()

      // Add assistant message
      addMessage({
        role: 'assistant',
        content: data.answer,
        timestamp: new Date().toISOString(),
        cited_sections: data.cited_sections
      })

      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Query failed'
      setError(errorMessage)

      // Add error message
      addMessage({
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errorMessage}`,
        timestamp: new Date().toISOString()
      })

      throw err
    } finally {
      setIsLoading(false)
    }
  }, [session, activeCorpus, addMessage, options])

  return {
    ask,
    isLoading,
    error,
    history: session?.messages || []
  }
}
```

---

## Hook Dependencies Diagram

```
useAuth (standalone)
  ↓
  ├─→ useProtectedRoute
  └─→ useCorpus
        ↓
        ├─→ useSession
        │     ↓
        │     └─→ useCorpusQuery
        │
        └─→ useDocumentUpload
```

---

## Testing Hooks

### Example: Testing useAuth

```typescript
// __tests__/hooks/use-auth.test.tsx

import { renderHook, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '@/contexts/auth-context'

describe('useAuth', () => {
  it('should login successfully', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider
    })

    await act(async () => {
      await result.current.login('test@example.com', 'password')
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).not.toBeNull()
  })

  it('should handle login error', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider
    })

    await act(async () => {
      try {
        await result.current.login('invalid@example.com', 'wrong')
      } catch (err) {
        // Expected error
      }
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.error).not.toBeNull()
  })
})
```

---

## Performance Optimization

### 1. Memoization
```typescript
// Use useMemo for expensive computations
const sortedCorpora = useMemo(() => {
  return corpora.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}, [corpora])
```

### 2. Debouncing
```typescript
// Debounce search queries
const debouncedSearch = useMemo(
  () => debounce((query: string) => {
    // Perform search
  }, 300),
  []
)
```

### 3. Lazy Loading
```typescript
// Lazy load documents only when needed
const loadDocuments = useCallback(async () => {
  if (!documentsLoaded) {
    await fetchDocuments(corpusId)
    setDocumentsLoaded(true)
  }
}, [corpusId, documentsLoaded])
```

---

**Document Version:** 1.0
**Last Updated:** 2025-11-08
**Status:** Ready for Implementation
