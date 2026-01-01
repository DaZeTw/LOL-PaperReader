/**
 * YAKE Keyword Extraction API client
 *
 * This module provides functions to call the backend YAKE keyword extraction API.
 */

import { BACKEND_API_URL } from '@/lib/config'

const API_BASE = `${BACKEND_API_URL}/api/keywords`

// Log the API base URL on module load
if (typeof window !== 'undefined') {
  console.log(`[YakeAPI] Using API base: ${API_BASE}`)
}

// Default headers for all requests
const DEFAULT_HEADERS: HeadersInit = {
  'ngrok-skip-browser-warning': 'true',
  'Accept': 'application/json',
}

/**
 * A keyword extracted by YAKE
 */
export interface YakeKeyword {
  keyword: string
  score: number  // Higher = better (0-1)
  yake_score: number  // Original YAKE score (lower = better)
  category: string
  word_count: number
}

/**
 * Response from the YAKE keyword extraction API
 */
export interface YakeExtractionResponse {
  status: string
  keywords: YakeKeyword[]
  count: number
  method: string
  document_id?: string
}

/**
 * Helper to safely parse JSON response
 */
async function parseJsonResponse(res: Response, operation: string): Promise<unknown> {
  const contentType = res.headers.get('content-type') || ''

  if (!contentType.includes('application/json')) {
    const text = await res.text()
    console.error(`[YakeAPI] ${operation} returned non-JSON response:`, {
      status: res.status,
      contentType,
      body: text.substring(0, 200)
    })
    throw new Error(
      `${operation} failed: Server returned HTML instead of JSON. ` +
      `This usually means the backend server is not running at ${API_BASE}. ` +
      `Status: ${res.status}`
    )
  }

  return res.json()
}

/**
 * Extract keywords from a PDF file using YAKE (via backend API)
 *
 * @param file - PDF file to extract keywords from
 * @param topN - Number of keywords to return (default: 20)
 * @param documentId - Optional document ID to associate keywords with
 * @returns Promise with extracted keywords
 */
export async function extractKeywordsFromFile(
  file: File,
  topN: number = 20,
  documentId?: string
): Promise<YakeExtractionResponse> {
  const url = `${API_BASE}/extract?top_n=${topN}`
  console.log(`[YakeAPI] Extracting keywords from file: ${file.name}`)

  const formData = new FormData()
  formData.append('file', file)

  const headers: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true',
  }
  if (documentId) {
    headers['X-Document-Id'] = documentId
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw new Error(
        `Keyword extraction failed: Backend returned status ${res.status}. ` +
        `Make sure the backend server is running at ${API_BASE}`
      )
    }
    const errorData = await res.json()
    throw new Error(errorData.detail || `Keyword extraction failed: ${res.status}`)
  }

  const data = await parseJsonResponse(res, 'Keyword extraction') as YakeExtractionResponse
  console.log(`[YakeAPI] Extracted ${data.count} keywords from ${file.name}`)
  return data
}

/**
 * Extract keywords from text using YAKE (via backend API)
 *
 * @param text - Text to extract keywords from
 * @param topN - Number of keywords to return (default: 20)
 * @param maxNgram - Maximum n-gram size (default: 3)
 * @param documentId - Optional document ID to associate keywords with
 * @returns Promise with extracted keywords
 */
export async function extractKeywordsFromText(
  text: string,
  topN: number = 20,
  maxNgram: number = 3,
  documentId?: string
): Promise<YakeExtractionResponse> {
  const url = `${API_BASE}/extract-text`
  console.log(`[YakeAPI] Extracting keywords from text (${text.length} chars)`)

  const headers: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }
  if (documentId) {
    headers['X-Document-Id'] = documentId
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text,
      top_n: topN,
      max_ngram: maxNgram,
    }),
  })

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw new Error(
        `Keyword extraction failed: Backend returned status ${res.status}. ` +
        `Make sure the backend server is running at ${API_BASE}`
      )
    }
    const errorData = await res.json()
    throw new Error(errorData.detail || `Keyword extraction failed: ${res.status}`)
  }

  const data = await parseJsonResponse(res, 'Keyword extraction') as YakeExtractionResponse
  console.log(`[YakeAPI] Extracted ${data.count} keywords from text`)
  return data
}

/**
 * Get keywords for a document by ID (uses cached keywords if available)
 *
 * @param documentId - Document ID to get keywords for
 * @param topN - Number of keywords to return (default: 20)
 * @param forceRefresh - Force re-extraction even if cached
 * @returns Promise with extracted keywords
 */
export async function getDocumentKeywords(
  documentId: string,
  topN: number = 20,
  forceRefresh: boolean = false
): Promise<YakeExtractionResponse> {
  const params = new URLSearchParams({
    top_n: String(topN),
    force_refresh: String(forceRefresh),
  })
  const url = `${API_BASE}/document/${encodeURIComponent(documentId)}?${params}`
  console.log(`[YakeAPI] Getting keywords for document: ${documentId}`)

  const res = await fetch(url, {
    method: 'GET',
    headers: DEFAULT_HEADERS,
  })

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw new Error(
        `Get document keywords failed: Backend returned status ${res.status}. ` +
        `Make sure the backend server is running at ${API_BASE}`
      )
    }
    const errorData = await res.json()
    throw new Error(errorData.detail || `Get document keywords failed: ${res.status}`)
  }

  const data = await parseJsonResponse(res, 'Get document keywords') as YakeExtractionResponse
  console.log(`[YakeAPI] Got ${data.count} keywords for document ${documentId}`)
  return data
}

/**
 * Extract keywords from a PDF URL using YAKE
 *
 * This function fetches the PDF from the URL, then sends it to the backend
 * for YAKE keyword extraction.
 *
 * @param pdfUrl - URL of the PDF to extract keywords from
 * @param topN - Number of keywords to return (default: 20)
 * @param documentId - Optional document ID to associate keywords with
 * @returns Promise with extracted keywords
 */
export async function extractKeywordsFromPdfUrl(
  pdfUrl: string,
  topN: number = 20,
  documentId?: string
): Promise<YakeExtractionResponse> {
  console.log(`[YakeAPI] Fetching PDF from URL: ${pdfUrl}`)

  // Fetch the PDF file
  const pdfRes = await fetch(pdfUrl)
  if (!pdfRes.ok) {
    throw new Error(`Failed to fetch PDF: ${pdfRes.status}`)
  }

  const pdfBlob = await pdfRes.blob()

  // Extract filename from URL and ensure it ends with .pdf
  let fileName = pdfUrl.split('/').pop()?.split('?')[0] || 'document.pdf'
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    fileName = 'document.pdf'
  }

  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' })

  // Extract keywords using the file upload endpoint
  return extractKeywordsFromFile(pdfFile, topN, documentId)
}
