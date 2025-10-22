import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { term } = body;

    if (!term || typeof term !== "string") {
      return NextResponse.json(
        { error: "Term is required" },
        { status: 400 }
      );
    }

    console.log("[DefinitionAPI] Looking up term:", term);

    // Try to fetch from Free Dictionary API
    try {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
        {
          headers: {
            "Accept": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log("[DefinitionAPI] Dictionary API response:", data);

        if (Array.isArray(data) && data.length > 0) {
          const entry = data[0];
          const meaning = entry.meanings?.[0];
          const definition = meaning?.definitions?.[0]?.definition;
          const partOfSpeech = meaning?.partOfSpeech;
          const synonyms = meaning?.synonyms?.slice(0, 5) || [];

          if (definition) {
            return NextResponse.json({
              term: entry.word || term,
              definition: definition,
              partOfSpeech: partOfSpeech,
              source: "Free Dictionary API",
              relatedTerms: synonyms,
              phonetic: entry.phonetic,
              example: meaning?.definitions?.[0]?.example,
            });
          }
        }
      }
    } catch (apiError) {
      console.error("[DefinitionAPI] Dictionary API error:", apiError);
      // Continue to fallback
    }

    // Fallback: Try Wikipedia API for technical/scientific terms
    try {
      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
        {
          headers: {
            "Accept": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log("[DefinitionAPI] Wikipedia response:", data);

        if (data.extract && data.type !== "disambiguation") {
          // Get first sentence or first 200 characters
          let extract = data.extract;
          const firstSentence = extract.match(/^[^.!?]+[.!?]/);
          if (firstSentence) {
            extract = firstSentence[0];
          } else if (extract.length > 200) {
            extract = extract.substring(0, 200) + "...";
          }

          return NextResponse.json({
            term: data.title || term,
            definition: extract,
            source: "Wikipedia",
            relatedTerms: [],
            url: data.content_urls?.desktop?.page,
          });
        }
      }
    } catch (wikiError) {
      console.error("[DefinitionAPI] Wikipedia API error:", wikiError);
    }

    // If all APIs fail, return a helpful fallback
    console.log("[DefinitionAPI] No definition found for:", term);
    return NextResponse.json({
      term: term,
      definition: `No definition found for "${term}". This may be a technical term, proper noun, or domain-specific jargon. Try searching online for more information.`,
      source: "System",
      relatedTerms: [],
    });
  } catch (error) {
    console.error("[DefinitionAPI] Error:", error);
    return NextResponse.json(
      { error: "Failed to lookup definition" },
      { status: 500 }
    );
  }
}
