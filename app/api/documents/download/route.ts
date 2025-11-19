import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getDocumentsByIds } from "@/lib/mongodb"
import { getPresignedUrl } from "@/lib/minio"
import { ObjectId } from "mongodb"

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

    let objectId: ObjectId
    try {
      objectId = new ObjectId(documentId)
    } catch {
      return NextResponse.json({ error: "Invalid document id" }, { status: 400 })
    }

    const documents = await getDocumentsByIds(session.user.id, [objectId])
    const document = documents[0]
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    const bucketName = process.env.MINIO_BUCKET || "pdf-documents"
    const presignedUrl = await getPresignedUrl(bucketName, document.stored_path, undefined, { external: false })

    const fileResponse = await fetch(presignedUrl, { cache: "no-store" })
    if (!fileResponse.ok || !fileResponse.body) {
      return NextResponse.json({ error: "Failed to fetch document" }, { status: 502 })
    }

    const headers = new Headers()
    const contentType = fileResponse.headers.get("content-type")
    const contentLength = fileResponse.headers.get("content-length")
    const contentDisposition = fileResponse.headers.get("content-disposition")

    if (contentType) {
      headers.set("content-type", contentType)
    } else {
      headers.set("content-type", "application/pdf")
    }

    if (contentLength) {
      headers.set("content-length", contentLength)
    }

    if (contentDisposition) {
      headers.set("content-disposition", contentDisposition)
    } else {
      headers.set("content-disposition", `inline; filename="${document.original_filename}"`)
    }

    return new NextResponse(fileResponse.body, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error("[DocumentsDownload] Error:", error)
    return NextResponse.json({ error: "Failed to download document" }, { status: 500 })
  }
}

