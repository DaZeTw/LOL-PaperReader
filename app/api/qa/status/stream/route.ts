import { type NextRequest } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // 1. Get the ID we strictly care about
    const requestedDocId = searchParams.get("document_id") || searchParams.get("document_key")
    
    // 2. Prepare Backend URL
    const backendQueryParams = new URLSearchParams()
    if (requestedDocId) backendQueryParams.append("document_id", requestedDocId)

    const backendUrl = `${BACKEND_URL}/api/pdf/status/stream?${backendQueryParams.toString()}`
    console.log(`[NextAPI] Proxying stream for ID ${requestedDocId} from: ${backendUrl}`)

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
      cache: "no-store",
    })

    if (!response.body) {
        throw new Error("No response body from backend");
    }

    // 3. Create a TransformStream to FILTER events
    // This stops the "noise" from other documents reaching your frontend
    const filterStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        
        // If we have a target ID, strictly filter for it
        if (requestedDocId) {
            // We check if the chunk contains our ID. 
            // This is a simple but effective filter for JSON lines.
            if (text.includes(requestedDocId)) {
                 controller.enqueue(chunk);
            }
        } else {
            // If no ID was requested, pass everything (fallback)
            controller.enqueue(chunk);
        }
      }
    });

    // 4. Pipe the backend stream through our filter
    const stream = response.body.pipeThrough(filterStream);

    return new Response(stream, {
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
      JSON.stringify({ error: error?.message || "Internal Server Error" }),
      { status: 500 }
    )
  }
}