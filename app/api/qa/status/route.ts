import { type NextRequest, NextResponse } from "next/server"

// Backend API URL - can be configured via environment variable
const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/pdf/status`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      return NextResponse.json({ building: false, ready: false, error: `Backend ${res.status}: ${txt}` }, { status: 200 })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ building: false, ready: false, error: e?.message || "status check failed" })
  }
}


