import { type NextRequest, NextResponse } from "next/server"

// Backend API URL - can be configured via environment variable
const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"

export async function POST(request: NextRequest) {
  try {
    const { user_id, title, initial_message } = await request.json()

    // Increase timeout to 180 seconds to allow backend/MongoDB warm-up
    const timeout = 180000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const backendResponse = await fetch(`${BACKEND_URL}/api/chat/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user_id || null,
          title: title || "Chat Session",
          initial_message: initial_message || null,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!backendResponse.ok) {
        const errorText = await backendResponse.text()
        const status = backendResponse.status
        
        // Better error handling for different status codes
        if (status === 500) {
          console.error("[ChatSession] Backend error:", errorText)
          return NextResponse.json(
            { 
              error: "Backend service error",
              details: errorText || "MongoDB connection may be unavailable. Please check backend logs."
            },
            { status: 503 } // Service Unavailable
          )
        }
        
        throw new Error(`Backend returned ${status}: ${errorText}`)
      }

      const sessionData = await backendResponse.json()
      return NextResponse.json(sessionData)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError' || fetchError.code === 23) {
        console.error("[ChatSession] Timeout:", fetchError)
        return NextResponse.json(
          { 
            error: "Request timeout",
            details: "Backend took too long to respond. This may indicate MongoDB connection issues or backend overload."
          },
          { status: 504 } // Gateway Timeout
        )
      }
      throw fetchError
    }
  } catch (error: any) {
    console.error("[ChatSession] Error:", error)
    return NextResponse.json(
      { 
        error: error.message || "Failed to create chat session",
        details: "Please ensure the backend is running and MongoDB is accessible"
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const session_id = searchParams.get("session_id")
    const user_id = searchParams.get("user_id")
    const limit = searchParams.get("limit") || "10"

    let url: string
    const params = new URLSearchParams()
    
    if (session_id) {
      // Get specific session by ID
      url = `${BACKEND_URL}/api/chat/sessions/${encodeURIComponent(session_id)}`
    } else if (user_id) {
      // List sessions for user
      url = `${BACKEND_URL}/api/chat/sessions`
      params.append("user_id", user_id)
      params.append("limit", limit)
      url += `?${params.toString()}`
    } else {
      // No params - should return error or list all (depends on backend)
      return NextResponse.json(
        { error: "session_id or user_id is required" },
        { status: 400 }
      )
    }

    // Increase timeout for GET requests as well (match POST)
    const timeout = 180000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const backendResponse = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text()
      throw new Error(`Backend returned ${backendResponse.status}: ${errorText}`)
    }

      const sessionData = await backendResponse.json()
      return NextResponse.json(sessionData)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError' || fetchError.code === 23) {
        console.error("[ChatSession] Timeout:", fetchError)
        return NextResponse.json(
          { 
            error: "Request timeout",
            details: "Backend took too long to respond. MongoDB connection may be slow."
          },
          { status: 504 }
        )
      }
      throw fetchError
    }
  } catch (error: any) {
    console.error("[ChatSession] Error:", error)
    return NextResponse.json(
      { 
        error: error.message || "Failed to get chat session",
        details: "Please ensure the backend is running and accessible"
      },
      { status: 500 }
    )
  }
}

