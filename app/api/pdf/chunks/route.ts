import { NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export async function GET() {
  try {
    console.log("[API] Fetching chunks from backend:", `${BACKEND_URL}/api/pdf/chunks`)

    const response = await fetch(`${BACKEND_URL}/api/pdf/chunks`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      console.error("[API] Backend chunks fetch failed:", response.status, response.statusText)
      return NextResponse.json(
        { error: "Failed to fetch chunks from backend", status: response.status },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log("[API] Chunks fetched successfully:", data.count || 0, "chunks")

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[API] Error fetching chunks:", error)
    return NextResponse.json(
      { error: error.message || "Unknown error", chunks: [], status: "error" },
      { status: 500 }
    )
  }
}
