import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, authors, year } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    console.log("[v0] Searching for paper:", { title, authors, year });

    // Try Semantic Scholar API
    try {
      const query = encodeURIComponent(title);
      const response = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&limit=3&fields=url,externalIds,title,authors,year,abstract,venue,citationCount`,
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
          // Find best match by comparing title and year
          let bestMatch = data.data[0];

          if (year) {
            const matchingYear = data.data.find(
              (paper: any) => paper.year?.toString() === year
            );
            if (matchingYear) {
              bestMatch = matchingYear;
            }
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
    const scholarQuery = `${title} ${authors || ""}`.trim();
    const fallbackUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(scholarQuery)}`;

    console.log("[v0] No direct match found, providing Google Scholar fallback");
    return NextResponse.json({
      url: fallbackUrl,
      fallback: true,
      searchQuery: scholarQuery,
    });
  } catch (error) {
    console.error("[v0] Reference search error:", error);
    return NextResponse.json(
      { error: "Failed to search for paper" },
      { status: 500 }
    );
  }
}
