import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { type Collection, getCollectionsByUserId } from "@/lib/mongodb"

export const runtime = "nodejs"

function formatCollectionForResponse(collection: Collection) {
  return {
    ...collection,
    _id: collection._id?.toString() ?? null,
    document_ids: collection.document_ids.map((id) => id.toString()),
  }
}

export async function GET() {
  try {
    const session = await auth()
    const userId = session?.user?.dbId ? session.user.dbId.toString() : session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const collections = await getCollectionsByUserId(userId)
    const formattedCollections = collections.map(formatCollectionForResponse)

    return NextResponse.json({ collections: formattedCollections })
  } catch (error) {
    console.error("[Collections] Failed to fetch collections:", error)
    return NextResponse.json({ error: "Failed to fetch collections" }, { status: 500 })
  }
}


