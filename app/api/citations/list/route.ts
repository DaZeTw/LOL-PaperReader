import { type NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/citations/list
 * List all saved citation extraction files for debugging
 */
export async function GET(request: NextRequest) {
  try {
    const dataDir = path.join(process.cwd(), "data", "citations");

    if (!fs.existsSync(dataDir)) {
      return NextResponse.json({
        files: [],
        message: "No extractions found yet",
      });
    }

    const files = fs
      .readdirSync(dataDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        const filePath = path.join(dataDir, file);
        const stats = fs.statSync(filePath);
        const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));

        return {
          filename: file,
          path: filePath,
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          pdfFileName: content.fileName,
          totalCitations: content.totalCitations,
          highConfidenceCount: content.highConfidenceCount,
          extractedAt: content.extractedAt,
        };
      })
      .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime()); // Most recent first

    return NextResponse.json({
      files,
      total: files.length,
    });
  } catch (error) {
    console.error("[listCitations] Error:", error);
    return NextResponse.json(
      { error: "Failed to list citation files" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/citations/list?file={filename}
 * Get content of a specific extraction file
 */
export async function POST(request: NextRequest) {
  try {
    const { filename } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: "Filename is required" }, { status: 400 });
    }

    const dataDir = path.join(process.cwd(), "data", "citations");
    const filePath = path.join(dataDir, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    return NextResponse.json(content);
  } catch (error) {
    console.error("[getCitationFile] Error:", error);
    return NextResponse.json(
      { error: "Failed to read citation file" },
      { status: 500 }
    );
  }
}
