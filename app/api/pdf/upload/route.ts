import { type NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { auth } from "@/auth"
import {
  addDocumentToWorkspace,
  createDocument,
  getOrCreateWorkspace,
  updateDocument,
  updateDocumentStatus,
} from "@/lib/mongodb"
import { uploadToMinio } from "@/lib/minio"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileSize = buffer.length
    const fileId = randomBytes(16).toString("hex")
    const timestamp = Date.now()
    const objectName = `${session.user.id}/${timestamp}-${fileId}-${file.name}`

    const bucketName = process.env.MINIO_BUCKET || "pdf-documents"
    await uploadToMinio(bucketName, objectName, buffer, file.type || "application/pdf")

    const workspace = await getOrCreateWorkspace(session.user.id)
    const document = await createDocument({
      user_id: session.user.id,
      workspace_id: workspace._id,
      title: file.name.replace(/\.pdf$/i, ""),
      original_filename: file.name,
      stored_path: objectName,
      num_pages: 0,
      status: "uploading",
      source: "upload",
      file_size: fileSize,
      file_type: "pdf",
    })

    if (workspace._id && document._id) {
      await addDocumentToWorkspace(workspace._id, document._id)
    }

    if (document._id) {
      await updateDocumentStatus(document._id, "parsing")
    }

    // Fire-and-forget parsing request (do not await)
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://python-backend:8000"
    const saveAndParseUrl = `${backendUrl}/api/pdf/save-and-parse/`
    const backendForm = new FormData()
    backendForm.append("files", new Blob([buffer]), file.name)

    fetch(saveAndParseUrl, {
      method: "POST",
      body: backendForm as any,
      cache: "no-store",
    })
      .then(async (resp) => {
        const text = await resp.text()
        if (!resp.ok) {
          console.error("[PDFUpload] Backend error:", text)
          if (document._id) {
            await updateDocumentStatus(document._id, "error")
          }
          return
        }

        const data = JSON.parse(text)
        if (document._id) {
          const backendResult = data?.results?.[0]?.outputs
          await updateDocument(document._id, {
            status: "ready",
            num_pages: backendResult?.num_pages ?? 0,
          })
        }
      })
      .catch(async (error) => {
        console.error("[PDFUpload] Error forwarding to backend:", error)
        if (document._id) {
          await updateDocumentStatus(document._id, "error")
        }
      })

    return NextResponse.json({
      message: "PDF uploaded successfully",
      documentId: document._id?.toString(),
    })
  } catch (error) {
    console.error("[PDFUpload] Error:", error)
    return NextResponse.json({ error: "Failed to upload PDF" }, { status: 500 })
  }
}
