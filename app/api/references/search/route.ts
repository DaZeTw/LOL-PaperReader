import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, authors, year, fullCitation } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    console.log("[v0] Searching for paper:", { title, authors, year, fullCitationLength: fullCitation?.length });

    // Try Semantic Scholar API - Multiple strategies for better results
    try {
      // Strategy 1: Search with title only
      let query = encodeURIComponent(title);
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
          // Strategy 2: If we have authors, try searching with title + first author
          if (authors && data.data.length < 3) {
            try {
              const authorPart = authors.split(',')[0]?.trim();
              if (authorPart) {
                const authorQuery = encodeURIComponent(`${title} ${authorPart}`);
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

          // Strategy 3: If still not enough results and we have full citation, try searching with first few words of citation
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
              const searchTitleLower = title.toLowerCase();
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

          // Extract abstract snippet (first 300 characters)
          let abstractSnippet = bestMatch.abstract;
          if (abstractSnippet && abstractSnippet.length > 300) {
            abstractSnippet = abstractSnippet.substring(0, 297) + "...";
          }

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
          };

          // Construct preferred URL
          if (result.doi) {
            result.url = `https://doi.org/${result.doi}`;
          } else if (result.arxivId) {
            result.url = `https://arxiv.org/abs/${result.arxivId}`;
          } else if (result.semanticScholarId) {
            result.url = `https://www.semanticscholar.org/paper/${result.semanticScholarId}`;
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
    // Use full citation if available for better search, otherwise use title + authors
    const scholarQuery = fullCitation
      ? fullCitation.replace(/^\[\d+\]\s*/, '').trim()
      : `${title} ${authors || ""}`.trim();

    const fallbackUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(scholarQuery)}`;

    console.log("[v0] No direct match found, providing Google Scholar fallback with query:", scholarQuery.substring(0, 100));
    return NextResponse.json({
      url: fallbackUrl,
      fallback: true,
      searchQuery: scholarQuery,
      title: title,
      authors: authors?.split(',').map((a: string) => a.trim()),
      year: year ? parseInt(year) : undefined,
    });
  } catch (error) {
    console.error("[v0] Reference search error:", error);
    return NextResponse.json(
      { error: "Failed to search for paper" },
      { status: 500 }
    );
  }
}
