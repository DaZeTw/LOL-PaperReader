import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { type Collection, createCollection } from "@/lib/mongodb"

export const runtime = "nodejs"

function formatCollectionForResponse(collection: Collection) {
  return {
    ...collection,
    _id: collection._id?.toString() ?? null,
    document_ids: collection.document_ids.map((id) => id.toString()),
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    const userId = session?.user?.dbId ? session.user.dbId.toString() : session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description } = body ?? {}

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Collection name is required" }, { status: 400 })
    }

    const collection = await createCollection({
      user_id: userId,
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
    })

    return NextResponse.json({ collection: formatCollectionForResponse(collection) }, { status: 201 })
  } catch (error) {
    console.error("[Collections] Failed to create collection:", error)
    return NextResponse.json({ error: "Failed to create collection" }, { status: 500 })
  }
}


