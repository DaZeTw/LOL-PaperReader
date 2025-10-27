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
  // Additional fields from extractCitationReference.js
  sourcePage?: number;
  xPosition?: number;
  yPosition?: number;
  linesProcessed?: number;
  candidatesFound?: number;
  xFilteredFound?: number;
  thresholds?: any;
  timestamp?: string;
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
      // Create a standalone extraction script that uses the exact same logic as extractCitationReference.js
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

        // === HELPER FUNCTIONS (copied from extractCitationReference.js) ===
        function groupTextByLines(textItems, yTolerance = 2, xGapThreshold = 20) {
          const lines = [];
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

          const finalLines = [];
          for (const line of lines) {
            const items = line.items.sort((a, b) => a.transform[4] - b.transform[4]);
            let currentSubline = { yPosition: line.yPosition, items: [] };

            for (let i = 0; i < items.length; i++) {
              const curr = items[i];
              const prev = items[i - 1];
              const prevXEnd = prev ? prev.transform[4] + (prev.width || 0) : null;
              const currX = curr.transform[4];
              const gap = prev ? currX - prevXEnd : 0;

              if (i > 0 && gap > xGapThreshold) {
                currentSubline.text = currentSubline.items.map((it) => it.str).join(" ").trim();
                currentSubline.xPosition = currentSubline.items[0]?.transform[4] || 0;
                finalLines.push(currentSubline);
                currentSubline = { yPosition: line.yPosition, items: [] };
              }
              currentSubline.items.push(curr);
            }

            if (currentSubline.items.length > 0) {
              currentSubline.text = currentSubline.items.map((it) => it.str).join(" ").trim();
              currentSubline.xPosition = currentSubline.items[0]?.transform[4] || 0;
              finalLines.push(currentSubline);
            }
          }

          return finalLines.sort((a, b) => b.yPosition - a.yPosition);
        }

        function calculateAdaptiveThresholds(page, lines) {
          const pageView = page.view;
          const pageWidth = pageView[2] - pageView[0];
          const pageHeight = pageView[3] - pageView[1];

          const textStats = analyzeTextMetrics(lines);
          const searchRange = Math.max(textStats.averageLineHeight * 10, pageHeight * 0.12, 60);
          const xTolerance = Math.max(textStats.averageCharWidth * 5, pageWidth * 0.03, 20);

          return {
            searchRange: Math.round(searchRange),
            xTolerance: Math.round(xTolerance),
            pageWidth,
            pageHeight,
            textStats,
          };
        }

        function analyzeTextMetrics(lines) {
          if (lines.length === 0) {
            return { averageLineHeight: 12, averageCharWidth: 6, lineSpacing: 14 };
          }

          const lineHeights = [];
          const sortedLines = lines.sort((a, b) => b.yPosition - a.yPosition);

          for (let i = 0; i < sortedLines.length - 1; i++) {
            const diff = sortedLines[i].yPosition - sortedLines[i + 1].yPosition;
            if (diff > 0 && diff < 100) {
              lineHeights.push(diff);
            }
          }

          const charWidths = [];
          lines.forEach((line) => {
            if (line.items && line.items.length > 0) {
              line.items.forEach((item) => {
                if (item.str && item.str.length > 0 && item.width) {
                  charWidths.push(item.width / item.str.length);
                }
              });
            }
          });

          const averageLineHeight = lineHeights.length > 0 ? lineHeights.reduce((a, b) => a + b, 0) / lineHeights.length : 12;
          const averageCharWidth = charWidths.length > 0 ? charWidths.reduce((a, b) => a + b, 0) / charWidths.length : 6;

          return {
            averageLineHeight: Math.max(averageLineHeight, 8),
            averageCharWidth: Math.max(averageCharWidth, 3),
            lineSpacing: averageLineHeight,
            totalLines: lines.length,
            analyzedLineHeights: lineHeights.length,
            analyzedCharWidths: charWidths.length,
          };
        }

        function extractReferenceText(lines, targetX = 0, targetY, page = null) {
          const thresholds = page ? calculateAdaptiveThresholds(page, lines) : { searchRange: 60, xTolerance: 25 };

          const candidateLines = lines.filter((line) => {
            if (line.isNextPage) {
              const nextPageLines = lines.filter((l) => l.isNextPage);
              if (nextPageLines.length === 0) return false;
              const maxNextPageY = Math.max(...nextPageLines.map((l) => l.yPosition));
              return line.yPosition >= maxNextPageY - thresholds.searchRange;
            } else {
              return line.yPosition <= targetY && line.yPosition >= targetY - thresholds.searchRange;
            }
          });

          if (candidateLines.length === 0) {
            return { text: "(no text found)", method: "none", confidence: 0, thresholds };
          }

          const xFilteredLines = candidateLines.filter((line) => {
            const x = line.xPosition ?? 0;
            return Math.abs(x - targetX) <= thresholds.xTolerance;
          });

          if (xFilteredLines.length === 0) {
            return { text: "(no text found)", method: "none", confidence: 0, thresholds };
          }

          xFilteredLines.sort((a, b) => {
            if (a.isNextPage && !b.isNextPage) return 1;
            if (!a.isNextPage && b.isNextPage) return -1;
            return b.yPosition - a.yPosition;
          });

          const referencePatterns = [
            { pattern: /^\\s*\\[(\\d+)\\]/, type: "numbered" },
            { pattern: /^\\s*[A-Z][a-z]+,\\s*[A-Z]\\..*?\\(\\d{4}\\)/, type: "author-year" },
            { pattern: /^\\s*[A-Z][a-z]+\\s+et\\s+al\\..*?\\(\\d{4}\\)/, type: "author-year" },
            { pattern: /^\\s*(?:doi:|DOI:|\\[doi\\])/i, type: "doi" },
            { pattern: /^\\s*(?:https?:|www\\.)/i, type: "url" },
            { pattern: /^\\s*arXiv:/i, type: "arxiv" },
            { pattern: /^\\s*(\\d+)\\.\\s+/, type: "numbered-dot" },
          ];

          let referenceText = "";
          let foundStart = false;
          let referenceType = null;
          let confidence = 0;
          const collectedLines = [];
          let spansPages = false;

          for (const line of xFilteredLines) {
            const text = line.text.trim();
            if (!text) continue;

            if (line.isNextPage) {
              spansPages = true;
            }

            const matchedPattern = referencePatterns.find(({ pattern }) => pattern.test(text));

            if (!foundStart && matchedPattern) {
              foundStart = true;
              referenceType = matchedPattern.type;
              referenceText = text;
              confidence = 0.8;
              collectedLines.push(line);
            } else if (foundStart && matchedPattern) {
              if (matchedPattern.type === referenceType) {
                break;
              } else {
                referenceText += " " + text;
                collectedLines.push(line);
              }
            } else if (foundStart) {
              referenceText += " " + text;
              collectedLines.push(line);

              if (/^\\s*(Appendix|Index|Acknowledgments|Figures|Tables)\\s/i.test(text)) {
                break;
              }
            }
          }

          if (!referenceText.trim()) {
            const fallbackLines = candidateLines.filter((line) => {
              const x = line.xPosition ?? 0;
              return Math.abs(x - targetX) <= thresholds.xTolerance;
            });

            referenceText = fallbackLines.map((line) => line.text.trim()).join(" ").trim();
            confidence = 0.3;
            referenceType = "proximity";
            collectedLines.push(...fallbackLines);
          }

          const cleanedText = referenceText.replace(/\\s+/g, " ").replace(/[\\u00A0\\u2000-\\u200B\\u2028\\u2029]/g, " ").trim().substring(0, 1000);

          return {
            text: cleanedText || "(no text found)",
            method: referenceType || "proximity",
            confidence: spansPages ? confidence + 0.1 : confidence,
            linesUsed: collectedLines.length,
            spansPages,
            thresholds,
            candidatesFound: candidateLines.length,
            xFilteredFound: xFilteredLines.length,
          };
        }

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

            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const annotations = await page.getAnnotations();

              for (const ann of annotations) {
                if (ann.subtype === 'Link' && typeof ann.dest === 'string' && ann.dest.startsWith('cite.')) {
                  const destName = ann.dest;
                  try {
                    const dest = await pdf.getDestination(destName);
                    if (!dest) continue;

                    const pageIndex = await pdf.getPageIndex(dest[0]);
                    const targetPage = await pdf.getPage(pageIndex + 1);
                    const targetX = dest[2] ?? 0;
                    const targetY = dest[3] ?? 0;

                    const textContent = await targetPage.getTextContent();
                    const lines = groupTextByLines(textContent.items);

                    let allLines = [...lines];
                    let nextPageLines = [];
                    let spansPages = false;

                    const pageHeight = targetPage.view[3] - targetPage.view[1] || 792;
                    const distanceFromBottom = targetY;

                    if (distanceFromBottom < 100 && pageIndex + 2 <= pdf.numPages) {
                      try {
                        const nextPage = await pdf.getPage(pageIndex + 2);
                        const nextTextContent = await nextPage.getTextContent();
                        nextPageLines = groupTextByLines(nextTextContent.items);

                        nextPageLines = nextPageLines.map((line) => ({
                          ...line,
                          yPosition: line.yPosition - pageHeight,
                          isNextPage: true,
                        }));

                        allLines = [...lines, ...nextPageLines];
                        spansPages = true;
                        console.log('🚩 Including next page for citation ' + destName + ' spanning pages ' + (pageIndex + 1) + '-' + (pageIndex + 2));
                      } catch (err) {
                        console.warn('⚠️ Could not load next page for multi-page citation: ' + err.message);
                      }
                    }

                    const extractionResult = extractReferenceText(allLines, targetX, targetY, targetPage);

                    citations.push({
                      citationId: destName,
                      sourcePage: i,
                      targetPage: pageIndex + 1,
                      spansPages: extractionResult.spansPages || spansPages,
                      xPosition: targetX,
                      yPosition: targetY,
                      referenceText: extractionResult.text,
                      extractionMethod: extractionResult.method,
                      confidence: extractionResult.confidence,
                      linesProcessed: extractionResult.linesUsed,
                      candidatesFound: extractionResult.candidatesFound,
                      xFilteredFound: extractionResult.xFilteredFound,
                      thresholds: extractionResult.thresholds,
                      timestamp: new Date().toISOString(),
                    });

                    console.log('✅ Extracted citation ' + destName + ' (' + extractionResult.method + ', confidence: ' + extractionResult.confidence + (spansPages ? ', spans pages' : '') + '): ' + extractionResult.text.substring(0, 100) + '...');
                  } catch (err) {
                    console.warn('⚠️ Could not resolve destination ' + ann.dest + ':', err.message);
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
      const rawCitations = results.citations || [];

      console.log(`[extractCitations] Extracted ${rawCitations.length} citations`);

      // Map the results to match the exact format from extractCitationReference.js
      const citations: ExtractedCitation[] = rawCitations.map((citation: any) => ({
        id: citation.citationId,
        text: citation.referenceText,
        confidence: citation.confidence,
        method: citation.extractionMethod,
        spansPages: citation.spansPages,
        destPage: citation.targetPage,
        // Include additional metadata from the original script
        sourcePage: citation.sourcePage,
        xPosition: citation.xPosition,
        yPosition: citation.yPosition,
        linesProcessed: citation.linesProcessed,
        candidatesFound: citation.candidatesFound,
        xFilteredFound: citation.xFilteredFound,
        thresholds: citation.thresholds,
        timestamp: citation.timestamp,
      }));

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

      // Generate extraction summary exactly like extractCitationReference.js
      const methodCounts: Record<string, number> = {};
      let totalConfidence = 0;
      let highConfidenceCount = 0;

      citations.forEach((citation) => {
        const method = citation.method || "unknown";
        methodCounts[method] = (methodCounts[method] || 0) + 1;
        totalConfidence += citation.confidence || 0;
        if (citation.confidence > 0.7) {
          highConfidenceCount++;
        }
      });

      const extractionData = {
        fileName: file.name,
        fileSize: file.size,
        extractedAt: new Date().toISOString(),
        totalCitations: citations.length,
        byMethod: methodCounts,
        averageConfidence: citations.length > 0 ? totalConfidence / citations.length : 0,
        highConfidenceCount,
        lowConfidenceCount: citations.filter((c) => (c.confidence || 0) < 0.5).length,
        multiPageCitations: citations.filter((c) => c.spansPages).length,
        citations: citations,
      };

      fs.writeFileSync(finalOutputPath, JSON.stringify(extractionData, null, 2));
      console.log(`[extractCitations] Saved extraction data to: ${finalOutputPath}`);

      return NextResponse.json({
        citations,
        totalCitations: citations.length,
        byMethod: methodCounts,
        averageConfidence: extractionData.averageConfidence,
        highConfidenceCount,
        lowConfidenceCount: extractionData.lowConfidenceCount,
        multiPageCitations: extractionData.multiPageCitations,
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