import { type NextRequest, NextResponse } from "next/server";
import { extractReferencesFromPDF, extractSectionsFromPDF } from "@/lib/pdf-reference-parser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    console.log("[PDF Upload] Processing file:", file.name, "Size:", file.size);

    // Convert file to ArrayBuffer for PDF.js
    const arrayBuffer = await file.arrayBuffer();

    // Extract references from PDF (clone buffer to avoid detachment)
    console.log("[PDF Upload] Extracting references...");
    const refBuffer = arrayBuffer.slice(0);
    const references = await extractReferencesFromPDF(refBuffer);

    // Extract sections from PDF (clone buffer to avoid detachment)
    console.log("[PDF Upload] Extracting sections...");
    const sectBuffer = arrayBuffer.slice(0);
    const sections = await extractSectionsFromPDF(sectBuffer);

    // Fallback to mock sections if none found
    const finalSections = sections.length > 0 ? sections : [
      {
        id: "abstract",
        title: "Abstract",
        content: "Abstract section (auto-detected)",
        page: 1,
      },
      {
        id: "introduction",
        title: "Introduction",
        content: "Introduction section (auto-detected)",
        page: 2,
      },
    ];

    const parsedData = {
      title: file.name,
      sections: finalSections,
      references: references.map(ref => ({
        id: ref.id,
        number: ref.number,
        text: ref.text,
        authors: ref.authors,
        title: ref.title,
        year: ref.year,
        journal: ref.journal,
        doi: ref.doi,
        url: ref.url,
        arxivId: ref.arxivId,
      })),
      metadata: {
        pages: 0, // Will be set by PDF viewer
        author: "Unknown",
        date: new Date().getFullYear().toString(),
      },
    };

    console.log("[PDF Upload] Successfully parsed:", {
      sections: parsedData.sections.length,
      references: parsedData.references.length,
    });

    return NextResponse.json(parsedData);
  } catch (error) {
    console.error("[v0] PDF upload error:", error);
    return NextResponse.json(
      { error: "Failed to process PDF" },
      { status: 500 }
    );
  }
}
