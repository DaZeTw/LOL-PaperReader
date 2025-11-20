import { type NextRequest, NextResponse } from "next/server"
import { handleDocumentUpload, HttpError } from "@/lib/server/document-upload"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const result = await handleDocumentUpload(request)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("[PDFUpload] Error:", error)
    return NextResponse.json({ error: "Failed to upload PDF" }, { status: 500 })
  }
}
