import { randomBytes } from "crypto"
import { type NextRequest } from "next/server"
import { auth } from "@/auth"
import {
  addDocumentToWorkspace,
  createDocument,
  getOrCreateWorkspace,
  updateDocument,
  updateDocumentStatus,
  type Document as DocumentModel,
} from "@/lib/mongodb"
import { uploadToMinio } from "@/lib/minio"

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface DocumentResponse {
  _id: string
  workspace_id?: string
  title: string
  original_filename: string
  stored_path: string
  num_pages: number
  status: string
  source: string
  preview_image?: string
  created_at?: string
  updated_at?: string
  file_size: number
  file_type: string
  downloadUrl: string
  fileUrl: string
  metadataUrl: string
}

export interface DocumentUploadResult {
  message: string
  documentId: string | null
  document: DocumentResponse | null
}

export function formatDocumentForResponse(document: DocumentModel): DocumentResponse {
  const documentId = document._id?.toString() ?? ""
  const workspaceId = document.workspace_id?.toString()

  const createdAt =
    document.created_at instanceof Date ? document.created_at.toISOString() : document.created_at?.toString()
  const updatedAt =
    document.updated_at instanceof Date ? document.updated_at.toISOString() : document.updated_at?.toString()

  const legacyDownloadUrl = documentId ? `/api/documents/download?id=${documentId}` : ""
  const fileUrl = documentId ? `/api/documents/${documentId}/file` : ""
  const metadataUrl = documentId ? `/api/documents/${documentId}` : ""

  return {
    _id: documentId,
    workspace_id: workspaceId,
    title: document.title,
    original_filename: document.original_filename,
    stored_path: document.stored_path,
    num_pages: document.num_pages,
    status: document.status,
    source: document.source,
    preview_image: document.preview_image ?? undefined,
    created_at: createdAt ?? undefined,
    updated_at: updatedAt ?? undefined,
    file_size: document.file_size,
    file_type: document.file_type,
    downloadUrl: legacyDownloadUrl,
    fileUrl,
    metadataUrl,
  }
}

export async function handleDocumentUpload(request: NextRequest): Promise<DocumentUploadResult> {
  const session = await auth()

  if (!session?.user?.id) {
    throw new HttpError(401, "Unauthorized")
  }

  const formData = await request.formData()
  const file = formData.get("file") as File | null

  if (!file) {
    throw new HttpError(400, "No file provided")
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  if (buffer.length === 0) {
    throw new HttpError(400, "Empty file provided")
  }

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
    file_size: buffer.length,
    file_type: "pdf",
  })

  if (workspace._id && document._id) {
    await addDocumentToWorkspace(workspace._id, document._id)
  }

  if (document._id) {
    await updateDocumentStatus(document._id, "parsing")
    document.status = "parsing"
  }

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
        console.error("[DocumentUpload] Backend error:", text)
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
      console.error("[DocumentUpload] Error forwarding to backend:", error)
      if (document._id) {
        await updateDocumentStatus(document._id, "error")
      }
    })

  const formatted = formatDocumentForResponse(document)

  return {
    message: "PDF uploaded successfully",
    documentId: formatted._id || null,
    document: formatted,
  }
}


