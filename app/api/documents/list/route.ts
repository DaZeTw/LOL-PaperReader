import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getDocumentsByUserId } from "@/lib/mongodb"
import { getPresignedUrl } from "@/lib/minio"

export const runtime = "nodejs"

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bucketName = process.env.MINIO_BUCKET || "pdf-documents"
    const documents = await getDocumentsByUserId(session.user.id)

    const documentsWithUrls = documents.map((doc) => ({
      ...doc,
      _id: doc._id?.toString(),
      workspace_id: doc.workspace_id?.toString(),
      downloadUrl: `/api/documents/download?id=${doc._id?.toString()}`,
    }))

    return NextResponse.json({ documents: documentsWithUrls })
  } catch (error) {
    console.error("[DocumentsList] Error:", error)
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 })
  }
}

