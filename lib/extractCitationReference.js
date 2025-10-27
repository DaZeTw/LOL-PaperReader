import fs from "fs";
import pkg from "pdfjs-dist";

const { getDocument, GlobalWorkerOptions } = pkg;

// Disable workers (Node environment)
GlobalWorkerOptions.workerSrc = null;

// === HELPER FUNCTIONS ===
function saveLinesToFile(lines, pageNum, outputDir = "./debug") {
  // Create debug directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = `${outputDir}/page_${pageNum}_lines.json`;

  // Prepare lines data for JSON serialization
  const linesData = lines.map((line, lineIndex) => ({
    lineIndex,
    xPosition: line.xPosition,
    yPosition: line.yPosition,
    text: line.text,
    segments:
      line.segments?.map((segment) => ({
        text: segment.text,
        itemCount: segment.items.length,
      })) || [],
    items: line.items.map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width || 0,
      height: item.height || Math.abs(item.transform[3]) || 0,
      transform: item.transform,
    })),
  }));

  const debugData = {
    pageNumber: pageNum,
    totalLines: lines.length,
    extractedAt: new Date().toISOString(),
    lines: linesData,
  };

  fs.writeFileSync(filename, JSON.stringify(debugData, null, 2));
  console.log(`📝 Saved page ${pageNum} lines data to ${filename}`);

  return filename;
}

/**
 * Groups text items by their Y-coordinate with a tolerance
 * @param {Array} textItems - Array of text items from PDF
 * @param {number} tolerance - Y-coordinate tolerance for grouping (default: 2)
 * @returns {Array} Array of grouped text lines
 */
function groupTextByLines(textItems, yTolerance = 2, xGapThreshold = 20) {
  const lines = [];

  // Step 1: Group items by Y (approximate line level)
  const sortedItems = textItems.sort((a, b) => b.transform[5] - a.transform[5]);

  for (const item of sortedItems) {
    const yPos = item.transform[5];

    let targetLine = lines.find(
      (line) => Math.abs(line.yPosition - yPos) <= yTolerance
    );

    if (!targetLine) {
      targetLine = {
        yPosition: yPos,
        items: [],
      };
      lines.push(targetLine);
    }

    targetLine.items.push(item);
  }

  const finalLines = [];

  // Step 2: Split each line into sublines using x-gap
  for (const line of lines) {
    const items = line.items.sort((a, b) => a.transform[4] - b.transform[4]);

    let currentSubline = {
      yPosition: line.yPosition,
      items: [],
    };

    for (let i = 0; i < items.length; i++) {
      const curr = items[i];
      const prev = items[i - 1];

      const prevXEnd = prev ? prev.transform[4] + (prev.width || 0) : null;
      const currX = curr.transform[4];
      const gap = prev ? currX - prevXEnd : 0;

      if (i > 0 && gap > xGapThreshold) {
        // Finalize current subline
        currentSubline.text = currentSubline.items
          .map((it) => it.str)
          .join(" ")
          .trim();
        currentSubline.xPosition = currentSubline.items[0]?.transform[4] || 0;
        finalLines.push(currentSubline);

        // Start a new one
        currentSubline = {
          yPosition: line.yPosition,
          items: [],
        };
      }

      currentSubline.items.push(curr);
    }

    // Push the last subline
    if (currentSubline.items.length > 0) {
      currentSubline.text = currentSubline.items
        .map((it) => it.str)
        .join(" ")
        .trim();
      currentSubline.xPosition = currentSubline.items[0]?.transform[4] || 0;
      finalLines.push(currentSubline);
    }
  }

  // Step 3: Return all final lines
  return finalLines.sort((a, b) => b.yPosition - a.yPosition);
}

/**
 * Calculate adaptive thresholds based on page dimensions and text analysis
 * @param {Object} page - PDF page object
 * @param {Array} lines - Grouped text lines
 * @returns {Object} Adaptive thresholds
 */
function calculateAdaptiveThresholds(page, lines) {
  // Get page dimensions
  const pageView = page.view;
  const pageWidth = pageView[2] - pageView[0];
  const pageHeight = pageView[3] - pageView[1];

  // Analyze text to estimate line height and character width
  const textStats = analyzeTextMetrics(lines);

  // Calculate adaptive thresholds
  const searchRange = Math.max(
    textStats.averageLineHeight * 10, // ~8 lines worth
    pageHeight * 0.12, // 12% of page height
    60 // Minimum threshold
  );

  const xTolerance = Math.max(
    textStats.averageCharWidth * 5, // ~5 characters worth
    pageWidth * 0.03, // 3% of page width
    20 // Minimum threshold
  );

  return {
    searchRange: Math.round(searchRange),
    xTolerance: Math.round(xTolerance),
    pageWidth,
    pageHeight,
    textStats,
  };
}

/**
 * Analyze text metrics from lines to estimate dimensions
 * @param {Array} lines - Grouped text lines
 * @returns {Object} Text statistics
 */
function analyzeTextMetrics(lines) {
  if (lines.length === 0) {
    return {
      averageLineHeight: 12,
      averageCharWidth: 6,
      lineSpacing: 14,
    };
  }

  // Calculate line heights by looking at Y-position differences
  const lineHeights = [];
  const sortedLines = lines.sort((a, b) => b.yPosition - a.yPosition);

  for (let i = 0; i < sortedLines.length - 1; i++) {
    const diff = sortedLines[i].yPosition - sortedLines[i + 1].yPosition;
    if (diff > 0 && diff < 100) {
      // Reasonable line spacing
      lineHeights.push(diff);
    }
  }

  // Calculate character widths by analyzing text items
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

  const averageLineHeight =
    lineHeights.length > 0
      ? lineHeights.reduce((a, b) => a + b, 0) / lineHeights.length
      : 12;

  const averageCharWidth =
    charWidths.length > 0
      ? charWidths.reduce((a, b) => a + b, 0) / charWidths.length
      : 6;

  return {
    averageLineHeight: Math.max(averageLineHeight, 8),
    averageCharWidth: Math.max(averageCharWidth, 3),
    lineSpacing: averageLineHeight,
    totalLines: lines.length,
    analyzedLineHeights: lineHeights.length,
    analyzedCharWidths: charWidths.length,
  };
}

/**
 * Detects if the page uses a multi-column layout
 * @param {Array} lines - Grouped text lines
 * @param {Object} page - PDF page object
 * @returns {Object} Column layout information
 */
function detectColumnLayout(lines, page) {
  if (lines.length === 0) {
    return { isMultiColumn: false, columns: 1, columnWidth: 0, columnGap: 0 };
  }

  const pageWidth = page.view[2] - page.view[0];
  const pageHeight = page.view[3] - page.view[1];

  // Group lines by X position to detect columns
  const xPositions = lines.map((line) => line.xPosition).sort((a, b) => a - b);
  const leftmostX = Math.min(...xPositions);
  const rightmostX = Math.max(...xPositions);

  // Find common X starting positions (potential column starts)
  const xClusters = [];
  const tolerance = 10; // X tolerance for grouping

  for (const x of xPositions) {
    let foundCluster = false;
    for (const cluster of xClusters) {
      if (Math.abs(cluster.x - x) <= tolerance) {
        cluster.count++;
        foundCluster = true;
        break;
      }
    }
    if (!foundCluster) {
      xClusters.push({ x, count: 1 });
    }
  }

  // Sort clusters by frequency and position
  xClusters.sort((a, b) => b.count - a.count);

  // Check if we have 2 dominant X positions (indicating 2 columns)
  const isMultiColumn =
    xClusters.length >= 2 &&
    xClusters[1].count > lines.length * 0.1 && // Second column has at least 10% of lines
    Math.abs(xClusters[0].x - xClusters[1].x) > pageWidth * 0.3; // Columns are reasonably apart

  if (isMultiColumn) {
    const col1X = Math.min(xClusters[0].x, xClusters[1].x);
    const col2X = Math.max(xClusters[0].x, xClusters[1].x);
    const columnGap = col2X - col1X;
    const columnWidth = Math.min(columnGap * 0.8, pageWidth * 0.4); // Estimate column width

    return {
      isMultiColumn: true,
      columns: 2,
      col1X,
      col2X,
      columnWidth,
      columnGap,
      pageWidth,
    };
  }

  return {
    isMultiColumn: false,
    columns: 1,
    columnWidth: pageWidth,
    columnGap: 0,
    pageWidth,
  };
}

/**
 * Determines which column a line belongs to
 * @param {Object} line - Text line
 * @param {Object} columnLayout - Column layout information
 * @returns {number} Column number (1 or 2)
 */
function getColumnNumber(line, columnLayout) {
  if (!columnLayout.isMultiColumn) return 1;

  const midpoint = (columnLayout.col1X + columnLayout.col2X) / 2;
  return line.xPosition < midpoint ? 1 : 2;
}

/**
 * Extracts a single reference entry using regex patterns with adaptive thresholds
 * @param {Array} lines - Grouped text lines
 * @param {number} targetX - X-coordinate of the target reference
 * @param {number} targetY - Y-coordinate of the target reference
 * @param {Object} page - PDF page object for adaptive calculations
 * @returns {Object} Extracted reference data with metadata
 */
function extractReferenceText(lines, targetX = 0, targetY, page = null) {
  // Calculate adaptive thresholds
  const thresholds = page
    ? calculateAdaptiveThresholds(page, lines)
    : { searchRange: 60, xTolerance: 25 }; // Fallback to fixed values

  console.log(
    `🎯 Using adaptive thresholds: searchRange=${thresholds.searchRange}, xTolerance=${thresholds.xTolerance}`
  );

  // Step 1: Filter by vertical (Y) proximity - handle same page vs next page differently
  const candidateLines = lines.filter((line) => {
    if (line.isNextPage) {
      // For next page lines, we want lines from the top of the next page
      const nextPageLines = lines.filter((l) => l.isNextPage);
      if (nextPageLines.length === 0) return false;

      const maxNextPageY = Math.max(...nextPageLines.map((l) => l.yPosition));
      return line.yPosition >= maxNextPageY - thresholds.searchRange;
    } else {
      // For same page lines, use adaptive search range
      return (
        line.yPosition <= targetY &&
        line.yPosition >= targetY - thresholds.searchRange
      );
    }
  });

  if (candidateLines.length === 0) {
    return {
      text: "(no text found)",
      method: "none",
      confidence: 0,
      thresholds,
    };
  }

  // Step 2: Filter Y-matched lines by horizontal (X) proximity with adaptive tolerance
  const xFilteredLines = candidateLines.filter((line) => {
    const x = line.xPosition ?? 0;
    return Math.abs(x - targetX) <= thresholds.xTolerance;
  });

  if (xFilteredLines.length === 0) {
    return {
      text: "(no text found)",
      method: "none",
      confidence: 0,
      thresholds,
    };
  }

  // Step 3: Sort lines properly - same page first, then next page
  xFilteredLines.sort((a, b) => {
    if (a.isNextPage && !b.isNextPage) return 1;
    if (!a.isNextPage && b.isNextPage) return -1;
    return b.yPosition - a.yPosition;
  });

  // Step 4: Define known reference start patterns
  const referencePatterns = [
    { pattern: /^\s*\[(\d+)\]/, type: "numbered" },
    { pattern: /^\s*[A-Z][a-z]+,\s*[A-Z]\..*?\(\d{4}\)/, type: "author-year" },
    { pattern: /^\s*[A-Z][a-z]+\s+et\s+al\..*?\(\d{4}\)/, type: "author-year" },
    { pattern: /^\s*(?:doi:|DOI:|\[doi\])/i, type: "doi" },
    { pattern: /^\s*(?:https?:|www\.)/i, type: "url" },
    { pattern: /^\s*arXiv:/i, type: "arxiv" },
    { pattern: /^\s*(\d+)\.\s+/, type: "numbered-dot" },
  ];

  let referenceText = "";
  let foundStart = false;
  let referenceType = null;
  let confidence = 0;
  const collectedLines = [];
  let spansPages = false;

  // Step 5: Extract reference by walking through x-filtered lines
  for (const line of xFilteredLines) {
    const text = line.text.trim();
    if (!text) continue;

    if (line.isNextPage) {
      spansPages = true;
    }

    const matchedPattern = referencePatterns.find(({ pattern }) =>
      pattern.test(text)
    );

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

      if (/^\s*(Appendix|Index|Acknowledgments|Figures|Tables)\s/i.test(text)) {
        break;
      }
    }
  }

  // Step 6: Fallback to proximity-based if nothing extracted
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
    collectedLines.push(...fallbackLines);
  }

  const cleanedText = cleanReferenceText(referenceText);

  return {
    text: cleanedText,
    method: referenceType || "proximity",
    confidence: spansPages ? confidence + 0.1 : confidence,
    linesUsed: collectedLines.length,
    spansPages,
    thresholds, // Include thresholds in output for debugging
    candidatesFound: candidateLines.length,
    xFilteredFound: xFilteredLines.length,
  };
}
// ...existing code...

/**
 * Cleans and normalizes reference text
 * @param {string} text - Raw reference text
 * @returns {string} Cleaned reference text
 */
function cleanReferenceText(text) {
  if (!text || text.trim() === "") {
    return "(no text found)";
  }

  return (
    text
      // Remove excessive whitespace
      .replace(/\s+/g, " ")
      // Remove common PDF artifacts
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, " ")
      // Trim
      .trim()
      // Limit length to avoid runaway extractions
      .substring(0, 1000)
  );
}

// === MAIN FUNCTION ===
async function extractCitationReferences(
  pdfPath,
  outputPath = "./citations.json"
) {
  const pdf = await getDocument(pdfPath).promise;
  console.log(`📄 Loaded PDF with ${pdf.numPages} pages.`);

  const citations = [];

  // Step 1: Loop through each page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const annotations = await page.getAnnotations();

    for (const ann of annotations) {
      // Detect inline citation links (internal destinations starting with "cite.")
      if (
        ann.subtype === "Link" &&
        typeof ann.dest === "string" &&
        ann.dest.startsWith("cite.")
      ) {
        const destName = ann.dest;
        try {
          // Step 2: Resolve the destination
          const dest = await pdf.getDestination(destName);
          if (!dest) continue;

          // dest[0] = reference to page object
          const pageIndex = await pdf.getPageIndex(dest[0]);
          const targetPage = await pdf.getPage(pageIndex + 1);
          const targetX = dest[2] ?? 0;
          // dest[3] = y-position (top of reference)
          const targetY = dest[3] ?? 0;

          // Step 3: Extract text from the target page
          const textContent = await targetPage.getTextContent();
          const lines = groupTextByLines(textContent.items);

          // Check if we need to include the next page for multi-page references
          let allLines = [...lines];
          let nextPageLines = [];
          let spansPages = false;

          // If the citation is near the bottom of the page, also get next page
          const pageHeight = targetPage.view[3] - targetPage.view[1] || 792; // Get actual page height
          const distanceFromBottom = targetY;

          if (distanceFromBottom < 100 && pageIndex + 2 <= pdf.numPages) {
            // Close to bottom
            try {
              const nextPage = await pdf.getPage(pageIndex + 2);
              const nextTextContent = await nextPage.getTextContent();
              nextPageLines = groupTextByLines(nextTextContent.items);

              // Mark lines as coming from next page and adjust Y positions
              nextPageLines = nextPageLines.map((line) => ({
                ...line,
                yPosition: line.yPosition - pageHeight, // Subtract to make them appear "below" current page
                isNextPage: true,
              }));

              allLines = [...lines, ...nextPageLines];
              spansPages = true;
              console.log(
                `🚩 Including next page for citation ${destName} spanning pages ${
                  pageIndex + 1
                }-${pageIndex + 2}`
              );
            } catch (err) {
              console.warn(
                `⚠️ Could not load next page for multi-page citation: ${err.message}`
              );
            }
          }

          saveLinesToFile(lines, pageIndex + 1); // Save primary page for debugging
          if (nextPageLines.length > 0) {
            // Save next page too (with original Y positions for debugging)
            const originalNextPageLines = nextPageLines.map((line) => ({
              ...line,
              yPosition: line.yPosition + pageHeight,
              isNextPage: undefined,
            }));
            saveLinesToFile(originalNextPageLines, pageIndex + 2);
          }

          // Step 4: Extract reference text using improved logic with all lines
          const extractionResult = extractReferenceText(
            allLines,
            targetX,
            targetY,
            targetPage
          );

          // Step 5: Add result to output
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

          console.log(
            `✅ Extracted citation ${destName} (${
              extractionResult.method
            }, confidence: ${extractionResult.confidence}${
              spansPages ? ", spans pages" : ""
            }): ${extractionResult.text.substring(0, 100)}...`
          );
        } catch (err) {
          console.warn(
            `⚠️ Could not resolve destination ${ann.dest}:`,
            err.message
          );
        }
      }
    }
  }

  // Save results
  fs.writeFileSync(outputPath, JSON.stringify(citations, null, 2));

  // Generate extraction summary
  const summary = generateExtractionSummary(citations);
  const summaryPath = outputPath.replace(".json", "_summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`✅ Saved ${citations.length} citation entries to ${outputPath}`);
  console.log(`📊 Extraction Summary:`);
  console.log(`   - Total citations: ${summary.totalCitations}`);
  console.log(
    `   - Multi-page citations: ${citations.filter((c) => c.spansPages).length}`
  );
  console.log(
    `   - By method: ${Object.entries(summary.byMethod)
      .map(([k, v]) => `${k}(${v})`)
      .join(", ")}`
  );
  console.log(
    `   - Average confidence: ${summary.averageConfidence.toFixed(2)}`
  );
  console.log(`   - High confidence (>0.7): ${summary.highConfidenceCount}`);
}

/**
 * Generates a summary of extraction results
 * @param {Array} citations - Array of extracted citations
 * @returns {Object} Summary statistics
 */
function generateExtractionSummary(citations) {
  const methodCounts = {};
  let totalConfidence = 0;
  let highConfidenceCount = 0;

  citations.forEach((citation) => {
    const method = citation.extractionMethod || "unknown";
    methodCounts[method] = (methodCounts[method] || 0) + 1;

    totalConfidence += citation.confidence || 0;
    if (citation.confidence > 0.7) {
      highConfidenceCount++;
    }
  });

  return {
    totalCitations: citations.length,
    byMethod: methodCounts,
    averageConfidence:
      citations.length > 0 ? totalConfidence / citations.length : 0,
    highConfidenceCount,
    lowConfidenceCount: citations.filter((c) => (c.confidence || 0) < 0.5)
      .length,
    extractionDate: new Date().toISOString(),
  };
}

// Run it
extractCitationReferences("./2303.14334v2.pdf").catch(console.error);
