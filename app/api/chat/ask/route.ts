import { type NextRequest, NextResponse } from "next/server"

// Backend API URL - can be configured via environment variable
const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"

export async function POST(request: NextRequest) {
  try {
    const {
      session_id,
      question,
      retriever = "hybrid",
      generator = "openai",
      image_policy = "auto",
      top_k = 5,
      max_tokens = 1024,
      user_images = [],
    } = await request.json()

    if (!session_id) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 })
    }

    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 })
    }

    const backendResponse = await fetch(`${BACKEND_URL}/api/chat/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id,
        question,
        retriever,
        generator,
        image_policy,
        top_k,
        max_tokens,
        user_images,
      }),
      // Add timeout to prevent hanging (180 seconds for chat requests to allow for model loading)
      signal: AbortSignal.timeout(180000), // 180 seconds timeout (3 minutes) to allow for model/tokenizer loading on first chat
    })

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}))
      throw new Error(errorData.detail || errorData.error || `Backend returned ${backendResponse.status}`)
    }

    const backendData = await backendResponse.json()

    // Map backend response format to frontend format
    // Backend returns: { question, answer, cited_sections, session_id }
    // Frontend expects: { answer, cited_sections?, confidence?, session_id }
    
    return NextResponse.json({
      answer: backendData.answer || "",
      cited_sections: backendData.cited_sections || [],
      session_id: backendData.session_id || session_id,
      confidence: backendData.confidence,
    })
  } catch (error: any) {
    console.error("[ChatAsk] Error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get answer" },
      { status: 500 }
    )
  }
}

