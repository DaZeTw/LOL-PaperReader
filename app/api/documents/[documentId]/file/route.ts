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

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const response = await getDocumentResponseForUser(context.params.documentId, session.user.id)
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

    console.error("[Documents] Failed to stream document:", error)
    return NextResponse.json({ error: "Failed to download document" }, { status: 500 })
  }
}


