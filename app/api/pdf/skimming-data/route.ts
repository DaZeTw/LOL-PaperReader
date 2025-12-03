import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

/**
 * GET /api/pdf/skimming-data
 * Returns skimming highlights data for a processed PDF
 *
 * Query params:
 *   - file_name: Name of the PDF file
 *   - preset: Preset mode (light/medium/heavy), default: medium
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fileName = searchParams.get("file_name")
    const preset = searchParams.get("preset") || "medium"

    if (!fileName) {
      return NextResponse.json(
        {
          status: "empty",
          message: "No file_name parameter provided"
        },
        { status: 400 }
      )
    }

    console.log(`[API /api/pdf/skimming-data] Getting highlights for ${fileName} (preset: ${preset})`)

    // Call backend to get highlights (uses cache if available)
    const response = await fetch(
      `${BACKEND_URL}/api/skimming/highlights?file_name=${encodeURIComponent(fileName)}&preset=${preset}`
    )

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          {
            status: "empty",
            message: "Paper not processed yet. Please enable skimming first."
          },
          { status: 200 }
        )
      }

      const error = await response.text()
      console.error(`[API /api/pdf/skimming-data] Backend error:`, error)
      return NextResponse.json(
        { status: "error", error: `Backend error: ${error}` },
        { status: response.status }
      )
    }

    const result = await response.json()
    console.log(`[API /api/pdf/skimming-data] Success: ${result.highlights?.length || 0} highlights`)

    return NextResponse.json({
      status: "ok",
      highlights: result.highlights || [],
      count: result.highlights?.length || 0,
      preset: result.preset,
    })

  } catch (error: any) {
    console.error("[API /api/pdf/skimming-data] Error:", error)
    return NextResponse.json(
      {
        status: "error",
        error: error.message || "Failed to load skimming data"
      },
      { status: 500 }
    )
  }
}
