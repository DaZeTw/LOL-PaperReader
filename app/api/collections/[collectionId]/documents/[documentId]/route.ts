import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { removeDocumentFromCollection, type Collection } from "@/lib/mongodb"
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { collectionId: string; documentId: string } },
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

    const documentObjectId = parseObjectId(params.documentId)
    if (!documentObjectId) {
      return NextResponse.json({ error: "Invalid document ID" }, { status: 400 })
    }

    let updated = await removeDocumentFromCollection(collectionObjectId, userId, documentObjectId)
    if (!updated && session?.user?.id && session.user.id !== userId) {
      updated = await removeDocumentFromCollection(collectionObjectId, session.user.id, documentObjectId)
    }
    if (!updated) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 })
    }

    return NextResponse.json({ collection: formatCollectionForResponse(updated) })
  } catch (error) {
    console.error("[Collections] Failed to remove document from collection:", error)
    return NextResponse.json({ error: "Failed to remove document from collection" }, { status: 500 })
  }
}


