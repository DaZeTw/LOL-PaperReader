import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutes for processing

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

/**
 * POST /api/pdf/enable-skimming
 * Triggers skimming processing for a PDF file
 *
 * This endpoint processes a PDF using the external highlighting API
 * and caches the results for later retrieval via /api/pdf/skimming-data
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const preset = (formData.get("preset") as string) || "medium"

    if (!file) {
      return NextResponse.json(
        { status: "error", error: "No file provided" },
        { status: 400 }
      )
    }

    console.log(`[API /api/pdf/enable-skimming] Processing ${file.name} with preset: ${preset}`)

    // Forward request to backend
    const backendFormData = new FormData()
    backendFormData.append("file", file)
    backendFormData.append("preset", preset)

    const response = await fetch(`${BACKEND_URL}/api/skimming/process-and-highlight`, {
      method: "POST",
      body: backendFormData,
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`[API /api/pdf/enable-skimming] Backend error:`, error)
      return NextResponse.json(
        { status: "error", error: `Backend error: ${error}` },
        { status: response.status }
      )
    }

    const result = await response.json()
    console.log(`[API /api/pdf/enable-skimming] Success: ${result.highlights?.length || 0} highlights`)

    return NextResponse.json({
      status: "ok",
      file_name: file.name,
      highlights: result.highlights || [],
      preset: result.preset,
      count: result.highlights?.length || 0,
    })

  } catch (error: any) {
    console.error("[API /api/pdf/enable-skimming] Error:", error)
    return NextResponse.json(
      { status: "error", error: error.message || "Failed to enable skimming" },
      { status: 500 }
    )
  }
}
