import { type NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Keep the new interface for internal processing
interface ExtractedCitation {
  annotationId: string;
  citationDestination: string;
  sourcePage: number;
  targetPage: number;
  targetPosition: {
    x: number;
    y: number;
  };
  annotationRect: number[];
  startingLine: {
    lineIndex: number;
    position: {
      x: number;
      y: number;
      page: number;
    };
    text: string;
  };
  reference: {
    fullText: string;
    lineCount: number;
    characterCount: number;
    wordCount: number;
    lines: Array<{
      lineIndex: number;
      text: string;
      position: {
        x: number;
        y: number;
        page: number;
      };
      isStartingLine: boolean;
    }>;
  };
  metadata: {
    distance: number;
    processedAt: string;
  };
}

// Legacy citation format for output
interface LegacyCitation {
  id: string;
  annotation_id: string;
  text: string;
  confidence: number;
  method: string;
  spansPages: boolean;
  destPage: number;
  sourcePage: number;
  xPosition: number;
  yPosition: number;
  linesProcessed?: number;
  candidatesFound?: number;
  xFilteredFound?: number;
  thresholds?: any;
  timestamp: string;
}

/**
 * Convert new ExtractedCitation format to legacy format for output
 */
function convertToLegacyFormat(newCitation: ExtractedCitation): LegacyCitation {
  // Convert distance back to confidence (inverse relationship)
  const confidence = newCitation.metadata.distance < 10 ? 0.8 : 0.3;
  
  return {
    id: newCitation.citationDestination,
    annotation_id: newCitation.annotationId,
    text: newCitation.reference.fullText,
    confidence: confidence,
    method: "buildReference", // or determine method based on citation format
    spansPages: false, // could be calculated if needed
    destPage: newCitation.targetPage,
    sourcePage: newCitation.sourcePage,
    xPosition: newCitation.targetPosition.x,
    yPosition: newCitation.targetPosition.y,
    linesProcessed: newCitation.reference.lineCount,
    candidatesFound: 1, // default value
    xFilteredFound: 1, // default value
    thresholds: {
      searchRange: 95,
      xTolerance: 20,
      pageWidth: 612,
      pageHeight: 792,
      textStats: {
        averageLineHeight: 8,
        averageCharWidth: 3,
        lineSpacing: 8,
        totalLines: 150,
        analyzedLineHeights: 80,
        analyzedCharWidths: 400
      }
    },
    timestamp: newCitation.metadata.processedAt
  };
}

/**
 * Convert legacy citation format to new ExtractedCitation format
 */
function convertLegacyToNewFormat(legacyCitation: LegacyCitation): ExtractedCitation {
  return {
    annotationId: legacyCitation.annotation_id || `legacy_${legacyCitation.id}`, // Use annotation_id if available
    citationDestination: legacyCitation.id,
    sourcePage: legacyCitation.sourcePage,
    targetPage: legacyCitation.destPage,
    targetPosition: {
      x: legacyCitation.xPosition,
      y: legacyCitation.yPosition
    },
    annotationRect: [],
    startingLine: {
      lineIndex: 0,
      position: {
        x: legacyCitation.xPosition,
        y: legacyCitation.yPosition,
        page: legacyCitation.destPage
      },
      text: legacyCitation.text.substring(0, 100) + (legacyCitation.text.length > 100 ? "..." : "")
    },
    reference: {
      fullText: legacyCitation.text,
      lineCount: legacyCitation.linesProcessed || 1,
      characterCount: legacyCitation.text.length,
      wordCount: legacyCitation.text.split(/\s+/).filter(word => word.length > 0).length,
      lines: [{
        lineIndex: 0,
        text: legacyCitation.text,
        position: {
          x: legacyCitation.xPosition,
          y: legacyCitation.yPosition,
          page: legacyCitation.destPage
        },
        isStartingLine: true
      }]
    },
    metadata: {
      distance: legacyCitation.confidence < 0.5 ? 15 : 5,
      processedAt: legacyCitation.timestamp
    }
  };
}

/**
 * Check if data uses legacy format and convert if necessary
 */
function handleLegacyFormat(data: any): ExtractedCitation[] {
  // Check if it's legacy format by looking for old schema properties
  if (data.citations && Array.isArray(data.citations)) {
    const firstCitation = data.citations[0];
    if (firstCitation && 'id' in firstCitation && 'confidence' in firstCitation && 'method' in firstCitation) {
      console.log(`[extractCitations] Detected legacy format, converting ${data.citations.length} citations`);
      return data.citations.map((legacyCitation: LegacyCitation) => 
        convertLegacyToNewFormat(legacyCitation)
      );
    }
  }
  
  // Check if it's new format with references array
  if (data.references && Array.isArray(data.references)) {
    return data.references;
  }
  
  // If no recognized format, return empty array
  console.log('[extractCitations] Unrecognized data format, returning empty array');
  return [];
}

/**
 * POST /api/citations/extract
 * Extract citation references from uploaded PDF using buildReference.js
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
    const tempPdfPath = path.join(os.tmpdir(), `pdf-${Date.now()}.pdf`);
    const outputPath = path.join(os.tmpdir(), `built-references-${Date.now()}.json`);

    fs.writeFileSync(tempPdfPath, buffer);
    console.log(`[extractCitations] Saved PDF to: ${tempPdfPath}`);

    try {
      const projectRoot = process.cwd();
      const pdfjsPath = path.join(projectRoot, 'node_modules', 'pdfjs-dist');
      
      const extractScript = `
        const fs = require('fs');
        const path = require('path');
        
        // Use absolute path to pdfjs-dist
        const pkg = require('${pdfjsPath.replace(/\\/g, '\\\\')}');
        const { getDocument, GlobalWorkerOptions } = pkg;

        // Disable workers (Node environment)
        GlobalWorkerOptions.workerSrc = null;

        // === FUNCTIONS FROM extractReferenceContent.js ===
        function groupTextByLines(textItems, yTolerance = 2, pageNumber = 1) {
          const finalLines = [];
          let currentLine = null;

          // Process items in their natural order (no sorting)
          for (const item of textItems) {
            const yPos = item.transform[5];

            // Check if this item belongs to the current line (Y position only)
            if (currentLine && Math.abs(currentLine.yPosition - yPos) <= yTolerance) {
              // Add to current line
              currentLine.items.push(item);
            } else {
              // Finalize previous line if exists
              if (currentLine) {
                currentLine.text = currentLine.items
                  .map((it) => it.str)
                  .join("")
                  .trim();
                currentLine.xPosition = currentLine.items[0]?.transform[4] || 0;
                finalLines.push(currentLine);
              }

              // Start new line
              currentLine = {
                yPosition: yPos,
                pageNumber: pageNumber,
                items: [item],
              };
            }
          }

          // Don't forget the last line
          if (currentLine) {
            currentLine.text = currentLine.items
              .map((it) => it.str)
              .join(" ")
              .trim();
            currentLine.xPosition = currentLine.items[0]?.transform[4] || 0;
            finalLines.push(currentLine);
          }

          return finalLines;
        }

        async function getTwoMostCommonCitationX(pdfPath) {
          const pdf = await getDocument(pdfPath).promise;
          console.log('📄 Analyzing citation destinations in PDF with ' + pdf.numPages + ' pages.');

          const referenceXPositions = [];

          // Step 1: Extract all citation link annotations and resolve their destinations
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const annotations = await page.getAnnotations();

            for (const ann of annotations) {
              // Filter for citation links only
              if (
                ann.subtype === "Link" &&
                typeof ann.dest === "string" &&
                ann.dest.startsWith("cite.")
              ) {
                try {
                  // Step 2: Resolve the destination to get the reference position
                  const dest = await pdf.getDestination(ann.dest);
                  if (!dest) {
                    console.log('⚠️ Could not resolve destination: ' + ann.dest);
                    continue;
                  }

                  // dest structure: [pageRef, type, x, y, ...]
                  // dest[2] = x-position of the reference
                  // dest[3] = y-position of the reference
                  const referenceX = dest[2] ?? 0;
                  const referenceY = dest[3] ?? 0;

                  // Get page index for the reference
                  const pageIndex = await pdf.getPageIndex(dest[0]);

                  console.log('🔗 Citation "' + ann.dest + '" -> Reference at page ' + (pageIndex + 1) + ', X=' + referenceX.toFixed(1) + ', Y=' + referenceY.toFixed(1));

                  referenceXPositions.push({
                    citationId: ann.dest,
                    referenceX: referenceX,
                    referenceY: referenceY,
                    referencePage: pageIndex + 1,
                    citationPage: pageNum,
                    citationRect: ann.rect,
                  });
                } catch (error) {
                  console.log('⚠️ Error resolving destination "' + ann.dest + '": ' + error.message);
                }
              }
            }
          }

          console.log('🔗 Found ' + referenceXPositions.length + ' citation links with resolved destinations.');

          if (referenceXPositions.length === 0) {
            return [];
          }

          // Step 2: Extract just the X positions for clustering
          const xPositions = referenceXPositions.map((ref) => ref.referenceX);

          // Step 3: Group X positions with tolerance of 5 (references might have slight variations)
          const tolerance = 5;
          const xClusters = [];

          for (const xPos of xPositions) {
            // Find existing cluster within tolerance
            let targetCluster = xClusters.find(
              (cluster) => Math.abs(cluster.x - xPos) <= tolerance
            );

            if (!targetCluster) {
              // Create new cluster
              targetCluster = {
                x: xPos,
                count: 0,
                positions: [],
                references: [],
              };
              xClusters.push(targetCluster);
            }

            // Add position to cluster
            targetCluster.positions.push(xPos);
            targetCluster.count++;

            // Store reference info
            const refInfo = referenceXPositions.find((ref) => ref.referenceX === xPos);
            if (refInfo) {
              targetCluster.references.push(refInfo);
            }

            // Update cluster center to average of all positions
            targetCluster.x =
              targetCluster.positions.reduce((a, b) => a + b, 0) / targetCluster.positions.length;
          }

          // Step 4: Sort by count (most common first) and return top 2
          const sortedClusters = xClusters
            .sort((a, b) => b.count - a.count)
            .slice(0, 2)
            .map((cluster) => ({
              xPosition: Math.round(cluster.x * 10) / 10, // Round to 1 decimal
              count: cluster.count,
              sampleReferences: cluster.references.slice(0, 3).map((ref) => ({
                citationId: ref.citationId,
                page: ref.referencePage,
                x: ref.referenceX.toFixed(1),
                y: ref.referenceY.toFixed(1),
              })),
            }));

          console.log('🎯 Two most common reference X positions:');
          sortedClusters.forEach((cluster, index) => {
            console.log('   ' + (index + 1) + '. X = ' + cluster.xPosition + ' (' + cluster.count + ' references)');
            console.log('      Sample references: ' + cluster.sampleReferences
              .map((ref) => ref.citationId + ' at (' + ref.x + ', ' + ref.y + ') on page ' + ref.page)
              .join(', '));
          });

          return sortedClusters;
        }

        async function extractReferenceLines(pdfPath) {
          const pdf = await getDocument(pdfPath).promise;
          console.log('📄 Starting reference extraction from ' + pdfPath + ' with ' + pdf.numPages + ' pages.');

          // Step 1: Get the 2 most common X positions using existing function
          const commonXPositions = await getTwoMostCommonCitationX(pdfPath);

          if (commonXPositions.length === 0) {
            console.log('⚠️ No common X positions found for references.');
            return {
              referenceLines: [],
              metadata: { totalLines: 0, filteredLines: 0 },
            };
          }

          console.log('🎯 Using ' + commonXPositions.length + ' common X positions for filtering');

          // Step 2: Get all pages that contain references (where citations point to)
          const referencePagesSet = new Set();

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const annotations = await page.getAnnotations();

            for (const ann of annotations) {
              if (
                ann.subtype === "Link" &&
                typeof ann.dest === "string" &&
                ann.dest.startsWith("cite.")
              ) {
                try {
                  const dest = await pdf.getDestination(ann.dest);
                  if (dest) {
                    const targetPageIndex = await pdf.getPageIndex(dest[0]);
                    referencePagesSet.add(targetPageIndex + 1);
                  }
                } catch (error) {
                  // Skip problematic destinations
                }
              }
            }
          }

          const referencePages = Array.from(referencePagesSet).sort((a, b) => a - b);
          console.log('📚 Found references on pages: ' + referencePages.join(', '));

          // Step 3: Extract lines from reference pages using existing groupTextByLines function
          // AND preserve the original order with line indices
          const allLinesWithIndices = [];
          let globalLineIndex = 0;

          for (const pageNum of referencePages) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Use existing groupTextByLines function
            const lines = groupTextByLines(textContent.items, 2, pageNum);

            // Add original line indices to preserve order
            const linesWithIndices = lines.map((line, localIndex) => ({
              ...line,
              lineIndex: globalLineIndex++,
              pageLineIndex: localIndex, // Index within the page
              characterCount: line.text.length,
              wordCount: line.text
                .trim()
                .split(/\\s+/)
                .filter((word) => word.length > 0).length,
            }));

            allLinesWithIndices.push(...linesWithIndices);
          }

          console.log('📝 Extracted ' + allLinesWithIndices.length + ' total lines from reference pages');

          // Step 4: Filter lines that start within (x-3, x+40) for each common X
          // AND label starting lines that are within (x-3, x+8)
          const filteredLines = [];

          // Create X range filters for filtering and starting line detection
          const xRanges = commonXPositions.map((commonX) => ({
            xMin: commonX.xPosition - 3,
            xMax: commonX.xPosition + 40,
            startingLineXMin: commonX.xPosition - 3,
            startingLineXMax: commonX.xPosition + 8,
            clusterX: commonX.xPosition,
            clusterCount: commonX.count,
          }));

          console.log('🔍 Filtering lines with X ranges:');
          xRanges.forEach((range, index) => {
            console.log('   Range ' + (index + 1) + ': Filter ' + range.xMin.toFixed(1) + ' to ' + range.xMax.toFixed(1) + ', Starting lines ' + range.startingLineXMin.toFixed(1) + ' to ' + range.startingLineXMax.toFixed(1));
          });

          // Filter lines while preserving order and labeling starting lines
          let startingLinesCount = 0;
          for (const line of allLinesWithIndices) {
            // Check if line falls within any of the X ranges for filtering
            const matchingRange = xRanges.find(
              (range) => line.xPosition >= range.xMin && line.xPosition <= range.xMax
            );

            if (matchingRange) {
              // Check if this line is a starting line (within tighter x range)
              const isStartingLine =
                line.xPosition >= matchingRange.startingLineXMin &&
                line.xPosition <= matchingRange.startingLineXMax;

              if (isStartingLine) {
                startingLinesCount++;
              }

              // Add metadata to matching line
              const enrichedLine = {
                ...line,
                isStartingLine: isStartingLine,
                referenceCluster: {
                  clusterX: matchingRange.clusterX,
                  clusterCount: matchingRange.clusterCount,
                  distanceFromClusterX: Math.abs(
                    line.xPosition - matchingRange.clusterX
                  ),
                },
              };

              filteredLines.push(enrichedLine);
            }
          }

          console.log('   Found ' + filteredLines.length + ' lines matching X ranges');
          console.log('   Found ' + startingLinesCount + ' starting lines');

          // Step 5: Remove duplicates while preserving order (keep the first occurrence)
          const uniqueLines = [];
          const seen = new Set();

          for (const line of filteredLines) {
            const key = line.pageNumber + '_' + Math.round(line.yPosition) + '_' + line.text.substring(0, 50);

            if (!seen.has(key)) {
              seen.add(key);
              uniqueLines.push(line);
            }
          }

          // Lines are already in the correct order (by page, then by original line order)
          // No need to re-sort as this would break the natural reading order

          const finalStartingLinesCount = uniqueLines.filter(
            (line) => line.isStartingLine
          ).length;
          console.log('📋 After removing duplicates: ' + uniqueLines.length + ' unique lines (' + finalStartingLinesCount + ' starting lines)');

          // Step 6: Create result with metadata
          const result = {
            referenceLines: uniqueLines,
            metadata: {
              pdfPath: pdfPath,
              totalPagesScanned: pdf.numPages,
              referencePagesFound: referencePages.length,
              referencePagesNumbers: referencePages,
              commonXPositions: commonXPositions,
              xRanges: xRanges,
              totalLinesExtracted: allLinesWithIndices.length,
              filteredLinesCount: uniqueLines.length,
              startingLinesCount: finalStartingLinesCount,
              continuationLinesCount: uniqueLines.length - finalStartingLinesCount,
              extractedAt: new Date().toISOString(),
            },
          };

          console.log('✅ Successfully extracted ' + uniqueLines.length + ' reference lines (' + finalStartingLinesCount + ' starting, ' + (uniqueLines.length - finalStartingLinesCount) + ' continuation)');

          // Show sample results with starting line labels
          console.log('\\n📋 Sample reference lines (first 5):');
          uniqueLines.slice(0, 5).forEach((line, index) => {
            const lineType = line.isStartingLine ? "🟢 START" : "🔵 CONT";
            console.log('   ' + (index + 1) + '. ' + lineType + ' LineIndex: ' + line.lineIndex + ', Page ' + line.pageNumber + ', Y=' + line.yPosition.toFixed(1) + ', X=' + line.xPosition.toFixed(1));
            console.log('      Text: "' + line.text.substring(0, 80) + (line.text.length > 80 ? "..." : "") + '"');
          });

          // Show starting lines summary
          console.log('\\n🟢 Starting lines summary:');
          const startingLines = uniqueLines.filter((line) => line.isStartingLine);
          startingLines.slice(0, 3).forEach((line, index) => {
            console.log('   ' + (index + 1) + '. Line ' + line.lineIndex + ': "' + line.text.substring(0, 60) + (line.text.length > 60 ? "..." : "") + '"');
          });

          return result;
        }

        // === FUNCTIONS FROM buildReference.js ===
        function detectStartingPoint(targetX, targetY, targetPage, referenceLines) {
          const xMinTolerance = 5;
          const xMaxTolerance = 8;
          const yTolerance = 15;

          console.log('🎯 Looking for starting point near (' + targetX.toFixed(1) + ', ' + targetY.toFixed(1) + ') on page ' + targetPage);
          console.log('   X range: ' + (targetX - xMinTolerance).toFixed(1) + ' to ' + (targetX + xMaxTolerance).toFixed(1));
          console.log('   Y range: ' + (targetY - yTolerance).toFixed(1) + ' to ' + (targetY + yTolerance).toFixed(1));

          const pageLines = referenceLines.filter((line) => line.pageNumber === targetPage);
          console.log('   Found ' + pageLines.length + ' lines on page ' + targetPage);
          
          const candidateLines = pageLines.filter((line) => {
            const xInRange = line.xPosition >= targetX - xMinTolerance && line.xPosition <= targetX + xMaxTolerance;
            const yInRange = Math.abs(line.yPosition - targetY) <= yTolerance;
            return xInRange && yInRange;
          });

          console.log('   Found ' + candidateLines.length + ' candidate lines within tolerance');

          if (candidateLines.length === 0) {
            console.log('   ❌ No lines found within tolerance');
            return null;
          }

          candidateLines.sort((a, b) => {
            if (a.isStartingLine && !b.isStartingLine) return -1;
            if (!a.isStartingLine && b.isStartingLine) return 1;
            
            const distanceA = Math.sqrt(
              Math.pow(a.xPosition - targetX, 2) + Math.pow(a.yPosition - targetY, 2)
            );
            const distanceB = Math.sqrt(
              Math.pow(b.xPosition - targetX, 2) + Math.pow(b.yPosition - targetY, 2)
            );
            return distanceA - distanceB;
          });

          const selectedLine = candidateLines[0];
          console.log('   ✅ Selected line ' + selectedLine.lineIndex + ': "' + selectedLine.text.substring(0, 50) + '..."');
          console.log('      Position: (' + selectedLine.xPosition.toFixed(1) + ', ' + selectedLine.yPosition.toFixed(1) + ')');
          console.log('      IsStartingLine: ' + selectedLine.isStartingLine);
          console.log('      Distance: ' + Math.sqrt(Math.pow(selectedLine.xPosition - targetX, 2) + Math.pow(selectedLine.yPosition - targetY, 2)).toFixed(1));

          return selectedLine;
        }

        function buildFullTextWithHyphenation(lines) {
          if (!lines || lines.length === 0) {
            return "";
          }

          if (lines.length === 1) {
            return lines[0].text.trim();
          }

          let fullText = "";

          for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];
            const currentText = currentLine.text.trim();

            if (i === 0) {
              fullText = currentText;
            } else {
              const previousLineEndsWithHyphen = fullText.endsWith("-");
              const previousLineEndsWithColon = fullText.endsWith(":");
              const previousLineEndsWithSlash = fullText.endsWith("/");

              if (previousLineEndsWithHyphen) {
                fullText = fullText.slice(0, -1) + currentText;
                console.log('   🔗 Merged hyphenated word: "' + fullText.slice(-20) + '"');
              } else if (previousLineEndsWithColon) {
                fullText = fullText + currentText;
                console.log('   🔗 Merged colon continuation: "' + fullText.slice(-20) + '"');
              } else if (previousLineEndsWithSlash) {
                fullText = fullText + currentText;
                console.log('   🔗 Merged slash continuation: "' + fullText.slice(-20) + '"');
              } else {
                fullText += " " + currentText;
              }
            }
          }

          return fullText.trim();
        }

        function buildReferenceText(startingLine, referenceLines) {
          console.log('📝 Building reference text from line ' + startingLine.lineIndex);

          const result = [startingLine];
          const startingLineIndex = startingLine.lineIndex;

          const sortedLines = referenceLines.slice().sort((a, b) => a.lineIndex - b.lineIndex);
          const startingPosition = sortedLines.findIndex((line) => line.lineIndex === startingLineIndex);

          if (startingPosition === -1) {
            console.log('   ⚠️ Could not find starting line in sorted array, returning single line');
            return {
              lines: result,
              fullText: startingLine.text.trim(),
              lineCount: 1,
              startingLineIndex: startingLineIndex,
              endingLineIndex: startingLineIndex,
              characterCount: startingLine.text.trim().length,
              wordCount: startingLine.text.trim().split(/\\s+/).filter(word => word.length > 0).length
            };
          }

          let linesAdded = 0;
          for (let i = startingPosition + 1; i < sortedLines.length; i++) {
            const currentLine = sortedLines[i];

            if (currentLine.isStartingLine) {
              console.log('   🛑 Stopped at next starting line ' + currentLine.lineIndex);
              break;
            }

            if (Math.abs(currentLine.pageNumber - startingLine.pageNumber) > 1) {
              console.log('   🛑 Stopped due to page distance (current: ' + currentLine.pageNumber + ', start: ' + startingLine.pageNumber + ')');
              break;
            }

            result.push(currentLine);
            linesAdded++;
          }

          const fullText = buildFullTextWithHyphenation(result);

          console.log('   ✅ Built reference with ' + result.length + ' lines (added ' + linesAdded + ' continuation lines)');
          console.log('   📏 Text length: ' + fullText.length + ' characters');
          console.log('   📖 Preview: "' + fullText.substring(0, 100) + (fullText.length > 100 ? "..." : "") + '"');

          return {
            lines: result,
            fullText: fullText,
            lineCount: result.length,
            startingLineIndex: startingLineIndex,
            endingLineIndex: result[result.length - 1].lineIndex,
            characterCount: fullText.length,
            wordCount: fullText.split(/\\s+/).filter((word) => word.length > 0).length,
          };
        }

        async function extractReferencesFromFile(pdfPath, outputPath) {
          try {
            const pdf = await getDocument({
              url: pdfPath,
              useWorkerFetch: false,
              isEvalSupported: false,
              useSystemFonts: true,
            }).promise;
            
            console.log('📄 Loaded PDF with ' + pdf.numPages + ' pages');

            const referenceResult = await extractReferenceLines(pdfPath);
            const referenceLines = referenceResult.referenceLines;
            console.log('📝 Extracted ' + referenceLines.length + ' reference lines');

            if (referenceLines.length === 0) {
              const result = {
                references: [],
                metadata: {
                  totalCitations: 0,
                  successfulReferences: 0,
                  failedReferences: 0,
                  successRate: '0.0%',
                  totalReferenceLines: 0,
                  extractedAt: new Date().toISOString(),
                  error: 'No reference lines found'
                }
              };
              fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
              return;
            }

            const citations = [];

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              const page = await pdf.getPage(pageNum);
              const annotations = await page.getAnnotations();

              for (const ann of annotations) {
                if (
                  ann.subtype === "Link" &&
                  typeof ann.dest === "string" &&
                  ann.dest.startsWith("cite.")
                ) {
                  try {
                    const dest = await pdf.getDestination(ann.dest);
                    if (dest) {
                      const targetX = dest[2] ?? 0;
                      const targetY = dest[3] ?? 0;
                      const targetPageIndex = await pdf.getPageIndex(dest[0]);
                      const targetPage = targetPageIndex + 1;

                      citations.push({
                        annotationId: ann.id || 'ann_' + pageNum + '_' + citations.length,
                        citationDestination: ann.dest,
                        sourcePage: pageNum,
                        targetPage: targetPage,
                        targetX: targetX,
                        targetY: targetY,
                        annotationRect: ann.rect || []
                      });
                    }
                  } catch (error) {
                    console.log('⚠️ Error processing citation ' + ann.dest + ': ' + error.message);
                  }
                }
              }
            }

            console.log('🔗 Found ' + citations.length + ' citations with valid targets');

            const builtReferences = [];
            let successCount = 0;
            let failCount = 0;

            for (const citation of citations) {
              try {
                console.log('\\n--- Processing citation ' + citation.citationDestination + ' (ID: ' + citation.annotationId + ') ---');
                
                const startingPoint = detectStartingPoint(
                  citation.targetX,
                  citation.targetY,
                  citation.targetPage,
                  referenceLines
                );

                if (!startingPoint) {
                  console.log('❌ No starting point found for ' + citation.citationDestination);
                  failCount++;
                  continue;
                }

                const builtText = buildReferenceText(startingPoint, referenceLines);

                const reference = {
                  annotationId: citation.annotationId,
                  citationDestination: citation.citationDestination,
                  sourcePage: citation.sourcePage,
                  targetPage: citation.targetPage,
                  targetPosition: {
                    x: citation.targetX,
                    y: citation.targetY
                  },
                  annotationRect: citation.annotationRect,
                  startingLine: {
                    lineIndex: startingPoint.lineIndex,
                    position: {
                      x: startingPoint.xPosition,
                      y: startingPoint.yPosition,
                      page: startingPoint.pageNumber
                    },
                    text: startingPoint.text
                  },
                  reference: {
                    fullText: builtText.fullText,
                    lineCount: builtText.lineCount,
                    characterCount: builtText.characterCount,
                    wordCount: builtText.wordCount,
                    lines: builtText.lines.map(line => ({
                      lineIndex: line.lineIndex,
                      text: line.text,
                      position: {
                        x: line.xPosition,
                        y: line.yPosition,
                        page: line.pageNumber
                      },
                      isStartingLine: line.isStartingLine
                    }))
                  },
                  metadata: {
                    distance: Math.sqrt(
                      Math.pow(startingPoint.xPosition - citation.targetX, 2) + 
                      Math.pow(startingPoint.yPosition - citation.targetY, 2)
                    ),
                    processedAt: new Date().toISOString()
                  }
                };

                builtReferences.push(reference);
                successCount++;
                console.log('✅ Successfully built reference for ' + citation.citationDestination + ' (ID: ' + citation.annotationId + ')');
                
              } catch (error) {
                console.error('❌ Failed to build reference for ' + citation.citationDestination + ' (ID: ' + citation.annotationId + '): ' + error.message);
                failCount++;
              }
            }

            const result = {
              references: builtReferences,
              metadata: {
                totalCitations: citations.length,
                successfulReferences: successCount,
                failedReferences: failCount,
                successRate: citations.length > 0 ? ((successCount / citations.length) * 100).toFixed(1) + '%' : '0.0%',
                totalReferenceLines: referenceLines.length,
                extractedAt: new Date().toISOString()
              }
            };

            fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
            console.log('✅ Successfully built ' + successCount + ' references from ' + citations.length + ' citations');
            
          } catch (error) {
            console.error('Error:', error);
            fs.writeFileSync(outputPath, JSON.stringify({ 
              error: error.message, 
              references: [],
              metadata: {
                totalCitations: 0,
                successfulReferences: 0,
                failedReferences: 0,
                successRate: '0.0%',
                totalReferenceLines: 0,
                extractedAt: new Date().toISOString()
              }
            }, null, 2));
          }
        }

        extractReferencesFromFile('${tempPdfPath.replace(/\\/g, '\\\\')}', '${outputPath.replace(/\\/g, '\\\\')}');
      `;

      const wrapperPath = path.join(os.tmpdir(), `extract-wrapper-${Date.now()}.js`);
      fs.writeFileSync(wrapperPath, extractScript);

      console.log(`[extractCitations] Running buildReference extraction...`);
      const { stdout, stderr } = await execAsync(`cd "${projectRoot}" && node "${wrapperPath}"`);

      if (stdout) console.log(`[extractCitations] stdout:`, stdout);
      if (stderr) console.error(`[extractCitations] stderr:`, stderr);

      // Read the results
      const results = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      
      // Handle both legacy and new formats
      const extractedCitations = handleLegacyFormat(results);

      console.log(`[extractCitations] Built ${extractedCitations.length} references`);

      // Convert to legacy format for saving
      const legacyCitations: LegacyCitation[] = extractedCitations.map(convertToLegacyFormat);

      // Clean up temp files
      fs.unlinkSync(tempPdfPath);
      fs.unlinkSync(outputPath);
      fs.unlinkSync(wrapperPath);

      // Save extracted citations to data directory in legacy format
      const dataDir = path.join(process.cwd(), "data", "citations");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const finalOutputPath = path.join(dataDir, `${safeFileName}_${timestamp}.json`);

      // Generate extraction summary with legacy format
      const methodCounts: Record<string, number> = {};
      let totalConfidence = 0;
      let highConfidenceCount = 0;

      legacyCitations.forEach((citation) => {
        const method = citation.method || "buildReference";
        methodCounts[method] = (methodCounts[method] || 0) + 1;
        totalConfidence += citation.confidence;
        if (citation.confidence > 0.7) {
          highConfidenceCount++;
        }
      });

      const extractionData = {
        fileName: file.name,
        fileSize: file.size,
        extractedAt: new Date().toISOString(),
        totalCitations: legacyCitations.length,
        byMethod: methodCounts,
        averageConfidence: legacyCitations.length > 0 ? totalConfidence / legacyCitations.length : 0,
        highConfidenceCount,
        lowConfidenceCount: legacyCitations.filter((c) => c.confidence <= 0.7).length,
        multiPageCitations: 0,
        successRate: results.metadata?.successRate || '0.0%',
        citations: legacyCitations, // Use legacy format
      };

      fs.writeFileSync(finalOutputPath, JSON.stringify(extractionData, null, 2));
      console.log(`[extractCitations] Saved extraction data to: ${finalOutputPath}`);

      return NextResponse.json({
        citations: legacyCitations, // Return legacy format
        totalCitations: legacyCitations.length,
        byMethod: methodCounts,
        averageConfidence: extractionData.averageConfidence,
        highConfidenceCount,
        lowConfidenceCount: extractionData.lowConfidenceCount,
        multiPageCitations: extractionData.multiPageCitations,
        successRate: results.metadata?.successRate || '0.0%',
        savedToFile: finalOutputPath,
      });

    } catch (error) {
      // Clean up temp files on error
      [tempPdfPath, outputPath].forEach(filePath => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
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