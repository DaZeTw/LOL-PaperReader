import fs from "fs";
import pkg from "pdfjs-dist";
import { ref } from "process";

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
    pageNumber: line.pageNumber,
    xPosition: line.xPosition,
    yPosition: line.yPosition,
    text: line.text,
    fonts: line.fonts || [], // Add font information
    dominantFont: line.dominantFont || "unknown", // Add dominant font
    segments:
      line.segments?.map((segment) => ({
        text: segment.text,
        itemCount: segment.items.length,
      })) || [],
    items: line.items.map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      fontName: item.fontName || "unknown",
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
/**
 * Groups text items by their Y-coordinate with a tolerance
 * @param {Array} textItems - Array of text items from PDF
 * @param {number} yTolerance - Y-coordinate tolerance for grouping (default: 2)
 * @param {number} xGapThreshold - X-gap threshold for splitting lines (default: 20)
 * @param {number} pageNumber - Page number to assign to all lines
 * @returns {Array} Array of grouped text lines
 */
function groupTextByLines(
  textItems,
  yTolerance = 2,
  xGapThreshold = 20,
  pageNumber = 1
) {
  const finalLines = [];
  let currentLine = null;

  // Process items in their natural order (already sorted)
  for (const item of textItems) {
    const yPos = item.transform[5];
    const xPos = item.transform[4];
    const fontName = item.fontName || "unknown";

    // Check if this item belongs to the current line
    if (currentLine && Math.abs(currentLine.yPosition - yPos) <= yTolerance) {
      // Check if there's a large X gap (new column/subline)
      const lastItem = currentLine.items[currentLine.items.length - 1];
      const lastXEnd = lastItem.transform[4] + (lastItem.width || 0);
      const gap = xPos - lastXEnd;

      if (gap > xGapThreshold) {
        // Finalize current line and start a new one
        currentLine.text = currentLine.items
          .map((it) => it.str)
          .join(" ")
          .trim();
        currentLine.xPosition = currentLine.items[0]?.transform[4] || 0;
        // Add font information
        currentLine.fonts = [
          ...new Set(currentLine.items.map((it) => it.fontName || "unknown")),
        ];
        currentLine.dominantFont = getMostCommonFont(currentLine.items);
        finalLines.push(currentLine);

        // Start new line
        currentLine = {
          yPosition: yPos,
          pageNumber: pageNumber,
          items: [item],
        };
      } else {
        // Add to current line
        currentLine.items.push(item);
      }
    } else {
      // Finalize previous line if exists
      if (currentLine) {
        currentLine.text = currentLine.items
          .map((it) => it.str)
          .join(" ")
          .trim();
        currentLine.xPosition = currentLine.items[0]?.transform[4] || 0;
        // Add font information
        currentLine.fonts = [
          ...new Set(currentLine.items.map((it) => it.fontName || "unknown")),
        ];
        currentLine.dominantFont = getMostCommonFont(currentLine.items);
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
    // Add font information
    currentLine.fonts = [
      ...new Set(currentLine.items.map((it) => it.fontName || "unknown")),
    ];
    currentLine.dominantFont = getMostCommonFont(currentLine.items);
    finalLines.push(currentLine);
  }

  return finalLines;
}

/**
 * Gets the most common font in a line
 */
function getMostCommonFont(items) {
  const fontCounts = {};
  items.forEach((item) => {
    const font = item.fontName || "unknown";
    fontCounts[font] = (fontCounts[font] || 0) + 1;
  });

  return (
    Object.entries(fontCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ||
    "unknown"
  );
}

/**
 * Filters lines to keep only reference lines based on font
 */
function filterReferenceLinesByFont(lines) {
  // Analyze font distribution to identify reference fonts
  const fontStats = analyzeFontDistribution(lines);

  console.log("📊 Font analysis:", fontStats);

  // Typically references use specific fonts (like g_d0_f3, g_d0_f4)
  const referenceFonts = identifyReferenceFonts(fontStats);

  console.log("🔤 Identified reference fonts:", referenceFonts);

  // Filter lines that use reference fonts
  const referenceLines = lines.filter((line) => {
    return referenceFonts.some(
      (font) => line.dominantFont === font || line.fonts.includes(font)
    );
  });

  console.log(
    `📝 Filtered ${referenceLines.length} reference lines from ${lines.length} total lines`
  );

  return referenceLines;
}

/**
 * Analyzes font distribution across lines
 */
function analyzeFontDistribution(lines) {
  const fontCounts = {};
  const fontLineCount = {};

  lines.forEach((line) => {
    line.fonts.forEach((font) => {
      fontCounts[font] = (fontCounts[font] || 0) + 1;
    });

    if (line.dominantFont) {
      fontLineCount[line.dominantFont] =
        (fontLineCount[line.dominantFont] || 0) + 1;
    }
  });

  return {
    fontCounts,
    fontLineCount,
    totalLines: lines.length,
    uniqueFonts: Object.keys(fontCounts),
  };
}

/**
 * Identifies which fonts are likely used for references
 */
function identifyReferenceFonts(fontStats) {
  const { fontLineCount, totalLines } = fontStats;

  // Look for fonts that appear in a reasonable number of lines
  // (not too rare, not too common like body text)
  const referenceFontCandidates = Object.entries(fontLineCount)
    .filter(([font, count]) => {
      const percentage = count / totalLines;
      // References typically make up 10-80% of lines on a references page
      return percentage >= 0.1 && percentage <= 0.8 && count >= 3;
    })
    .map(([font]) => font);

  // If we find the expected fonts, prefer them
  const expectedFonts = ["g_d0_f3", "g_d0_f4"];
  const foundExpectedFonts = expectedFonts.filter((font) =>
    referenceFontCandidates.includes(font)
  );

  if (foundExpectedFonts.length > 0) {
    return foundExpectedFonts;
  }

  // Fall back to the most common fonts that aren't too dominant
  return referenceFontCandidates.slice(0, 2);
}

/**
 * Calculates position statistics for outlier detection
 * @param {Array} positions - Array of position values
 * @returns {Object} Statistics including mean, median, std deviation
 */
function calculatePositionStats(positions) {
  if (positions.length === 0)
    return { mean: 0, median: 0, std: 0, q1: 0, q3: 0 };

  const sorted = [...positions].sort((a, b) => a - b);
  const mean = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
  const median = sorted[Math.floor(sorted.length / 2)];

  // Calculate standard deviation
  const variance =
    positions.reduce((sum, pos) => sum + Math.pow(pos - mean, 2), 0) /
    positions.length;
  const std = Math.sqrt(variance);

  // Calculate quartiles
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];

  return {
    mean,
    median,
    std,
    q1,
    q3,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/**
 * Detects and filters outlier lines based on font, x, y position patterns
 * @param {Array} lines - Array of text lines
 * @returns {Array} Filtered lines with outliers removed
 */
function detectAndFilterOutliers(lines) {
  if (lines.length === 0) return lines;

  console.log(`🔍 Analyzing ${lines.length} lines for outliers...`);

  // Step 1: Filter by reference fonts first
  const referenceLines = filterReferenceLinesByFont(lines);
  console.log(
    `📝 Font-filtered lines: ${referenceLines.length} from ${lines.length} total`
  );

  if (referenceLines.length === 0) return referenceLines;

  // Step 2: Analyze X-position patterns
  const xPositions = referenceLines
    .map((line) => line.xPosition)
    .filter((x) => x !== undefined);
  const xStats = calculatePositionStats(xPositions);
  console.log("📐 X-position stats:", xStats);

  // Step 3: Analyze Y-position patterns
  const yPositions = referenceLines
    .map((line) => line.yPosition)
    .filter((y) => y !== undefined);
  const yStats = calculatePositionStats(yPositions);
  console.log("📏 Y-position stats:", yStats);

  // Step 4: Filter out outliers
  const filteredLines = referenceLines.filter((line) => {
    const x = line.xPosition ?? 0;
    const y = line.yPosition ?? 0;
    const text = line.text?.trim() || "";

    // Skip empty lines
    if (!text) return false;

    // X-position outlier detection using IQR method
    const xIQR = xStats.q3 - xStats.q1;
    const xLowerBound = xStats.q1 - 1.5 * xIQR;
    const xUpperBound = xStats.q3 + 1.5 * xIQR;
    const isXOutlier = x < xLowerBound || x > xUpperBound;

    // Y-position outlier detection - be more lenient for references that might span pages
    const yIQR = yStats.q3 - yStats.q1;
    const yLowerBound = yStats.q1 - 2.0 * yIQR; // More lenient
    const yUpperBound = yStats.q3 + 2.0 * yIQR;
    const isYOutlier = y < yLowerBound || y > yUpperBound;

    // Content-based exclusions (likely headers, footers, page numbers)
    const isContentOutlier =
      // Very short lines that are likely page numbers or headers
      text.length < 10 ||
      // Obvious non-reference patterns
      /^(Page\s+)?\d+(\s+of\s+\d+)?$/i.test(text) ||
      /^(Figure|Table|Equation)\s+\d+/i.test(text) ||
      /^(Chapter|Section)\s+\d+/i.test(text) ||
      /^(Abstract|Introduction|Conclusion|Discussion|Results)$/i.test(text) ||
      // Single words that are likely headers
      (text.split(/\s+/).length === 1 && text.length < 15);

    const isOutlier = isXOutlier || isYOutlier || isContentOutlier;

    if (isOutlier) {
      console.log(
        `🚫 Outlier detected: "${text.substring(
          0,
          50
        )}..." (x:${isXOutlier}, y:${isYOutlier}, content:${isContentOutlier})`
      );
    }

    return !isOutlier;
  });

  console.log(
    `✅ Filtered out ${
      referenceLines.length - filteredLines.length
    } outliers, kept ${filteredLines.length} lines`
  );

  return filteredLines;
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
          const targetY = dest[3] ?? 0; // Step 3: Extract text from the target page
          const textContent = await targetPage.getTextContent();
          console.log(`Text items:`, textContent.items.slice(0, 5));
          const lines = groupTextByLines(
            textContent.items,
            2,
            20,
            pageIndex + 1
          );

          // Save all lines for debugging
          saveLinesToFile(lines, pageIndex + 1);

          // Step 4: Detect and filter outliers to get clean reference lines
          const filteredReferenceLines = detectAndFilterOutliers(lines);

          // Save filtered reference lines for debugging
          saveLinesToFile(
            filteredReferenceLines,
            `${pageIndex + 1}_filtered_references`
          );

          // Step 5: Add result to output (simplified for now)
          citations.push({
            citationId: destName,
            sourcePage: i,
            targetPage: pageIndex + 1,
            xPosition: targetX,
            yPosition: targetY,
            totalLines: lines.length,
            filteredReferenceLines: filteredReferenceLines.length,
            timestamp: new Date().toISOString(),
          });

          console.log(
            `✅ Processed citation ${destName}: found ${filteredReferenceLines.length} reference lines from ${lines.length} total lines`
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
extractCitationReferences("./2408.09869v5.pdf").catch(console.error);
