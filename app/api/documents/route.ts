import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getDocumentsByUserId } from "@/lib/mongodb"
import {
  handleDocumentUpload,
  HttpError,
  formatDocumentForResponse,
} from "@/lib/server/document-upload"

export const runtime = "nodejs"

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const documents = await getDocumentsByUserId(session.user.id)
    const documentsWithUrls = documents.map((doc) => formatDocumentForResponse(doc))

    return NextResponse.json({ documents: documentsWithUrls })
  } catch (error) {
    console.error("[Documents] Failed to fetch documents:", error)
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await handleDocumentUpload(request)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("[Documents] Failed to upload document:", error)
    return NextResponse.json({ error: "Failed to upload PDF" }, { status: 500 })
  }
}


