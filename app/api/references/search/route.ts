import { type NextRequest, NextResponse } from "next/server";
import { trackReferenceRetrieval } from "@/lib/reference-tracker";

/**
 * Fetch citation metadata from Google Scholar using GSB output format
 */
async function fetchFromGoogleScholar(citationText: string): Promise<any | null> {
  try {
    // Build Google Scholar API URL with gsb output format
    const scholarUrl = new URL("https://scholar.google.com/scholar");
    scholarUrl.searchParams.set("oi", "gsr-r");
    scholarUrl.searchParams.set("q", citationText);
    scholarUrl.searchParams.set("output", "gsb");
    scholarUrl.searchParams.set("hl", "en");
    scholarUrl.searchParams.set("rfa", "1");

    console.log("[v0] Calling Google Scholar:", scholarUrl.toString());

    const response = await fetch(scholarUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      console.error("[v0] Google Scholar API error:", response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    console.log("[v0] Google Scholar response:", JSON.stringify(data, null, 2));

    // Parse the response structure
    if (data.r && data.r.length > 0) {
      const result = data.r[0]; // Take first result

      // Extract metadata from the result
      const metadata = {
        title: result.t || null,
        url: result.u || null,
        authors: result.m ? parseAuthors(result.m) : [],
        year: result.m ? parseYear(result.m) : null,
        abstract: result.s ? stripHtml(result.s) : null,
        venue: result.m ? parseVenue(result.m) : null,
        citationCount: result.l?.c?.l ? parseInt(result.l.c.l.match(/\d+/)?.[0] || "0") : 0,
        pdfUrl: result.l?.g?.u || null,
      };

      return metadata;
    }

    return null;
  } catch (error) {
    console.error("[v0] Google Scholar fetch error:", error);
    return null;
  }
}

/**
 * Parse authors from Google Scholar metadata string
 * Format: "Author1, Author2, Author3 - Source, Year"
 */
function parseAuthors(metadata: string): string[] {
  const authorMatch = metadata.match(/^([^-]+)/);
  if (authorMatch) {
    const authorsText = authorMatch[1].trim();
    return authorsText.split(",").map(a => a.trim()).filter(a => a.length > 0);
  }
  return [];
}

/**
 * Parse year from Google Scholar metadata string
 */
function parseYear(metadata: string): number | null {
  const yearMatch = metadata.match(/\b(19\d{2}|20\d{2})\b/);
  return yearMatch ? parseInt(yearMatch[1]) : null;
}

/**
 * Parse venue from Google Scholar metadata string
 */
function parseVenue(metadata: string): string | null {
  const venueMatch = metadata.match(/-\s*([^,]+),/);
  return venueMatch ? venueMatch[1].trim() : null;
}

/**
 * Strip HTML tags from string
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/**
 * Extract clean title from citation text
 * Removes citation number and stops before venue/proceedings information
 */
function extractTitleFromCitation(citation: string, providedTitle?: string): string {
  // If a title was already provided and looks reasonable, use it
  if (providedTitle && !providedTitle.includes("In Proceedings") && providedTitle.length < 300) {
    return providedTitle;
  }

  // Remove citation number at start [1], [19], etc.
  let text = citation.replace(/^\[\d+\]\s*/, '');

  // Remove author names if present at start (format: "Authors. Year.")
  text = text.replace(/^[^.]+\.\s*\d{4}\.\s*/, '');

  // Common separators that indicate end of title
  const separators = [
    /\s+In\s+Proceedings\s+of/i,
    /\s+In:\s+Proceedings/i,
    /\s+Proceedings\s+of\s+the/i,
    /\s+In\s+[A-Z][a-z]+\s+\d{4}/i,  // "In CVPR 2023"
    /\s+arXiv\s+preprint/i,
    /\s+\([A-Za-z]+,\s+[A-Za-z]+\)/,  // "(City, Country)"
    /\s+\d{4}\./,  // Year followed by period
    /\.\s+[A-Z][a-z]+\s+for\s+/i,  // ". Association for"
    /\.\s+ACM\s+/i,
    /\.\s+IEEE\s+/i,
  ];

  // Find the earliest separator
  let endIndex = text.length;
  for (const separator of separators) {
    const match = text.search(separator);
    if (match !== -1 && match < endIndex) {
      endIndex = match;
    }
  }

  // Extract title and clean it up
  let title = text.substring(0, endIndex).trim();

  // Remove trailing periods and commas
  title = title.replace(/[.,]+$/, '').trim();

  // Remove any remaining line breaks or excessive whitespace
  title = title.replace(/\s+/g, ' ').trim();

  return title || providedTitle || citation;
}

/**
 * Extract DOI from citation text
 * Matches patterns like: doi.org/10.1145/123, https://doi.org/10.1145/123, doi:10.1145/123
 */
function extractDOI(text: string): string | null {
  const doiPatterns = [
    /doi\.org\/([^\s,\]]+)/i,
    /https?:\/\/doi\.org\/([^\s,\]]+)/i,
    /doi:\s*([^\s,\]]+)/i,
    /\bdoi\b[:\s]+([^\s,\]]+)/i,
  ];

  for (const pattern of doiPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Fetch paper metadata from Semantic Scholar using DOI
 */
async function fetchFromSemanticScholarByDOI(doi: string): Promise<any | null> {
  try {
    const response = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=url,externalIds,title,authors,year,abstract,venue,citationCount,publicationTypes`,
      {
        headers: {
          "Accept": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.warn(`[SemanticScholar DOI] Failed to fetch DOI ${doi}: ${response.status}`);
      return null;
    }

    const paper = await response.json();
    console.log(`[SemanticScholar DOI] Found paper for DOI ${doi}`);

    // Format the result
    const authorsList = paper.authors?.map((author: any) => author.name).slice(0, 5) || [];

    return {
      url: paper.url,
      doi: paper.externalIds?.DOI,
      arxivId: paper.externalIds?.ArXiv,
      pmid: paper.externalIds?.PubMed,
      semanticScholarId: paper.paperId,
      title: paper.title,
      year: paper.year,
      abstract: paper.abstract,
      authors: authorsList,
      venue: paper.venue,
      citationCount: paper.citationCount,
      externalIds: paper.externalIds,
    };
  } catch (error) {
    console.error(`[SemanticScholar DOI] Error fetching DOI ${doi}:`, error);
    return null;
  }
}

/**
 * Fetch abstract from CrossRef using DOI
 */
async function fetchAbstractFromCrossRef(doi: string): Promise<string | null> {
  try {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AcademicReader/1.0; mailto:support@example.com)",
      },
    });

    if (!response.ok) {
      console.warn(`[CrossRef] Failed to fetch DOI ${doi}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const abstract = data.message?.abstract;

    if (abstract) {
      console.log(`[CrossRef] Found abstract for DOI ${doi}`);
      return stripHtml(abstract);
    }

    return null;
  } catch (error) {
    console.error(`[CrossRef] Error fetching DOI ${doi}:`, error);
    return null;
  }
}

/**
 * Fetch abstract from arXiv using arXiv ID
 */
async function fetchAbstractFromArxiv(arxivId: string): Promise<string | null> {
  try {
    const response = await fetch(`http://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`);

    if (!response.ok) {
      console.warn(`[arXiv] Failed to fetch ${arxivId}: ${response.status}`);
      return null;
    }

    const xmlText = await response.text();

    // Parse XML to extract abstract (simple regex-based parsing)
    const summaryMatch = xmlText.match(/<summary>(.*?)<\/summary>/s);
    if (summaryMatch && summaryMatch[1]) {
      const abstract = summaryMatch[1].trim().replace(/\s+/g, ' ');
      console.log(`[arXiv] Found abstract for ${arxivId}`);
      return abstract;
    }

    return null;
  } catch (error) {
    console.error(`[arXiv] Error fetching ${arxivId}:`, error);
    return null;
  }
}

/**
 * Try multiple strategies to get an abstract
 */
async function fetchAbstractWithFallbacks(metadata: any): Promise<string | null> {
  // Try 1: Use existing abstract from search result
  if (metadata.abstract && metadata.abstract.length > 50) {
    return metadata.abstract;
  }

  console.log(`[AbstractFallback] No good abstract found, trying fallback strategies...`);

  // Try 2: Fetch from CrossRef if we have a DOI
  if (metadata.doi || metadata.externalIds?.DOI) {
    const doi = metadata.doi || metadata.externalIds.DOI;
    const crossRefAbstract = await fetchAbstractFromCrossRef(doi);
    if (crossRefAbstract) {
      return crossRefAbstract;
    }
  }

  // Try 3: Fetch from arXiv if we have an arXiv ID
  if (metadata.arxivId || metadata.externalIds?.ArXiv) {
    const arxivId = metadata.arxivId || metadata.externalIds.ArXiv;
    const arxivAbstract = await fetchAbstractFromArxiv(arxivId);
    if (arxivAbstract) {
      return arxivAbstract;
    }
  }

  console.warn(`[AbstractFallback] All fallback strategies failed`);
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, authors, year, fullCitation, pdfId } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    // Extract clean title if we have full citation
    const cleanTitle = fullCitation ? extractTitleFromCitation(fullCitation, title) : title;

    console.log("[v0] Searching for paper:", {
      originalTitle: title,
      cleanTitle,
      authors,
      year,
      fullCitationLength: fullCitation?.length,
      pdfId
    });

    // Strategy 1: Try DOI-based search first if DOI is present in citation
    if (fullCitation) {
      const doi = extractDOI(fullCitation);
      if (doi) {
        console.log(`[v0] Extracted DOI from citation: ${doi}`);
        try {
          const doiResult = await fetchFromSemanticScholarByDOI(doi);
          if (doiResult && doiResult.title) {
            console.log("[v0] Semantic Scholar DOI search found paper:", doiResult);

            // Try to get better abstract if missing or too short
            if (!doiResult.abstract || doiResult.abstract.length < 50) {
              console.log("[v0] DOI result abstract missing/short, trying fallbacks...");
              const betterAbstract = await fetchAbstractWithFallbacks(doiResult);
              if (betterAbstract) {
                doiResult.abstract = betterAbstract;
              }
            }

            // Truncate abstract if too long
            if (doiResult.abstract && doiResult.abstract.length > 300) {
              doiResult.abstract = doiResult.abstract.substring(0, 297) + "...";
            }

            // Construct preferred URL
            if (doiResult.doi) {
              doiResult.url = `https://doi.org/${doiResult.doi}`;
            } else if (doiResult.arxivId) {
              doiResult.url = `https://arxiv.org/abs/${doiResult.arxivId}`;
            } else if (doiResult.semanticScholarId) {
              doiResult.url = `https://www.semanticscholar.org/paper/${doiResult.semanticScholarId}`;
            }

            // Track the reference retrieval
            if (pdfId) {
              trackReferenceRetrieval(pdfId, fullCitation, doiResult, 'semantic-scholar-doi');
            }

            return NextResponse.json(doiResult);
          }
        } catch (error) {
          console.error("[v0] DOI search error:", error);
          // Continue to next strategy
        }
      }
    }

    // Strategy 2: Try Google Scholar with full citation if available
    if (fullCitation) {
      try {
        const scholarResult = await fetchFromGoogleScholar(fullCitation);
        if (scholarResult && scholarResult.title) {
          console.log("[v0] Google Scholar found paper:", scholarResult);

          // Try to get better abstract if missing or too short
          if (!scholarResult.abstract || scholarResult.abstract.length < 50) {
            console.log("[v0] Google Scholar abstract missing/short, trying fallbacks...");
            const betterAbstract = await fetchAbstractWithFallbacks(scholarResult);
            if (betterAbstract) {
              scholarResult.abstract = betterAbstract;
            }
          }

          // Track the reference retrieval
          if (pdfId) {
            trackReferenceRetrieval(pdfId, fullCitation, scholarResult, 'google-scholar');
          }

          return NextResponse.json(scholarResult);
        }
      } catch (error) {
        console.error("[v0] Google Scholar error:", error);
        // Continue to Semantic Scholar
      }
    }

    // Strategy 3: Try Semantic Scholar API - Multiple strategies for better results
    try {
      // Strategy 3a: Search with title only (use cleaned title)
      let query = encodeURIComponent(cleanTitle);
      let response = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&limit=10&fields=url,externalIds,title,authors,year,abstract,venue,citationCount,publicationTypes`,
        {
          headers: {
            "Accept": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log("[v0] Semantic Scholar response:", data);

        if (data.data && data.data.length > 0) {
          // Strategy 3b: If we have authors, try searching with title + first author
          if (authors && data.data.length < 3) {
            try {
              const authorPart = authors.split(',')[0]?.trim();
              if (authorPart) {
                const authorQuery = encodeURIComponent(`${cleanTitle} ${authorPart}`);
                const authorResponse = await fetch(
                  `https://api.semanticscholar.org/graph/v1/paper/search?query=${authorQuery}&limit=10&fields=url,externalIds,title,authors,year,abstract,venue,citationCount,publicationTypes`,
                  {
                    headers: {
                      "Accept": "application/json",
                    },
                  }
                );
                if (authorResponse.ok) {
                  const authorData = await authorResponse.json();
                  if (authorData.data && authorData.data.length > 0) {
                    // Merge results, avoiding duplicates
                    const existingIds = new Set(data.data.map((p: any) => p.paperId));
                    const uniqueNew = authorData.data.filter((p: any) => !existingIds.has(p.paperId));
                    data.data = [...data.data, ...uniqueNew].slice(0, 10);
                    console.log("[v0] After author search, total results:", data.data.length);
                  }
                }
              }
            } catch (err) {
              console.warn("[v0] Author search failed, continuing with title results:", err);
            }
          }

          // Strategy 3c: If still not enough results and we have full citation, try searching with first few words of citation
          if (fullCitation && data.data.length < 2) {
            try {
              // Extract first 50 characters of citation for search
              const citationSnippet = fullCitation.replace(/^\[\d+\]\s*/, '').substring(0, 50);
              const citationQuery = encodeURIComponent(citationSnippet);
              const citationResponse = await fetch(
                `https://api.semanticscholar.org/graph/v1/paper/search?query=${citationQuery}&limit=10&fields=url,externalIds,title,authors,year,abstract,venue,citationCount,publicationTypes`,
                {
                  headers: {
                    "Accept": "application/json",
                  },
                }
              );
              if (citationResponse.ok) {
                const citationData = await citationResponse.json();
                if (citationData.data && citationData.data.length > 0) {
                  // Merge results, avoiding duplicates
                  const existingIds = new Set(data.data.map((p: any) => p.paperId));
                  const uniqueNew = citationData.data.filter((p: any) => !existingIds.has(p.paperId));
                  data.data = [...data.data, ...uniqueNew].slice(0, 10);
                  console.log("[v0] After citation search, total results:", data.data.length);
                }
              }
            } catch (err) {
              console.warn("[v0] Citation search failed, continuing with previous results:", err);
            }
          }

          // Find best match by comparing title, year, and authors
          let bestMatch = null;
          let bestScore = -1;

          for (const paper of data.data) {
            let score = 0;

            // Check title similarity (exact match or contains)
            if (paper.title) {
              const paperTitleLower = paper.title.toLowerCase();
              const searchTitleLower = cleanTitle.toLowerCase();
              if (paperTitleLower === searchTitleLower) {
                score += 100;
              } else if (paperTitleLower.includes(searchTitleLower) || searchTitleLower.includes(paperTitleLower)) {
                score += 50;
              }
            }

            // Check year match
            if (year && paper.year?.toString() === year) {
              score += 50;
            }

            // Check authors match
            if (authors && paper.authors?.length > 0) {
              const searchAuthorsLower = authors.toLowerCase();
              for (const author of paper.authors) {
                if (author.name?.toLowerCase().includes(searchAuthorsLower) || searchAuthorsLower.includes(author.name?.toLowerCase() || '')) {
                  score += 30;
                  break;
                }
              }
            }

            if (score > bestScore) {
              bestScore = score;
              bestMatch = paper;
            }
          }

          // Use best match if score is good, otherwise use first result
          if (!bestMatch || bestScore < 20) {
            bestMatch = data.data[0];
            console.log("[v0] No good match found, using first result");
          } else {
            console.log("[v0] Best match found with score:", bestScore);
          }

          // Extract abstract snippet (first 300 characters initially)
          let abstractSnippet = bestMatch.abstract || null;

          // Format authors list
          const authorsList = bestMatch.authors?.map((author: any) => author.name).slice(0, 5) || [];

          const result = {
            url: bestMatch.url,
            doi: bestMatch.externalIds?.DOI,
            arxivId: bestMatch.externalIds?.ArXiv,
            pmid: bestMatch.externalIds?.PubMed,
            semanticScholarId: bestMatch.paperId,
            title: bestMatch.title,
            year: bestMatch.year,
            abstract: abstractSnippet,
            authors: authorsList,
            venue: bestMatch.venue,
            citationCount: bestMatch.citationCount,
            externalIds: bestMatch.externalIds,
          };

          // Try to get better abstract if missing or too short
          if (!result.abstract || result.abstract.length < 50) {
            console.log("[v0] Semantic Scholar abstract missing/short, trying fallbacks...");
            const betterAbstract = await fetchAbstractWithFallbacks(result);
            if (betterAbstract) {
              result.abstract = betterAbstract;
            }
          }

          // Truncate abstract if too long (after getting full version)
          if (result.abstract && result.abstract.length > 300) {
            result.abstract = result.abstract.substring(0, 297) + "...";
          }

          // Construct preferred URL
          if (result.doi) {
            result.url = `https://doi.org/${result.doi}`;
          } else if (result.arxivId) {
            result.url = `https://arxiv.org/abs/${result.arxivId}`;
          } else if (result.semanticScholarId) {
            result.url = `https://www.semanticscholar.org/paper/${result.semanticScholarId}`;
          }

          // Track the reference retrieval
          if (pdfId) {
            trackReferenceRetrieval(pdfId, fullCitation || title, result, 'semantic-scholar');
          }

          console.log("[v0] Paper found:", result);
          return NextResponse.json(result);
        }
      }
    } catch (apiError) {
      console.error("[v0] Semantic Scholar API error:", apiError);
      // Continue to fallback
    }

    // Fallback: Google Scholar search URL
    // Use full citation if available for better search, otherwise use clean title + authors
    const scholarQuery = fullCitation
      ? fullCitation.replace(/^\[\d+\]\s*/, '').trim()
      : `${cleanTitle} ${authors || ""}`.trim();

    const fallbackUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(scholarQuery)}`;

    console.log("[v0] No direct match found, providing Google Scholar fallback with query:", scholarQuery.substring(0, 100));

    const fallbackResult = {
      url: fallbackUrl,
      fallback: true,
      searchQuery: scholarQuery,
      title: cleanTitle,
      authors: authors?.split(',').map((a: string) => a.trim()),
      year: year ? parseInt(year) : undefined,
      abstract: null,
    };

    // Track the fallback reference
    if (pdfId) {
      trackReferenceRetrieval(pdfId, fullCitation || title, fallbackResult, 'fallback');
    }

    return NextResponse.json(fallbackResult);
  } catch (error) {
    console.error("[v0] Reference search error:", error);
    return NextResponse.json(
      { error: "Failed to search for paper" },
      { status: 500 }
    );
  }
}
