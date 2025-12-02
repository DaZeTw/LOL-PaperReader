import { type NextRequest, NextResponse } from "next/server"

// Backend API URL - can be configured via environment variable
const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"

export async function POST(request: NextRequest) {
  try {
    const { user_id, title, initial_message, force_new, document_key } = await request.json()

    // Reduced timeout to 30 seconds - backend should respond faster
    // If it takes longer, there's likely a connection issue
    const timeout = 30000
    const maxRetries = 2
    
    let lastError: any = null
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        if (attempt > 0) {
          // Exponential backoff: 1s, 2s
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 2000)
          console.log(`[ChatSession] Retry attempt ${attempt + 1}/${maxRetries + 1} after ${delay}ms`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        const backendResponse = await fetch(`${BACKEND_URL}/api/chat/sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: user_id || null,
            title: title || "Chat Session",
            initial_message: initial_message || null,
            force_new: force_new || false,
            document_key: document_key || null, // Pass document_key to backend
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
                details: errorText || "Backend service may be unavailable. Please check backend logs."
              },
              { status: 503 } // Service Unavailable
            )
          }
          
          // Retry on 503/504 errors
          if ((status === 503 || status === 504) && attempt < maxRetries) {
            lastError = new Error(`Backend returned ${status}: ${errorText}`)
            continue
          }
          
          throw new Error(`Backend returned ${status}: ${errorText}`)
        }

        const sessionData = await backendResponse.json()
        return NextResponse.json(sessionData)
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        
        if (fetchError.name === 'AbortError' || fetchError.code === 23) {
          // Timeout - retry if we have attempts left
          if (attempt < maxRetries) {
            lastError = fetchError
            console.log(`[ChatSession] Timeout on attempt ${attempt + 1}, retrying...`)
            continue
          }
          
          console.error("[ChatSession] Timeout after all retries:", fetchError)
          return NextResponse.json(
            { 
              error: "Request timeout",
              details: "Backend took too long to respond after multiple attempts. This may indicate backend overload or connectivity issues."
            },
            { status: 504 } // Gateway Timeout
          )
        }
        
        // Other errors - don't retry
        throw fetchError
      }
    }
    
    // If we exhausted all retries
    if (lastError) {
      throw lastError
    }
    
    throw new Error("Failed to create session after all retries")
  } catch (error: any) {
    console.error("[ChatSession] Error:", error)
    return NextResponse.json(
      { 
        error: error.message || "Failed to create chat session",
        details: "Please ensure the backend is running and accessible"
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
            details: "Backend took too long to respond. Please try again."
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

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const document_id = searchParams.get("document_id")
    const document_key = searchParams.get("document_key")

    if (!document_id && !document_key) {
      return NextResponse.json(
        { error: "document_id or document_key is required" },
        { status: 400 }
      )
    }

    const url = `${BACKEND_URL}/api/chat/sessions`
    const params = new URLSearchParams()
    if (document_id) {
      params.append("document_id", document_id)
    }
    if (document_key) {
      params.append("document_key", document_key)
    }
    const fullUrl = `${url}?${params.toString()}`

    const timeout = 30000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const backendResponse = await fetch(fullUrl, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!backendResponse.ok) {
        const errorText = await backendResponse.text()
        return NextResponse.json(
          {
            error: "Backend error",
            details: errorText,
          },
          { status: backendResponse.status }
        )
      }

      const data = await backendResponse.json()
      return NextResponse.json(data)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)

      if (fetchError.name === "AbortError" || fetchError.code === 23) {
        return NextResponse.json(
          {
            error: "Request timeout",
            details: "Backend took too long to respond. Please try again.",
          },
          { status: 504 }
        )
      }

      throw fetchError
    }
  } catch (error: any) {
    console.error("[ChatSession] Error deleting sessions:", error)
    return NextResponse.json(
      {
        error: error?.message || "Failed to delete chat sessions",
        details: "Please ensure the backend is running and accessible",
      },
      { status: 500 }
    )
  }
}

