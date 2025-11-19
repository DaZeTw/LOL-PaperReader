import { NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  clearWorkspaceDocuments,
  deleteAllDocumentsForUser,
  deleteDocumentsByIds,
  getDocumentsByIds,
  getDocumentsByUserId,
  removeDocumentsFromWorkspace,
} from "@/lib/mongodb"
import { deleteFromMinio } from "@/lib/minio"
import { ObjectId } from "mongodb"

export const runtime = "nodejs"

interface DeleteRequestBody {
  documentIds?: string[]
  deleteAll?: boolean
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json()) as DeleteRequestBody
    const { documentIds, deleteAll } = body || {}

    if (!deleteAll && (!Array.isArray(documentIds) || documentIds.length === 0)) {
      return NextResponse.json({ error: "No documents specified" }, { status: 400 })
    }

    const userId = session.user.id
    const bucketName = process.env.MINIO_BUCKET || "pdf-documents"
    let documentsToDelete =
      deleteAll === true
        ? await getDocumentsByUserId(userId)
        : await getDocumentsByIds(
            userId,
            (documentIds || []).map((id) => {
              try {
                return new ObjectId(id)
              } catch {
                return null
              }
            }).filter((id): id is ObjectId => id !== null),
          )

    if (!documentsToDelete || documentsToDelete.length === 0) {
      return NextResponse.json({ deletedCount: 0 })
    }

    // Delete files from MinIO (best effort)
    await Promise.all(
      documentsToDelete.map(async (doc) => {
        if (!doc.stored_path) return
        try {
          await deleteFromMinio(bucketName, doc.stored_path)
        } catch (err) {
          console.error(`[DocumentsDelete] Failed to delete ${doc.stored_path} from MinIO`, err)
        }
      }),
    )

    // Update workspace references
    const workspaceGroups = new Map<string, ObjectId[]>()
    for (const doc of documentsToDelete) {
      if (doc.workspace_id && doc._id) {
        const key = doc.workspace_id.toString()
        if (!workspaceGroups.has(key)) {
          workspaceGroups.set(key, [])
        }
        workspaceGroups.get(key)?.push(doc._id)
      }
    }

    await Promise.all(
      Array.from(workspaceGroups.entries()).map(([workspaceId, docIds]) => {
        if (deleteAll) {
          return clearWorkspaceDocuments(new ObjectId(workspaceId))
        }
        return removeDocumentsFromWorkspace(new ObjectId(workspaceId), docIds)
      }),
    )

    const documentObjectIds = documentsToDelete
      .map((doc) => doc._id)
      .filter((id): id is ObjectId => id instanceof ObjectId)

    const deletedCount = deleteAll
      ? await deleteAllDocumentsForUser(userId)
      : await deleteDocumentsByIds(userId, documentObjectIds)

    return NextResponse.json({ deletedCount })
  } catch (error) {
    console.error("[DocumentsDelete] Error deleting documents:", error)
    return NextResponse.json({ error: "Failed to delete documents" }, { status: 500 })
  }
}

