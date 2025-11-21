import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { deleteAllCollectionsForUser } from "@/lib/mongodb"

export const runtime = "nodejs"

interface DeleteCollectionsRequest {
  confirm?: boolean
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as DeleteCollectionsRequest | undefined
    if (body?.confirm !== true) {
      return NextResponse.json(
        {
          error: "Confirmation required",
          message: "Set `confirm: true` in the request body to delete all collections.",
        },
        { status: 400 },
      )
    }

    const deletedCount = await deleteAllCollectionsForUser(session.user.id)
    return NextResponse.json({ deletedCount })
  } catch (error) {
    console.error("[CollectionsDeleteAll] Failed to delete collections:", error)
    return NextResponse.json({ error: "Failed to delete collections" }, { status: 500 })
  }
}


