import { type NextRequest, NextResponse } from "next/server"

// Backend API Configuration
const BACKEND_API_URL = process.env.BACKEND_API_URL || "http://localhost:8000"

interface BackendAskRequest {
  question: string
  retriever?: "keyword" | "dense" | "hybrid"
  generator?: "openai" | "ollama" | "extractive"
  image_policy?: "none" | "auto" | "all"
  top_k?: number
  max_tokens?: number
  user_images?: string[] | null
}

interface BackendAskResponse {
  question: string
  answer: string
  cited_sections: Array<{
    doc_id?: string
    title?: string
    page?: number
    excerpt: string
  }>
  retriever_scores: Array<{
    index: number
    score: number
  }>
}

export async function POST(request: NextRequest) {
  try {
    const { question, filename, retriever, generator, image_policy, top_k, max_tokens, user_images } = await request.json()

    if (!question) {
      return NextResponse.json({ error: "No question provided" }, { status: 400 })
    }

    // Prepare request payload for backend QA service
    const backendRequest: BackendAskRequest = {
      question,
      retriever: retriever || "hybrid",
      generator: generator || "openai",
      image_policy: image_policy || "auto",
      top_k: top_k || 5,
      max_tokens: max_tokens || 512,
      user_images: user_images || null,
    }

    console.log(`[QA] Sending request to backend: ${BACKEND_API_URL}/api/qa/ask`)
    console.log(`[QA] Question: "${question}"`)
    console.log(`[QA] Config: retriever=${backendRequest.retriever}, generator=${backendRequest.generator}`)

    // Call the backend FastAPI QA service
    const backendResponse = await fetch(`${BACKEND_API_URL}/api/qa/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backendRequest),
    })

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text()
      console.error(`[QA] Backend error (${backendResponse.status}):`, errorText)

      // Return a user-friendly error message
      return NextResponse.json(
        {
          error: "Backend service error",
          details: `Failed to get answer from QA service (status ${backendResponse.status})`,
          message: "The QA service is currently unavailable. Please ensure the backend is running on " + BACKEND_API_URL,
        },
        { status: backendResponse.status }
      )
    }

    const backendData: BackendAskResponse = await backendResponse.json()

    console.log(`[QA] Received answer from backend (${backendData.cited_sections?.length || 0} citations)`)

    // Transform backend response to match frontend expectations
    // Combine all cited sections excerpts into a single context string for backward compatibility
    const context = backendData.cited_sections
      ?.map((section, idx) => {
        const title = section.title ? `[${section.title}]` : ""
        const page = section.page ? ` (Page ${section.page})` : ""
        return `${title}${page}: ${section.excerpt}`
      })
      .join("\n\n") || ""

    return NextResponse.json({
      answer: backendData.answer,
      context: context,
      // Include additional data from backend for advanced UI features
      cited_sections: backendData.cited_sections,
      retriever_scores: backendData.retriever_scores,
      confidence: calculateConfidenceFromScores(backendData.retriever_scores),
    })
  } catch (error) {
    console.error("[QA] Error:", error)

    // Provide specific error messages for common issues
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return NextResponse.json(
        {
          error: "Backend connection failed",
          message: `Cannot connect to backend service at ${BACKEND_API_URL}. Please ensure the backend is running.`,
          details: error.message,
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      {
        error: "Failed to process question",
        message: "An unexpected error occurred while processing your question.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

// Calculate a confidence score based on retriever scores
function calculateConfidenceFromScores(scores: Array<{ index: number; score: number }>): number {
  if (!scores || scores.length === 0) {
    return 0.5
  }

  // Average the top retrieval scores and normalize to 0-1 range
  const avgScore = scores.reduce((sum, item) => sum + item.score, 0) / scores.length

  // Normalize: assuming scores are typically between 0 and 1
  // Add a baseline confidence and cap at 0.95
  return Math.min(0.95, Math.max(0.5, avgScore * 0.8 + 0.2))
}
