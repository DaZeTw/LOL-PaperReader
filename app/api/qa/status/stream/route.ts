import { type NextRequest } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pdfName = searchParams.get("pdf_name")
    const documentKey = searchParams.get("document_key")

    const backendQueryParams = new URLSearchParams()
    if (pdfName) backendQueryParams.append("pdf_name", pdfName)
    if (documentKey) backendQueryParams.append("document_key", documentKey)

    const backendUrl = `${BACKEND_URL}/api/pdf/status/stream?${backendQueryParams.toString()}`

    console.log(`[NextAPI] Proxying stream from: ${backendUrl}`)

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      console.error(`[NextAPI] Backend stream failed: ${response.status}`)
      return new Response(
        JSON.stringify({ error: `Backend stream failed with status ${response.status}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!response.body) {
      return new Response(
        JSON.stringify({ error: "No response body from backend" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })

  } catch (error: any) {
    console.error("[NextAPI] Stream Proxy Error:", error)
    return new Response(
      JSON.stringify({ error: error?.message || "Internal Server Error during streaming" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
