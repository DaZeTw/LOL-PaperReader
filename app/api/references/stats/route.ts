import { type NextRequest, NextResponse } from "next/server";
import { loadPDFReferenceData, getReferencesNeedingRetry } from "@/lib/reference-tracker";

/**
 * GET endpoint to retrieve reference statistics for a PDF
 * Query params: pdfId
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pdfId = searchParams.get('pdfId');

    if (!pdfId) {
      return NextResponse.json(
        { error: "pdfId is required" },
        { status: 400 }
      );
    }

    const data = loadPDFReferenceData(pdfId);

    if (!data) {
      return NextResponse.json(
        { error: "No tracking data found for this PDF" },
        { status: 404 }
      );
    }

    // Get references that need retry
    const needingRetry = getReferencesNeedingRetry(pdfId);

    // Group references by source
    const bySource = {
      'google-scholar': data.references.filter(r => r.source === 'google-scholar').length,
      'semantic-scholar': data.references.filter(r => r.source === 'semantic-scholar').length,
      'fallback': data.references.filter(r => r.source === 'fallback').length,
    };

    // Get references with missing abstracts
    const missingAbstracts = data.references.filter(r => !r.hasAbstract);

    return NextResponse.json({
      pdfId: data.pdfId,
      filename: data.pdfFilename,
      uploadedAt: data.uploadedAt,
      stats: data.stats,
      bySource,
      needingRetry: needingRetry.length,
      missingAbstracts: missingAbstracts.map(r => ({
        title: r.title,
        citationText: r.citationText.substring(0, 100) + (r.citationText.length > 100 ? '...' : ''),
        retryCount: r.retryCount,
        source: r.source,
      })),
    });
  } catch (error) {
    console.error("[v0] Stats retrieval error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve statistics" },
      { status: 500 }
    );
  }
}
