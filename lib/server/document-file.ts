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
  const presignedUrl = await getPresignedUrl(bucketName, document.stored_path, undefined, { external: false })

  const fileResponse = await fetch(presignedUrl, { cache: "no-store" })

  if (!fileResponse.ok || !fileResponse.body) {
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


