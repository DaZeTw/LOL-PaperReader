import { type NextRequest, NextResponse } from "next/server";
import { BACKEND_API_URL } from "@/lib/config";

/**
 * POST /api/references/pdf-link
 * 
 * Resolve PDF link from paper metadata.
 * Proxies request to backend and handles fallback to frontend-only sources.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { doi, arxivId, title, authors, year } = body;

        // Validate input
        if (!doi && !arxivId && !title) {
            return NextResponse.json(
                { error: "At least one of doi, arxivId, or title must be provided" },
                { status: 400 }
            );
        }

        console.log("[pdf-link] Resolving PDF link:", { doi, arxivId, title: title?.substring(0, 50) });

        // Strategy 1: If arXiv ID provided, return direct PDF link immediately
        if (arxivId) {
            const cleanId = arxivId.replace(/^arXiv:/i, "").trim();
            const pdfUrl = `https://arxiv.org/pdf/${cleanId}.pdf`;
            console.log("[pdf-link] arXiv PDF:", pdfUrl);
            return NextResponse.json({
                pdfUrl,
                source: "arxiv",
                isOpenAccess: true,
            });
        }

        // Strategy 2: Try backend API (has Unpaywall, Semantic Scholar, CrossRef)
        try {
            const backendUrl = BACKEND_API_URL.replace(/\/$/, "");
            const response = await fetch(`${backendUrl}/references/pdf-link`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    doi,
                    arxiv_id: arxivId,
                    title,
                    authors,
                    year,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.pdf_url) {
                    console.log("[pdf-link] Backend found PDF:", data.pdf_url);
                    return NextResponse.json({
                        pdfUrl: data.pdf_url,
                        source: data.source,
                        isOpenAccess: data.is_open_access,
                    });
                }
            }
        } catch (backendError) {
            console.warn("[pdf-link] Backend error, trying fallbacks:", backendError);
        }

        // Strategy 3: Semantic Scholar API directly (frontend fallback)
        if (doi || title) {
            try {
                const pdfResult = await fetchSemanticScholarPdf(doi, title, authors);
                if (pdfResult) {
                    return NextResponse.json(pdfResult);
                }
            } catch (ssError) {
                console.warn("[pdf-link] Semantic Scholar error:", ssError);
            }
        }

        // Strategy 4: If DOI provided, return DOI resolver URL as fallback
        if (doi) {
            const doiUrl = `https://doi.org/${doi}`;
            console.log("[pdf-link] Fallback to DOI URL:", doiUrl);
            return NextResponse.json({
                pdfUrl: doiUrl,
                source: "doi",
                isOpenAccess: false,
            });
        }

        // No PDF found
        console.log("[pdf-link] No PDF found for:", { doi, title: title?.substring(0, 50) });
        return NextResponse.json({
            pdfUrl: null,
            source: null,
            isOpenAccess: false,
        });

    } catch (error) {
        console.error("[pdf-link] Error:", error);
        return NextResponse.json(
            { error: "Failed to resolve PDF link" },
            { status: 500 }
        );
    }
}


/**
 * Fetch PDF link from Semantic Scholar API
 */
async function fetchSemanticScholarPdf(
    doi?: string,
    title?: string,
    authors?: string[]
): Promise<{ pdfUrl: string; source: string; isOpenAccess: boolean } | null> {
    try {
        let paperData = null;

        // Try DOI lookup first
        if (doi) {
            const response = await fetch(
                `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=openAccessPdf,isOpenAccess`,
                { headers: { "Accept": "application/json" } }
            );
            if (response.ok) {
                paperData = await response.json();
            }
        }

        // Fall back to title search
        if (!paperData && title) {
            let query = title;
            if (authors && authors.length > 0) {
                query = `${title} ${authors[0]}`;
            }

            const response = await fetch(
                `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=1&fields=openAccessPdf,isOpenAccess`,
                { headers: { "Accept": "application/json" } }
            );
            if (response.ok) {
                const data = await response.json();
                if (data.data && data.data.length > 0) {
                    paperData = data.data[0];
                }
            }
        }

        // Extract PDF URL
        if (paperData?.openAccessPdf?.url) {
            return {
                pdfUrl: paperData.openAccessPdf.url,
                source: "semantic_scholar",
                isOpenAccess: paperData.isOpenAccess ?? true,
            };
        }

        return null;
    } catch (error) {
        console.error("[pdf-link] Semantic Scholar fetch error:", error);
        return null;
    }
}
