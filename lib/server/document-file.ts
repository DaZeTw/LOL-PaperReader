import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getDocumentsByIds } from "@/lib/mongodb"
import { getPresignedUrl } from "@/lib/minio"

export class InvalidDocumentIdError extends Error {}
export class DocumentNotFoundError extends Error {}
export class DocumentStreamError extends Error {}

export async function getDocumentResponseForUser(documentId: string, userId: string): Promise<NextResponse> {
  let objectId: ObjectId

  try {
    objectId = new ObjectId(documentId)
  } catch {
    throw new InvalidDocumentIdError("Invalid document id")
  }

  const documents = await getDocumentsByIds(userId, [objectId])
  const document = documents[0]

  if (!document) {
    throw new DocumentNotFoundError("Document not found")
  }

  const bucketName = process.env.MINIO_BUCKET || "pdf-documents"

  type FetchAttemptResult = { response: Response | null; error: unknown }

  const loadFromMinio = async (external: boolean): Promise<FetchAttemptResult> => {
    const url = await getPresignedUrl(bucketName, document.stored_path, undefined, { external })
    try {
      const response = await fetch(url, { cache: "no-store" })

      if (!response.ok || !response.body) {
        return { response: null, error: new Error(`Unexpected response ${response.status}`) }
      }

      return { response, error: null }
    } catch (error) {
      return { response: null, error }
    }
  }

  let fileResponse: Response | null = null
  let fetchError: unknown = null

  const internalResult = await loadFromMinio(false)

  if (internalResult.response) {
    fileResponse = internalResult.response
  } else {
    fetchError = internalResult.error

    if (process.env.MINIO_PUBLIC_URL) {
      const externalResult = await loadFromMinio(true)

      if (externalResult.response) {
        fileResponse = externalResult.response
      } else {
        fetchError = externalResult.error ?? fetchError
      }
    }
  }

  if (!fileResponse) {
    console.error("[DocumentFile] Failed to fetch document from MinIO", fetchError)
    throw new DocumentStreamError("Failed to fetch document")
  }

  const headers = new Headers()
  const contentType = fileResponse.headers.get("content-type")
  const contentLength = fileResponse.headers.get("content-length")
  const contentDisposition = fileResponse.headers.get("content-disposition")

  headers.set("content-type", contentType ?? "application/pdf")

  if (contentLength) {
    headers.set("content-length", contentLength)
  }

  headers.set(
    "content-disposition",
    contentDisposition ?? `inline; filename="${document.original_filename.replace(/"/g, '\\"')}"`,
  )

  return new NextResponse(fileResponse.body, {
    status: 200,
    headers,
  })
}


