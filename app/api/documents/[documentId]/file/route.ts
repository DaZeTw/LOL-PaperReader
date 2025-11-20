import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  getDocumentResponseForUser,
  DocumentNotFoundError,
  DocumentStreamError,
  InvalidDocumentIdError,
} from "@/lib/server/document-file"

export const runtime = "nodejs"

interface RouteContext {
  params: {
    documentId: string
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Await the params before using them
    const params = await context.params
    const response = await getDocumentResponseForUser(params.documentId, session.user.id)
    return response
  } catch (error) {
    if (error instanceof InvalidDocumentIdError) {
      return NextResponse.json({ error: "Invalid document ID" }, { status: 400 })
    }
    if (error instanceof DocumentNotFoundError) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }
    console.error('[Document File] Error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

