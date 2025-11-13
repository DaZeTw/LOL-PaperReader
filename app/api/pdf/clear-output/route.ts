import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

// Backend API URL - can be configured via environment variable
const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"

export async function DELETE(request: NextRequest) {
  try {
    const backendResponse = await fetch(`${BACKEND_URL}/api/pdf/clear-output/`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text()
      console.error("[ClearOutput] Backend error:", errorText)
      return NextResponse.json({ error: errorText }, { status: backendResponse.status })
    }

    const data = await backendResponse.json()
    console.log("[ClearOutput] Success:", data)
    return NextResponse.json(data)
  } catch (error) {
    console.error("[ClearOutput] Error:", error)
    return NextResponse.json({ error: "Failed to clear output directory" }, { status: 500 })
  }
}

