import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { addDocumentToCollection, type Collection } from "@/lib/mongodb"
import { ObjectId } from "mongodb"

export const runtime = "nodejs"

function formatCollectionForResponse(collection: Collection) {
  return {
    ...collection,
    _id: collection._id?.toString() ?? null,
    document_ids: collection.document_ids.map((id) => id.toString()),
  }
}

function parseObjectId(id: string) {
  try {
    return new ObjectId(id)
  } catch {
    return null
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { collectionId: string } },
) {
  try {
    const session = await auth()
    const userId = session?.user?.dbId ? session.user.dbId.toString() : session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const collectionObjectId = parseObjectId(params.collectionId)
    if (!collectionObjectId) {
      return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 })
    }

    const body = await request.json()
    const { documentId } = body ?? {}

    if (!documentId || typeof documentId !== "string") {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 })
    }

    const documentObjectId = parseObjectId(documentId)
    if (!documentObjectId) {
      return NextResponse.json({ error: "Invalid document ID" }, { status: 400 })
    }

    let updated = await addDocumentToCollection(collectionObjectId, userId, documentObjectId)
    if (!updated && session?.user?.id && session.user.id !== userId) {
      updated = await addDocumentToCollection(collectionObjectId, session.user.id, documentObjectId)
    }
    if (!updated) {
      return NextResponse.json(
        { error: "Collection or document not found, or document does not belong to the user" },
        { status: 404 },
      )
    }

    return NextResponse.json({ collection: formatCollectionForResponse(updated) })
  } catch (error) {
    console.error("[Collections] Failed to add document to collection:", error)
    return NextResponse.json({ error: "Failed to add document to collection" }, { status: 500 })
  }
}


