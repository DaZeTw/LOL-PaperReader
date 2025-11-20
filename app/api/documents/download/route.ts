import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  getDocumentResponseForUser,
  DocumentNotFoundError,
  DocumentStreamError,
  InvalidDocumentIdError,
} from "@/lib/server/document-file"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const documentId = request.nextUrl.searchParams.get("id")

    if (!documentId) {
      return NextResponse.json({ error: "Missing document id" }, { status: 400 })
    }

    const response = await getDocumentResponseForUser(documentId, session.user.id)
    return response
  } catch (error) {
    if (error instanceof InvalidDocumentIdError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (error instanceof DocumentNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    if (error instanceof DocumentStreamError) {
      return NextResponse.json({ error: error.message }, { status: 502 })
    }

    console.error("[DocumentsDownload] Error:", error)
    return NextResponse.json({ error: "Failed to download document" }, { status: 500 })
  }
}

