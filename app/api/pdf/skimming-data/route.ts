import { NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"

export const dynamic = "force-dynamic"

/**
 * GET /api/pdf/skimming-data
 * Returns skimming highlights data for the PDF (CiteRead-style JSON)
 *
 * For now, returns the example CiteRead.json from the skimm folder.
 * TODO: Generate this data from backend PDF analysis
 */
export async function GET(request: NextRequest) {
  try {
    // For now, serve the example CiteRead.json file
    const skimmDataPath = path.join(process.cwd(), "skimm", "CiteRead.json")

    if (!fs.existsSync(skimmDataPath)) {
      return NextResponse.json(
        {
          status: "empty",
          message: "No skimming data available yet"
        },
        { status: 200 }
      )
    }

    const data = JSON.parse(fs.readFileSync(skimmDataPath, "utf-8"))

    return NextResponse.json({
      status: "ok",
      highlights: data,
      count: data.length,
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
