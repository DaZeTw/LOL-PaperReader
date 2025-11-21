import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  type Collection,
  deleteCollection,
  getCollectionById,
  getDocumentsByIds,
  updateCollection,
} from "@/lib/mongodb"
import { ObjectId } from "mongodb"
import { formatDocumentForResponse } from "@/lib/server/document-upload"

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

export async function GET(
  _request: NextRequest,
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

    const collection = await getCollectionById(collectionObjectId, userId)
    if (!collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 })
    }

    const documents =
      collection.document_ids.length > 0 ? await getDocumentsByIds(userId, collection.document_ids) : []

    const formattedDocuments = documents.map((doc) => formatDocumentForResponse(doc))

    return NextResponse.json({
      collection: formatCollectionForResponse(collection),
      documents: formattedDocuments,
    })
  } catch (error) {
    console.error("[Collections] Failed to fetch collection:", error)
    return NextResponse.json({ error: "Failed to fetch collection" }, { status: 500 })
  }
}

export async function PUT(
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
    const { name, description } = body ?? {}

    const updates: { name?: string; description?: string } = {}

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json({ error: "Collection name must be a non-empty string" }, { status: 400 })
      }
      updates.name = name.trim()
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        return NextResponse.json({ error: "Description must be a string" }, { status: 400 })
      }
      updates.description = description ? description.trim() : ""
    }

    let updated = await updateCollection(collectionObjectId, userId, updates)

    if (!updated && session?.user?.id && session.user.id !== userId) {
      updated = await updateCollection(collectionObjectId, session.user.id, updates)
    }
    if (!updated) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 })
    }

    return NextResponse.json({ collection: formatCollectionForResponse(updated) })
  } catch (error) {
    console.error("[Collections] Failed to update collection:", error)
    return NextResponse.json({ error: "Failed to update collection" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
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

    let deleted = await deleteCollection(collectionObjectId, userId)
    if (!deleted && session?.user?.id && session.user.id !== userId) {
      deleted = await deleteCollection(collectionObjectId, session.user.id)
    }
    if (!deleted) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Collections] Failed to delete collection:", error)
    return NextResponse.json({ error: "Failed to delete collection" }, { status: 500 })
  }
}


