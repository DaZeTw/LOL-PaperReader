import { type NextRequest, NextResponse } from "next/server"

// Backend API URL - can be configured via environment variable
const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"

export async function POST(request: NextRequest) {
  try {
    console.log("[ChatAsk] ===== REQUEST RECEIVED =====")
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

    console.log("[ChatAsk] Request data:", { session_id, question: question?.substring(0, 50) + "...", retriever, generator })

    if (!session_id) {
      console.error("[ChatAsk] Missing session_id")
      return NextResponse.json({ error: "session_id is required" }, { status: 400 })
    }

    if (!question) {
      console.error("[ChatAsk] Missing question")
      return NextResponse.json({ error: "question is required" }, { status: 400 })
    }

    const backendUrl = `${BACKEND_URL}/api/chat/ask`
    console.log("[ChatAsk] Calling backend:", backendUrl)
    console.log("[ChatAsk] Backend URL from env:", BACKEND_URL)
    
    const requestBody = {
      session_id,
      question,
      retriever,
      generator,
      image_policy,
      top_k,
      max_tokens,
      user_images,
    }
    console.log("[ChatAsk] Request body prepared, calling backend...")

    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      // Add timeout to prevent hanging (180 seconds for chat requests to allow for model loading)
      signal: AbortSignal.timeout(180000), // 180 seconds timeout (3 minutes) to allow for model/tokenizer loading on first chat
    })

    console.log("[ChatAsk] Backend response status:", backendResponse.status)

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}))
      console.error("[ChatAsk] Backend error response:", errorData)
      throw new Error(errorData.detail || errorData.error || `Backend returned ${backendResponse.status}`)
    }

    const backendData = await backendResponse.json()
    console.log("[ChatAsk] Backend response received, answer length:", backendData.answer?.length || 0)

    // Map backend response format to frontend format
    // Backend returns: { question, answer, cited_sections, session_id }
    // Frontend expects: { answer, cited_sections?, confidence?, session_id }
    
    const response = {
      answer: backendData.answer || "",
      cited_sections: backendData.cited_sections || [],
      session_id: backendData.session_id || session_id,
      confidence: backendData.confidence,
    }
    console.log("[ChatAsk] Returning response to frontend")
    return NextResponse.json(response)
  } catch (error: any) {
    console.error("[ChatAsk] ===== ERROR =====")
    console.error("[ChatAsk] Error type:", error?.name)
    console.error("[ChatAsk] Error message:", error?.message)
    console.error("[ChatAsk] Error stack:", error?.stack)
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      console.error("[ChatAsk] Request timed out after 180 seconds")
      return NextResponse.json(
        { error: "Request timed out. The backend may be processing. Please try again." },
        { status: 504 }
      )
    }
    return NextResponse.json(
      { error: error.message || "Failed to get answer" },
      { status: 500 }
    )
  }
}

