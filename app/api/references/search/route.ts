import { type NextRequest, NextResponse } from "next/server";
import { trackReferenceRetrieval } from "@/lib/reference-tracker";

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function cleanArxivId(id: string): string {
  if (!id) return "";
  return id.replace(/^arXiv:/i, "").trim();
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/**
 * Helper to determine the best "Direct PDF" URL
 */
function getBestPdfUrl(paper: any): string {
  // 1. ArXiv is the most reliable direct PDF source
  if (paper.externalIds?.ArXiv) {
    return `https://arxiv.org/pdf/${paper.externalIds.ArXiv}.pdf`;
  }

  // 2. Check for Open Access PDF link provided by Semantic Scholar
  if (paper.openAccessPdf?.url) {
    return paper.openAccessPdf.url;
  }

  // 3. Fallback: DOI Landing Page (Not a PDF, but the best we have)
  if (paper.externalIds?.DOI) {
    return `https://doi.org/${paper.externalIds.DOI}`;
  }

  // 4. Last Resort: Semantic Scholar Landing Page
  return paper.url;
}

/**
 * Fetch paper metadata from Semantic Scholar
 * Added 'openAccessPdf' to the requested fields
 */
async function fetchFromSemanticScholarById(id: string, idType: 'DOI' | 'ARXIV'): Promise<any | null> {
  try {
    const prefix = idType === 'DOI' ? 'DOI:' : 'ARXIV:';
    const cleanId = idType === 'ARXIV' ? cleanArxivId(id) : id;

    const headers: Record<string, string> = { "Accept": "application/json" };
    const apiKey = process.env.SEMANTIC_SCHOLAR_KEY;
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    // Requesting 'openAccessPdf' field now
    const response = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/${prefix}${encodeURIComponent(cleanId)}?fields=url,externalIds,title,authors,year,abstract,venue,citationCount,openAccessPdf`,
      { headers }
    );

    if (!response.ok) return null;

    const paper = await response.json();
    const authorsList = paper.authors?.map((author: any) => author.name).slice(0, 5) || [];

    return {
      url: getBestPdfUrl(paper), // <--- Uses new PDF logic
      doi: paper.externalIds?.DOI,
      arxivId: paper.externalIds?.ArXiv,
      semanticScholarId: paper.paperId,
      title: paper.title,
      year: paper.year,
      abstract: paper.abstract,
      authors: authorsList,
      venue: paper.venue || (idType === 'ARXIV' ? "arXiv" : null),
      citationCount: paper.citationCount,
      externalIds: paper.externalIds,
      // Pass the raw open access info just in case
      openAccessPdf: paper.openAccessPdf
    };
  } catch (error) {
    console.error(`[SemanticScholar ${idType}] Error:`, error);
    return null;
  }
}

// ... (fetchAbstractWithFallbacks, fetchAbstractFromCrossRef, fetchAbstractFromArxiv remain the same) ...
async function fetchAbstractFromCrossRef(doi: string): Promise<string | null> {
  try {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": "PaperReader/1.0 (mailto:support@example.com)" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.message?.abstract ? stripHtml(data.message.abstract) : null;
  } catch (e) { return null; }
}

async function fetchAbstractFromArxiv(arxivId: string): Promise<string | null> {
  try {
    const cleanId = cleanArxivId(arxivId);
    const response = await fetch(`http://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleanId)}`);
    if (!response.ok) return null;
    const xmlText = await response.text();
    const summaryMatch = xmlText.match(/<summary>(.*?)<\/summary>/s);
    return summaryMatch && summaryMatch[1] ? summaryMatch[1].trim().replace(/\s+/g, ' ') : null;
  } catch (e) { return null; }
}

async function fetchAbstractWithFallbacks(metadata: any): Promise<string | null> {
  if (metadata.abstract && metadata.abstract.length > 50) return metadata.abstract;
  if (metadata.doi) {
    const abs = await fetchAbstractFromCrossRef(metadata.doi);
    if (abs) return abs;
  }
  if (metadata.arxivId) {
    const abs = await fetchAbstractFromArxiv(metadata.arxivId);
    if (abs) return abs;
  }
  return null;
}

// ==========================================
// MAIN POST HANDLER
// ==========================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, authors, year, doi, arxivId, pdfId } = body;

    if (!title && !doi && !arxivId) {
      return NextResponse.json({ error: "Title, DOI, or arXiv ID required" }, { status: 400 });
    }

    let result = null;
    let strategyUsed = "";

    // 1. Exact Match via DOI
    if (doi && !result) {
      result = await fetchFromSemanticScholarById(doi, 'DOI');
      if (result) strategyUsed = 'semantic-scholar-doi';
    }

    // 2. Exact Match via arXiv ID
    if (arxivId && !result) {
      result = await fetchFromSemanticScholarById(arxivId, 'ARXIV');
      if (result) strategyUsed = 'semantic-scholar-arxiv';
    }

    // 3. Search by Title
    if (title && !result) {
      try {
        const headers: Record<string, string> = { "Accept": "application/json" };
        const apiKey = process.env.SEMANTIC_SCHOLAR_KEY;
        if (apiKey) {
          headers["x-api-key"] = apiKey;
        }

        const query = encodeURIComponent(title);
        // Added 'openAccessPdf' to fields here too
        const searchResponse = await fetch(
          `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&limit=10&fields=url,externalIds,title,authors,year,abstract,venue,citationCount,openAccessPdf`,
          { headers }
        );

        if (searchResponse.ok) {
          const data = await searchResponse.json();
          if (data.data && data.data.length > 0) {
            let bestMatch = null;
            let bestScore = -1;
            const inputYear = year ? parseInt(year.toString()) : null;
            const inputAuthors = authors ? authors.toLowerCase() : "";

            for (const paper of data.data) {
              let score = 0;
              if (paper.title.toLowerCase() === title.toLowerCase()) score += 100;
              else if (paper.title.toLowerCase().includes(title.toLowerCase())) score += 50;
              if (inputYear && paper.year === inputYear) score += 50;
              if (inputAuthors && paper.authors) {
                const paperAuthors = paper.authors.map((a: any) => a.name.toLowerCase()).join(" ");
                if (inputAuthors.split(",")[0].trim().length > 3 && paperAuthors.includes(inputAuthors.split(",")[0].trim().toLowerCase())) {
                  score += 30;
                }
              }
              if (score > bestScore) {
                bestScore = score;
                bestMatch = paper;
              }
            }

            const selectedPaper = (bestScore > 20) ? bestMatch : data.data[0];
            const authorsList = selectedPaper.authors?.map((a: any) => a.name).slice(0, 5) || [];

            result = {
              url: getBestPdfUrl(selectedPaper), // <--- Uses new PDF logic
              doi: selectedPaper.externalIds?.DOI,
              arxivId: selectedPaper.externalIds?.ArXiv,
              semanticScholarId: selectedPaper.paperId,
              title: selectedPaper.title,
              year: selectedPaper.year,
              abstract: selectedPaper.abstract,
              authors: authorsList,
              venue: selectedPaper.venue,
              externalIds: selectedPaper.externalIds,
              openAccessPdf: selectedPaper.openAccessPdf
            };
            strategyUsed = 'semantic-scholar-search';
          }
        }
      } catch (e) {
        console.error("[v0] Title search error:", e);
      }
    }

    // 4. Fallback Logic (Generic)
    if (!result) {
      const fallbackQuery = title || (arxivId ? cleanArxivId(arxivId) : "");
      return NextResponse.json({
        url: `https://scholar.google.com/scholar?q=${encodeURIComponent(fallbackQuery)}`,
        fallback: true,
        title: title || "Unknown Title"
      });
    }

    // Final Processing
    if (!result.abstract || result.abstract.length < 50) {
      const betterAbstract = await fetchAbstractWithFallbacks(result);
      if (betterAbstract) result.abstract = betterAbstract;
    }
    if (result.abstract && result.abstract.length > 500) {
      result.abstract = result.abstract;
    }

    if (pdfId) trackReferenceRetrieval(pdfId, title || result.title, result, strategyUsed);

    return NextResponse.json(result);

  } catch (error) {
    console.error("[v0] API Fatal Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}