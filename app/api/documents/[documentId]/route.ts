import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getDocumentById } from "@/lib/mongodb"
import { formatDocumentForResponse } from "@/lib/server/document-upload"
import { ObjectId } from "mongodb"

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

    const { documentId } = context.params

    let objectId: ObjectId
    try {
      objectId = new ObjectId(documentId)
    } catch {
      return NextResponse.json({ error: "Invalid document id" }, { status: 400 })
    }

    const document = await getDocumentById(objectId)

    if (!document || document.user_id !== session.user.id) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    const formatted = formatDocumentForResponse(document)

    return NextResponse.json({ document: formatted })
  } catch (error) {
    console.error("[Documents] Failed to fetch document:", error)
    return NextResponse.json({ error: "Failed to fetch document" }, { status: 500 })
  }
}