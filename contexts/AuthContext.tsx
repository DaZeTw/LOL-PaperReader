"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react"

import { BACKEND_API_URL } from "@/lib/config"

export interface AuthUser {
  id: string
  dbId: number
  email: string
  name?: string | null
  image?: string | null
  googleId?: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (redirectUrl?: string) => void
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function normaliseUrl(path: string): string {
  return `${BACKEND_API_URL.replace(/\/$/, "")}${path}`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(normaliseUrl("/auth/me"), {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        setUser(null)
        return
      }

      const data = await response.json()
      const dbId = data.id as number

      setUser({
        id: String(dbId),
        dbId,
        email: data.email ?? "",
        name: data.name ?? null,
        image: data.avatarUrl ?? data.avatar_url ?? null,
        googleId: data.googleId ?? data.google_id ?? null,
      })
    } catch (error) {
      console.error("[Auth] Failed to fetch session:", error)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const login = useCallback(
    (redirectUrl?: string) => {
      const target = redirectUrl || (typeof window !== "undefined" ? window.location.href : "/")
      const url = new URL(normaliseUrl("/auth/google/login"))
      url.searchParams.set("redirect", target)
      window.location.href = url.toString()
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      await fetch(normaliseUrl("/auth/logout"), {
        method: "POST",
        credentials: "include",
      })
    } catch (error) {
      console.warn("[Auth] Logout request failed:", error)
    } finally {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      refresh,
    }),
    [user, loading, login, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

