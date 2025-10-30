import { type NextRequest, NextResponse } from "next/server"

// Backend API URL - can be configured via environment variable
const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"

// Fallback mock data for when backend is unavailable
const fallbackResponse = {
  answer: "I'm currently unable to connect to the backend service. Please ensure the Python backend is running on port 8000.",
  context: "Backend service unavailable",
  confidence: 0.0,
}

export async function POST(request: NextRequest) {
  try {
    const { question, filename } = await request.json()

    if (!question) {
      return NextResponse.json({ error: "No question provided" }, { status: 400 })
    }

    // Try to call the Python backend
    try {
      const backendResponse = await fetch(`${BACKEND_URL}/api/qa/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
          retriever: "hybrid",
          generator: "openai",
          image_policy: "auto",
          top_k: 5,
          max_tokens: 512,
        }),
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(60000), // 60 seconds timeout
      })

      if (!backendResponse.ok) {
        throw new Error(`Backend returned ${backendResponse.status}: ${backendResponse.statusText}`)
      }

      const backendData = await backendResponse.json()

      // Map backend response format to frontend format
      // Backend returns: { question, answer, cited_sections, retriever_scores }
      // Frontend expects: { answer, context?, confidence? }
      
      // Combine cited_sections into context string
      const contextParts = backendData.cited_sections?.map((section: any, index: number) => {
        const title = section.title || "Document"
        const page = section.page !== undefined ? ` (page ${section.page})` : ""
        const excerpt = section.excerpt || ""
        return `[${index + 1}] ${title}${page}: ${excerpt.substring(0, 200)}${excerpt.length > 200 ? "..." : ""}`
      }) || []

      const context = contextParts.join("\n\n")

      // Calculate confidence based on retriever scores (average of top scores)
      const scores = backendData.retriever_scores || []
      const avgScore = scores.length > 0
        ? scores.reduce((sum: number, s: any) => sum + (s.score || 0), 0) / scores.length
        : 0
      const confidence = Math.min(0.95, Math.max(0.3, avgScore))

      return NextResponse.json({
        answer: backendData.answer || fallbackResponse.answer,
        context: context || fallbackResponse.context,
        confidence,
        // Include additional metadata for future use
        cited_sections: backendData.cited_sections,
        retriever_scores: backendData.retriever_scores,
      })
    } catch (backendError: any) {
      // Log the error for debugging
      console.error("[QA] Backend request failed:", {
        error: backendError.message,
        url: `${BACKEND_URL}/api/qa/ask`,
        question: question.substring(0, 50) + "...",
      })

      // Return fallback response with error info
      return NextResponse.json(
        {
          ...fallbackResponse,
          error: "Backend unavailable",
          details: process.env.NODE_ENV === "development" ? backendError.message : undefined,
        },
        { status: 503 } // Service Unavailable
      )
    }
  } catch (error: any) {
    console.error("[QA] Error processing request:", error)
    return NextResponse.json(
      {
        error: "Failed to process question",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
