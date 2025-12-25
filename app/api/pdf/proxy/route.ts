/**
 * API route to proxy PDF fetching from external URLs.
 * This proxies requests to the backend PDF proxy endpoint.
 * Supports arXiv, DOI (via Semantic Scholar), and direct PDF URLs.
 */

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const pdfUrl = searchParams.get('url')
    const title = searchParams.get('title')

    if (!pdfUrl) {
        return new Response(JSON.stringify({ error: 'URL parameter is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        })
    }

    try {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:8010'

        // Build proxy URL with optional title for Semantic Scholar fallback
        let proxyUrl = `${backendUrl}/api/pdf/proxy?url=${encodeURIComponent(pdfUrl)}`
        if (title) {
            proxyUrl += `&title=${encodeURIComponent(title)}`
        }

        console.log(`[PDF Proxy Route] Fetching from backend: ${proxyUrl}`)

        const response = await fetch(proxyUrl, {
            // Set a longer timeout for Semantic Scholar lookups
            signal: AbortSignal.timeout(60000)
        })

        if (!response.ok) {
            const error = await response.text()
            console.error(`[PDF Proxy Route] Backend error:`, response.status, error)
            return new Response(JSON.stringify({ error }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            })
        }

        // Stream the PDF content back
        const contentType = response.headers.get('content-type') || 'application/pdf'
        const contentDisposition = response.headers.get('content-disposition')

        const headers: HeadersInit = {
            'Content-Type': contentType,
        }

        if (contentDisposition) {
            headers['Content-Disposition'] = contentDisposition
        }

        return new Response(response.body, { headers })

    } catch (error) {
        console.error('[PDF Proxy Route] Error:', error)
        return new Response(JSON.stringify({ error: 'Failed to fetch PDF' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
}
