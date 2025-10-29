import fs from "fs";
import pkg from "pdfjs-dist";

const { getDocument, GlobalWorkerOptions } = pkg;

// Disable worker (use fake worker in Node)
GlobalWorkerOptions.workerSrc = null;

/**
 * Detect starting point for a citation target
 * @param {number} targetX - Target X coordinate
 * @param {number} targetY - Target Y coordinate
 * @param {number} targetPage - Target page number
 * @param {Array} referenceLines - Array of reference lines
 * @returns {Object} Starting line object or null
 */
function detectStartingPoint(targetX, targetY, targetPage, referenceLines) {
  const xMinTolerance = 5; // (x-5)
  const xMaxTolerance = 8; // (x+8)
  const yTolerance = 15; // (y±5)

  console.log(
    `🎯 Looking for starting point near (${targetX.toFixed(
      1
    )}, ${targetY.toFixed(1)}) on page ${targetPage}`
  );
  // console.log(
  //   `   X range: ${(targetX - xMinTolerance).toFixed(1)} to ${(
  //     targetX + xMaxTolerance
  //   ).toFixed(1)}`
  // );
  // console.log(
  //   `   Y range: ${(targetY - yTolerance).toFixed(1)} to ${(
  //     targetY + yTolerance
  //   ).toFixed(1)}`
  // );

  // Filter lines on the target page first
  const pageLines = referenceLines.filter(
    (line) => line.pageNumber === targetPage
  );
  console.log(`   Found ${pageLines.length} lines on page ${targetPage}`);

  // Find lines within coordinate tolerance (x-5, x+8) and (y±5)
  const candidateLines = pageLines.filter((line) => {
    const xInRange =
      line.xPosition >= targetX - xMinTolerance &&
      line.xPosition <= targetX + xMaxTolerance;
    const yInRange = Math.abs(line.yPosition - targetY) <= yTolerance;
    return xInRange && yInRange;
  });

  // console.log(
  //   `   Found ${candidateLines.length} candidate lines within tolerance`
  // );

  if (candidateLines.length === 0) {
    console.log(`   ❌ No lines found within tolerance`);
    return null;
  }

  // Sort by preference: starting lines first, then by distance to target
  candidateLines.sort((a, b) => {
    // Prefer starting lines
    if (a.isStartingLine && !b.isStartingLine) return -1;
    if (!a.isStartingLine && b.isStartingLine) return 1;

    // Then sort by distance to target
    const distanceA = Math.sqrt(
      Math.pow(a.xPosition - targetX, 2) + Math.pow(a.yPosition - targetY, 2)
    );
    const distanceB = Math.sqrt(
      Math.pow(b.xPosition - targetX, 2) + Math.pow(b.yPosition - targetY, 2)
    );
    return distanceA - distanceB;
  });

  const selectedLine = candidateLines[0];
  // console.log(
  //   `   ✅ Selected line ${
  //     selectedLine.lineIndex
  //   }: "${selectedLine.text.substring(0, 50)}..."`
  // );
  // console.log(
  //   `      Position: (${selectedLine.xPosition.toFixed(
  //     1
  //   )}, ${selectedLine.yPosition.toFixed(1)})`
  // );
  // console.log(`      IsStartingLine: ${selectedLine.isStartingLine}`);
  // console.log(
  //   `      Distance: ${Math.sqrt(
  //     Math.pow(selectedLine.xPosition - targetX, 2) +
  //       Math.pow(selectedLine.yPosition - targetY, 2)
  //   ).toFixed(1)}`
  // );

  return selectedLine;
}

/**
 * Build reference text from starting line until next starting line
 * @param {Object} startingLine - The starting line object
 * @param {Array} referenceLines - Array of all reference lines
 * @returns {Object} Built reference with lines and text
 */
function buildReferenceText(startingLine, referenceLines) {
  console.log(`📝 Building reference text from line ${startingLine.lineIndex}`);

  const result = [startingLine];
  const startingLineIndex = startingLine.lineIndex;

  // Sort all lines by lineIndex to ensure proper order
  const sortedLines = referenceLines
    .slice()
    .sort((a, b) => a.lineIndex - b.lineIndex);

  // Find the starting line in the sorted array
  const startingPosition = sortedLines.findIndex(
    (line) => line.lineIndex === startingLineIndex
  );

  if (startingPosition === -1) {
    console.log(
      `   ⚠️ Could not find starting line in sorted array, returning single line`
    );
    return {
      lines: result,
      fullText: startingLine.text.trim(),
      lineCount: 1,
      startingLineIndex: startingLineIndex,
      endingLineIndex: startingLineIndex,
    };
  }

  // Collect subsequent lines until we meet isStartingLine = true
  let linesAdded = 0;
  for (let i = startingPosition + 1; i < sortedLines.length; i++) {
    const currentLine = sortedLines[i];

    // Stop if we encounter another starting line
    if (currentLine.isStartingLine) {
      console.log(
        `   🛑 Stopped at next starting line ${currentLine.lineIndex}`
      );
      break;
    }

    // Stop if we move too far from the original page (safety check)
    if (Math.abs(currentLine.pageNumber - startingLine.pageNumber) > 1) {
      console.log(
        `   🛑 Stopped due to page distance (current: ${currentLine.pageNumber}, start: ${startingLine.pageNumber})`
      );
      break;
    }

    result.push(currentLine);
    linesAdded++;
  }

  // Build full text with proper hyphenation handling
  const fullText = buildFullTextWithHyphenation(result);

  console.log(
    `   ✅ Built reference with ${result.length} lines (added ${linesAdded} continuation lines)`
  );
  console.log(`   📏 Text length: ${fullText.length} characters`);
  console.log(
    `   📖 Preview: "${fullText.substring(0, 100)}${
      fullText.length > 100 ? "..." : ""
    }"`
  );

  return {
    lines: result,
    fullText: fullText,
    lineCount: result.length,
    startingLineIndex: startingLineIndex,
    endingLineIndex: result[result.length - 1].lineIndex,
    characterCount: fullText.length,
    wordCount: fullText.split(/\s+/).filter((word) => word.length > 0).length,
  };
}

/**
 * Build full text from lines handling hyphenation and special characters properly
 * @param {Array} lines - Array of line objects
 * @returns {string} Full text with proper word joining
 */
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
      // First line - just add it
      fullText = currentText;
    } else {
      // Check if previous line ends with special characters that should merge
      const previousLineEndsWithHyphen = fullText.endsWith("-");
      const previousLineEndsWithColon = fullText.endsWith(":");
      const previousLineEndsWithSlash = fullText.endsWith("/");

      if (previousLineEndsWithHyphen) {
        // Remove the hyphen and merge without space
        fullText = fullText.slice(0, -1) + currentText;
      } else if (previousLineEndsWithColon) {
        // Keep the colon and merge without space (for URLs, DOIs, etc.)
        fullText = fullText + currentText;
      } else if (previousLineEndsWithSlash) {
        // Keep the slash and merge without space (for URLs, paths, etc.)
        fullText = fullText + currentText;
      } else {
        // Normal case - add space between lines
        fullText += " " + currentText;
      }
    }
  }

  return fullText.trim();
}

/**
 * Main function to extract references from PDF and reference file
 * @param {string} pdfPath - Path to PDF file
 * @param {string} referenceFilePath - Path to reference lines JSON file
 * @param {string} outputPath - Optional output path to save results
 * @returns {Object} Built references with metadata
 */
async function extractReferencesFromFile(
  pdfPath,
  referenceFilePath,
  outputPath = null
) {
  console.log(`📄 Extracting references from ${pdfPath}`);
  console.log(`📋 Using reference lines from ${referenceFilePath}`);

  // Step 1: Load reference lines file
  if (!fs.existsSync(referenceFilePath)) {
    throw new Error(`Reference file not found: ${referenceFilePath}`);
  }

  const referenceData = JSON.parse(fs.readFileSync(referenceFilePath, "utf8"));
  const referenceLines = referenceData.referenceLines;

  console.log(`📝 Loaded ${referenceLines.length} reference lines`);

  // Step 2: Load PDF and get citations with targets
  const pdf = await getDocument(pdfPath).promise;
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
              annotationId: ann.id || `ann_${pageNum}_${citations.length}`, // Add annotation ID
              citationDestination: ann.dest, // Renamed from citationId
              sourcePage: pageNum,
              targetPage: targetPage,
              targetX: targetX,
              targetY: targetY,
              annotationRect: ann.rect, // Renamed for clarity
            });
          }
        } catch (error) {
          // Skip problematic destinations
        }
      }
    }
  }

  console.log(`🔗 Found ${citations.length} citations with valid targets`);

  // Step 3: Build references for each citation
  const builtReferences = [];
  let successCount = 0;
  let failCount = 0;

  for (const citation of citations) {
    try {
      console.log(
        `\n--- Processing citation ${citation.citationDestination} (ID: ${citation.annotationId}) ---`
      );

      // Detect starting point
      const startingPoint = detectStartingPoint(
        citation.targetX,
        citation.targetY,
        citation.targetPage,
        referenceLines
      );

      if (!startingPoint) {
        console.log(
          `❌ No starting point found for ${citation.citationDestination}`
        );
        failCount++;
        continue;
      }

      // Build reference text
      const builtText = buildReferenceText(startingPoint, referenceLines);

      // Create complete reference object
      const reference = {
        annotationId: citation.annotationId, // Add annotation ID
        citationDestination: citation.citationDestination, // Renamed from citationId
        sourcePage: citation.sourcePage,
        targetPage: citation.targetPage,
        targetPosition: {
          x: citation.targetX,
          y: citation.targetY,
        },
        annotationRect: citation.annotationRect, // Add annotation rectangle
        startingLine: {
          lineIndex: startingPoint.lineIndex,
          position: {
            x: startingPoint.xPosition,
            y: startingPoint.yPosition,
            page: startingPoint.pageNumber,
          },
          text: startingPoint.text,
        },
        reference: {
          fullText: builtText.fullText,
          lineCount: builtText.lineCount,
          characterCount: builtText.characterCount,
          wordCount: builtText.wordCount,
          lines: builtText.lines.map((line) => ({
            lineIndex: line.lineIndex,
            text: line.text,
            position: {
              x: line.xPosition,
              y: line.yPosition,
              page: line.pageNumber,
            },
            isStartingLine: line.isStartingLine,
          })),
        },
        metadata: {
          distance: Math.sqrt(
            Math.pow(startingPoint.xPosition - citation.targetX, 2) +
              Math.pow(startingPoint.yPosition - citation.targetY, 2)
          ),
          processedAt: new Date().toISOString(),
        },
      };

      builtReferences.push(reference);
      successCount++;
      console.log(
        `✅ Successfully built reference for ${citation.citationDestination} (ID: ${citation.annotationId})`
      );
    } catch (error) {
      console.error(
        `❌ Failed to build reference for ${citation.citationDestination} (ID: ${citation.annotationId}): ${error.message}`
      );
      failCount++;
    }
  }

  // Step 4: Create final result
  const result = {
    references: builtReferences,
    metadata: {
      pdfPath: pdfPath,
      referenceFilePath: referenceFilePath,
      totalCitations: citations.length,
      successfulReferences: successCount,
      failedReferences: failCount,
      successRate: `${((successCount / citations.length) * 100).toFixed(1)}%`,
      totalReferenceLines: referenceLines.length,
      extractedAt: new Date().toISOString(),
    },
  };

  // Step 5: Save results if output path provided
  if (outputPath) {
    if (!fs.existsSync("./debug")) {
      fs.mkdirSync("./debug", { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`💾 Saved built references to ${outputPath}`);
  }

  console.log(`\n🎉 Final Results:`);
  console.log(`   Total Citations: ${citations.length}`);
  console.log(`   Successful References: ${successCount}`);
  console.log(`   Failed References: ${failCount}`);
  console.log(`   Success Rate: ${result.metadata.successRate}`);

  // Show sample results
  if (builtReferences.length > 0) {
    console.log(`\n📋 Sample built references (first 3):`);
    builtReferences.slice(0, 3).forEach((ref, index) => {
      console.log(`   ${index + 1}. Annotation ID: ${ref.annotationId}`);
      console.log(`      Citation Destination: ${ref.citationDestination}`);
      console.log(
        `      Target: Page ${
          ref.targetPage
        } at (${ref.targetPosition.x.toFixed(
          1
        )}, ${ref.targetPosition.y.toFixed(1)})`
      );
      console.log(
        `      Lines: ${ref.reference.lineCount} (${ref.reference.characterCount} chars, ${ref.reference.wordCount} words)`
      );
      console.log(
        `      Text: "${ref.reference.fullText.substring(0, 100)}${
          ref.reference.fullText.length > 100 ? "..." : ""
        }"`
      );
      console.log("");
    });
  }

  return result;
}

// Test function
async function testExtractReferences() {
  console.log("🧪 Testing extractReferencesFromFile function...\n");

  const testCases = [
    // { pdf: "./1.pdf", refFile: "./debug/references_1.json" },
    { pdf: "./2.pdf", refFile: "./debug/references_2.json" },
    // { pdf: "./3.pdf", refFile: "./debug/references_3.json" },
    // { pdf: "./4.pdf", refFile: "./debug/references_4.json" },
  ];

  for (const testCase of testCases) {
    try {
      if (fs.existsSync(testCase.refFile)) {
        console.log(`\n=== Testing ${testCase.pdf} ===`);
        const result = await extractReferencesFromFile(
          testCase.pdf,
          testCase.refFile,
          `./debug/built_references_${testCase.pdf
            .replace("./", "")
            .replace(".pdf", "")}.json`
        );
        console.log(
          `✅ Completed ${testCase.pdf}: ${result.metadata.successfulReferences}/${result.metadata.totalCitations} references built`
        );
      } else {
        console.log(
          `⚠️ Skipping ${testCase.pdf} - reference file ${testCase.refFile} not found`
        );
      }
    } catch (error) {
      console.error(`❌ Error processing ${testCase.pdf}:`, error.message);
    }
  }
}

// Export functions
export { detectStartingPoint, buildReferenceText, extractReferencesFromFile };

// Test the functions
testExtractReferences().catch(console.error);
