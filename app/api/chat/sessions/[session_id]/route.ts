import { type NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"

interface RouteContext {
  params: {
    session_id: string
  }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const sessionId = params.session_id

  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 })
  }

  const url = `${BACKEND_URL}/api/chat/sessions/${encodeURIComponent(sessionId)}`
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
      return NextResponse.json(
        {
          error: "Backend error",
          details: errorText,
        },
        { status: backendResponse.status },
      )
    }

    const data = await backendResponse.json()
    return NextResponse.json(data)
  } catch (error: any) {
    clearTimeout(timeoutId)

    if (error?.name === "AbortError" || error?.code === 23) {
      return NextResponse.json(
        {
          error: "Request timeout",
          details: "Backend took too long to respond. MongoDB connection may be slow.",
        },
        { status: 504 },
      )
    }

    return NextResponse.json(
      {
        error: error?.message || "Failed to get chat session",
        details: "Please ensure the backend is running and accessible",
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const sessionId = params.session_id

  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 })
  }

  const url = `${BACKEND_URL}/api/chat/sessions/${encodeURIComponent(sessionId)}`
  const timeout = 30000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const backendResponse = await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (backendResponse.status === 404) {
      return NextResponse.json({ message: "Session already deleted" }, { status: 200 })
    }

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text()
      return NextResponse.json(
        {
          error: "Backend error",
          details: errorText,
        },
        { status: backendResponse.status },
      )
    }

    const data = await backendResponse.json().catch(() => ({ message: "Session deleted successfully" }))
    return NextResponse.json(data)
  } catch (error: any) {
    clearTimeout(timeoutId)

    if (error?.name === "AbortError" || error?.code === 23) {
      return NextResponse.json(
        {
          error: "Request timeout",
          details: "Backend took too long to respond. MongoDB connection may be slow.",
        },
        { status: 504 },
      )
    }

    return NextResponse.json(
      {
        error: error?.message || "Failed to delete chat session",
        details: "Please ensure the backend is running and accessible",
      },
      { status: 500 },
    )
  }
}
