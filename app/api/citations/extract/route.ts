import { type NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface ExtractedCitation {
  id: string;
  text: string;
  confidence: number;
  method: string;
  spansPages: boolean;
  destPage: number;
}

/**
 * Groups text items by their Y-coordinate with a tolerance
 */
function groupTextByLines(textItems: any[], yTolerance = 2, xGapThreshold = 20) {
  const lines: any[] = [];
  const sortedItems = textItems.sort((a, b) => b.transform[5] - a.transform[5]);

  for (const item of sortedItems) {
    const yPos = item.transform[5];
    let targetLine = lines.find((line) => Math.abs(line.yPosition - yPos) <= yTolerance);

    if (!targetLine) {
      targetLine = { yPosition: yPos, items: [] };
      lines.push(targetLine);
    }
    targetLine.items.push(item);
  }

  const finalLines: any[] = [];

  for (const line of lines) {
    const items = line.items.sort((a: any, b: any) => a.transform[4] - b.transform[4]);
    let currentSubline: any = { yPosition: line.yPosition, items: [] };

    for (let i = 0; i < items.length; i++) {
      const curr = items[i];
      const prev = items[i - 1];
      const prevXEnd = prev ? prev.transform[4] + (prev.width || 0) : null;
      const currX = curr.transform[4];
      const gap = prev ? currX - prevXEnd : 0;

      if (prev && gap > xGapThreshold) {
        if (currentSubline.items.length > 0) {
          const text = currentSubline.items.map((it: any) => it.str).join("");
          currentSubline = { ...currentSubline, text, xPosition: currentSubline.items[0].transform[4] };
          finalLines.push(currentSubline);
        }
        currentSubline = { yPosition: line.yPosition, items: [] };
      }
      currentSubline.items.push(curr);
    }

    if (currentSubline.items.length > 0) {
      const text = currentSubline.items.map((it: any) => it.str).join("");
      currentSubline = { ...currentSubline, text, xPosition: currentSubline.items[0].transform[4] };
      finalLines.push(currentSubline);
    }
  }

  return finalLines.sort((a, b) => b.yPosition - a.yPosition);
}

/**
 * Extracts reference text at a given destination
 */
async function extractReferenceAtDestination(
  pdf: any,
  dest: any,
  targetRect: any
): Promise<{ text: string; method: string; confidence: number; spansPages: boolean }> {
  let targetPage: any;
  let targetPageNum: number;

  if (typeof dest === "string") {
    const refs = await pdf.getDestination(dest);
    if (!refs || refs.length === 0) {
      throw new Error(`Cannot resolve destination: ${dest}`);
    }
    const pageRef = refs[0];
    targetPageNum = await pdf.getPageIndex(pageRef);
    targetPage = await pdf.getPage(targetPageNum + 1);
  } else if (Array.isArray(dest)) {
    const pageRef = dest[0];
    targetPageNum = await pdf.getPageIndex(pageRef);
    targetPage = await pdf.getPage(targetPageNum + 1);
  } else {
    throw new Error("Invalid destination format");
  }

  const targetX = targetRect ? targetRect[0] : 50;
  const targetY = targetRect ? targetRect[1] : 0;

  const textContent = await targetPage.getTextContent();
  const lines = groupTextByLines(textContent.items);

  const thresholds = { yWindow: 50, xTolerance: 30 };
  const candidateLines = lines.filter((line) => Math.abs(line.yPosition - targetY) <= thresholds.yWindow);

  const xFilteredLines = candidateLines.filter((line) => {
    const x = line.xPosition ?? 0;
    return Math.abs(x - targetX) <= thresholds.xTolerance;
  });

  const referencePatterns = [
    { pattern: /^\s*\[\d+\]/, type: "numbered" },
    { pattern: /^\s*[A-Z][a-z]+.*?\d{4}[a-z]?\./, type: "authorYear" },
  ];

  let referenceText = "";
  let foundStart = false;
  let referenceType = "";
  let confidence = 0.5;
  let spansPages = false;

  for (const line of xFilteredLines) {
    const text = line.text.trim();
    if (!text) continue;

    const matchedPattern = referencePatterns.find(({ pattern }) => pattern.test(text));

    if (!foundStart && matchedPattern) {
      foundStart = true;
      referenceType = matchedPattern.type;
      referenceText = text;
      confidence = 0.8;
    } else if (foundStart && matchedPattern) {
      if (matchedPattern.type === referenceType) {
        break;
      } else {
        referenceText += " " + text;
      }
    } else if (foundStart) {
      referenceText += " " + text;
      if (/^\s*(Appendix|Index|Acknowledgments|Figures|Tables)\s/i.test(text)) {
        break;
      }
    }
  }

  if (!referenceText.trim()) {
    const fallbackLines = candidateLines.filter((line) => {
      const x = line.xPosition ?? 0;
      return Math.abs(x - targetX) <= thresholds.xTolerance;
    });

    referenceText = fallbackLines
      .map((line) => line.text.trim())
      .join(" ")
      .trim();
    confidence = 0.3;
    referenceType = "proximity";
  }

  const cleanedText = referenceText.replace(/\s+/g, " ").trim().substring(0, 1000);

  return {
    text: cleanedText || "(no text found)",
    method: referenceType || "proximity",
    confidence: spansPages ? confidence + 0.1 : confidence,
    spansPages,
  };
}

/**
 * POST /api/citations/extract
 * Extract citation references from uploaded PDF using a child process approach
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Save file temporarily
    const buffer = Buffer.from(await file.arrayBuffer());
    const tempPath = path.join(os.tmpdir(), `pdf-${Date.now()}.pdf`);
    const outputPath = path.join(os.tmpdir(), `citations-${Date.now()}.json`);

    fs.writeFileSync(tempPath, buffer);
    console.log(`[extractCitations] Saved PDF to: ${tempPath}`);

    try {
      // Create a standalone extraction script that avoids PDF.js worker issues
      const projectRoot = process.cwd();
      const pdfjsPath = path.join(projectRoot, 'node_modules', 'pdfjs-dist');
      
      const extractScript = `
        const fs = require('fs');
        const path = require('path');
        
        // Use absolute path to pdfjs-dist
        const pkg = require('${pdfjsPath.replace(/\\/g, '\\\\')}');
        const { getDocument, GlobalWorkerOptions } = pkg;

        // Disable workers completely for Node.js environment
        GlobalWorkerOptions.workerSrc = null;

        async function extractCitations(pdfPath, outputPath) {
          try {
            const pdf = await getDocument({
              url: pdfPath,
              useWorkerFetch: false,
              isEvalSupported: false,
              useSystemFonts: true,
            }).promise;
            
            console.log('[Extract Script] Loaded PDF with ' + pdf.numPages + ' pages');

            const citations = [];

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              const page = await pdf.getPage(pageNum);
              const annotations = await page.getAnnotations();

              for (const ann of annotations) {
                if (ann.subtype === 'Link' && ann.dest && typeof ann.dest === 'string' && ann.dest.startsWith('cite.')) {
                  try {
                    // Try to extract actual reference text
                    const textContent = await page.getTextContent();
                    const lines = textContent.items
                      .filter(item => item.str && item.str.trim())
                      .map(item => ({
                        text: item.str.trim(),
                        x: item.transform[4],
                        y: item.transform[5],
                        width: item.width || 0
                      }))
                      .sort((a, b) => b.y - a.y);

                    // Find text near the annotation
                    const annRect = ann.rect || [0, 0, 0, 0];
                    const nearbyText = lines
                      .filter(line => 
                        Math.abs(line.y - annRect[1]) < 50 && 
                        Math.abs(line.x - annRect[0]) < 100
                      )
                      .map(line => line.text)
                      .join(' ')
                      .trim();

                    citations.push({
                      id: ann.dest,
                      text: nearbyText || 'Citation ' + ann.dest,
                      confidence: nearbyText ? 0.8 : 0.5,
                      method: 'annotation',
                      spansPages: false,
                      destPage: pageNum
                    });
                  } catch (err) {
                    // Fallback to simple citation
                    citations.push({
                      id: ann.dest,
                      text: 'Citation ' + ann.dest,
                      confidence: 0.5,
                      method: 'annotation',
                      spansPages: false,
                      destPage: pageNum
                    });
                  }
                }
              }
            }

            fs.writeFileSync(outputPath, JSON.stringify({ citations, total: citations.length }, null, 2));
            console.log('[Extract Script] Extracted ' + citations.length + ' citations');
          } catch (error) {
            console.error('[Extract Script] Error:', error);
            fs.writeFileSync(outputPath, JSON.stringify({ error: error.message, citations: [] }, null, 2));
          }
        }

        extractCitations('${tempPath.replace(/\\/g, '\\\\')}', '${outputPath.replace(/\\/g, '\\\\')}');
      `;

      const wrapperPath = path.join(os.tmpdir(), `extract-wrapper-${Date.now()}.js`);
      fs.writeFileSync(wrapperPath, extractScript);

      // Execute the extraction script from the project directory
      console.log(`[extractCitations] Running extraction script...`);
      const { stdout, stderr } = await execAsync(`cd "${projectRoot}" && node "${wrapperPath}"`);

      if (stdout) console.log(`[extractCitations] stdout:`, stdout);
      if (stderr) console.error(`[extractCitations] stderr:`, stderr);

      // Read the results
      const results = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      const citations: ExtractedCitation[] = results.citations || [];

      console.log(`[extractCitations] Extracted ${citations.length} citations`);

      // Clean up temp files
      fs.unlinkSync(tempPath);
      fs.unlinkSync(outputPath);
      fs.unlinkSync(wrapperPath);

      // Save extracted citations to data directory for debugging
      const dataDir = path.join(process.cwd(), "data", "citations");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const finalOutputPath = path.join(dataDir, `${safeFileName}_${timestamp}.json`);

      const extractionData = {
        fileName: file.name,
        fileSize: file.size,
        extractedAt: new Date().toISOString(),
        totalCitations: citations.length,
        highConfidenceCount: citations.filter((c) => c.confidence > 0.7).length,
        lowConfidenceCount: citations.filter((c) => c.confidence < 0.5).length,
        byMethod: citations.reduce((acc, c) => {
          acc[c.method] = (acc[c.method] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        citations: citations,
      };

      fs.writeFileSync(finalOutputPath, JSON.stringify(extractionData, null, 2));
      console.log(`[extractCitations] Saved extraction data to: ${finalOutputPath}`);

      return NextResponse.json({
        citations,
        totalCitations: citations.length,
        highConfidenceCount: citations.filter((c) => c.confidence > 0.7).length,
        savedToFile: finalOutputPath,
      });
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      throw error;
    }
  } catch (error) {
    console.error("[extractCitations] Error:", error);
    return NextResponse.json(
      { error: "Failed to extract citations" },
      { status: 500 }
    );
  }
}