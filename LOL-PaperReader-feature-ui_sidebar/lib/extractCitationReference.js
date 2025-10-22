import fs from "fs";
import pkg from "pdfjs-dist";

const { getDocument, GlobalWorkerOptions } = pkg;

// Disable workers (Node environment)
GlobalWorkerOptions.workerSrc = null;

// === HELPER FUNCTIONS ===

/**
 * Groups text items by their Y-coordinate with a tolerance
 * @param {Array} textItems - Array of text items from PDF
 * @param {number} tolerance - Y-coordinate tolerance for grouping (default: 2)
 * @returns {Array} Array of grouped text lines
 */
function groupTextByLines(textItems, tolerance = 2) {
  const lines = [];

  // Sort items by Y-coordinate (descending, as PDF coordinates are bottom-up)
  const sortedItems = textItems.sort((a, b) => b.transform[5] - a.transform[5]);

  for (const item of sortedItems) {
    const yPos = item.transform[5];

    // Find existing line within tolerance
    let targetLine = lines.find(
      (line) => Math.abs(line.yPosition - yPos) <= tolerance
    );

    if (!targetLine) {
      // Create new line
      targetLine = {
        yPosition: yPos,
        items: [],
        text: "",
      };
      lines.push(targetLine);
    }

    targetLine.items.push(item);
  }

  // Sort items within each line by X-coordinate and join text
  lines.forEach((line) => {
    line.items.sort((a, b) => a.transform[4] - b.transform[4]);
    line.text = line.items
      .map((item) => item.str)
      .join(" ")
      .trim();
  });

  // Sort lines by Y-coordinate (descending)
  return lines.sort((a, b) => b.yPosition - a.yPosition);
}

/**
 * Extracts a single reference entry using regex patterns
 * @param {Array} lines - Grouped text lines
 * @param {number} targetY - Y-coordinate of the target reference
 * @param {number} searchRange - Range to search around targetY (default: 50)
 * @returns {Object} Extracted reference data with metadata
 */
function extractReferenceText(lines, targetY, searchRange = 50) {
  // Find lines within the search range
  const candidateLines = lines.filter(
    (line) =>
      line.yPosition <= targetY && line.yPosition >= targetY - searchRange
  );

  if (candidateLines.length === 0) {
    return {
      text: "(no text found)",
      method: "none",
      confidence: 0,
    };
  }

  // Reference patterns to identify boundaries
  const referencePatterns = [
    // Numbered references: [1], [2], etc.
    { pattern: /^\s*\[(\d+)\]/, type: "numbered" },
    // Author-year style: Author, A. (2021)
    { pattern: /^\s*[A-Z][a-z]+,\s*[A-Z]\..*?\(\d{4}\)/, type: "author-year" },
    // Author et al. patterns
    { pattern: /^\s*[A-Z][a-z]+\s+et\s+al\..*?\(\d{4}\)/, type: "author-year" },
    // DOI patterns
    { pattern: /^\s*(?:doi:|DOI:|\[doi\])/i, type: "doi" },
    // URL patterns
    { pattern: /^\s*(?:https?:|www\.)/i, type: "url" },
    // arXiv patterns
    { pattern: /^\s*arXiv:/i, type: "arxiv" },
    // Simple numbered without brackets: 1. 2. etc
    { pattern: /^\s*(\d+)\.\s+/, type: "numbered-dot" },
  ];

  let referenceText = "";
  let foundStart = false;
  let referenceType = null;
  let confidence = 0;

  for (const line of candidateLines) {
    const text = line.text.trim();
    if (!text) continue;

    // Check if this line starts a new reference
    const matchedPattern = referencePatterns.find(({ pattern }) =>
      pattern.test(text)
    );

    if (!foundStart && matchedPattern) {
      // This is our target reference
      foundStart = true;
      referenceType = matchedPattern.type;
      referenceText = text;
      confidence = 0.8; // High confidence for pattern-matched references
    } else if (foundStart && matchedPattern) {
      // We've hit the next reference, stop here
      break;
    } else if (foundStart) {
      // Continue adding to current reference
      referenceText += " " + text;

      // Stop if we see common reference section terminators
      if (/^\s*(Appendix|Index|Acknowledgments|Figures|Tables)\s/i.test(text)) {
        break;
      }
    }
  }

  // If no structured reference found, fall back to proximity-based extraction
  if (!referenceText.trim()) {
    const proximityRange = 30;
    const nearbyLines = lines.filter(
      (line) =>
        line.yPosition <= targetY && line.yPosition >= targetY - proximityRange
    );

    referenceText = nearbyLines
      .map((line) => line.text)
      .join(" ")
      .trim();

    confidence = 0.3; // Lower confidence for proximity-based extraction
    referenceType = "proximity";
  }

  // Clean up the reference text
  const cleanedText = cleanReferenceText(referenceText);

  return {
    text: cleanedText,
    method: referenceType || "proximity",
    confidence: confidence,
    linesUsed: foundStart ? candidateLines.length : nearbyLines?.length || 0,
  };
}

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

          // dest[3] = y-position (top of reference)
          const targetY = dest[3] ?? 0;

          // Step 3: Extract text from the target page
          const textContent = await targetPage.getTextContent(); // Step 4: Group text items by lines
          const lines = groupTextByLines(textContent.items);

          // Step 5: Extract reference text using improved logic
          const extractionResult = extractReferenceText(lines, targetY);

          // Step 6: Add result to output
          citations.push({
            citationId: destName,
            sourcePage: i,
            targetPage: pageIndex + 1,
            yPosition: targetY,
            referenceText: extractionResult.text,
            extractionMethod: extractionResult.method,
            confidence: extractionResult.confidence,
            linesProcessed: extractionResult.linesUsed,
            timestamp: new Date().toISOString(),
          });

          console.log(
            `✅ Extracted citation ${destName} (${
              extractionResult.method
            }, confidence: ${
              extractionResult.confidence
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
