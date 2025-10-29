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
 * @param {number} yTolerance - Y-coordinate tolerance for grouping (default: 2)
 * @param {number} pageNumber - Page number to assign to all lines
 * @returns {Array} Array of grouped text lines
 */
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

/**
 * Extract and test text layer from PDF
 * @param {string} pdfPath - Path to PDF file
 * @param {number} pageNum - Page number to extract (1-based, optional)
 * @param {string} outputDir - Output directory for debug files
 */
async function extractAndTestTextLayer(
  pdfPath,
  pageNum = null,
  outputDir = "./debug"
) {
  try {
    // Load PDF
    const pdf = await getDocument(pdfPath).promise;
    console.log(`📄 Loaded PDF with ${pdf.numPages} pages.`);

    // Determine which pages to process
    const pagesToProcess = pageNum
      ? [pageNum]
      : Array.from({ length: pdf.numPages }, (_, i) => i + 1);

    for (const currentPageNum of pagesToProcess) {
      console.log(`\n🔍 Processing page ${currentPageNum}...`);

      // Get page
      const page = await pdf.getPage(currentPageNum);

      // Extract text content
      const textContent = await page.getTextContent();

      console.log(
        `📝 Found ${textContent.items.length} text items on page ${currentPageNum}`
      );

      // Log first few items for inspection
      console.log("\n🔤 First 5 text items:");
      textContent.items.slice(0, 5).forEach((item, index) => {
        console.log(
          `  ${index}: "${item.str}" at (${item.transform[4].toFixed(
            1
          )}, ${item.transform[5].toFixed(1)})`
        );
      });

      // Group text by lines using your function
      const lines = groupTextByLines(textContent.items, 2, currentPageNum);

      console.log(`📊 Grouped into ${lines.length} lines`);

      // Log first few lines
      console.log("\n📋 First 5 lines:");
      lines.slice(0, 5).forEach((line, index) => {
        console.log(
          `  Line ${index}: y=${line.yPosition.toFixed(
            1
          )}, x=${line.xPosition.toFixed(1)}`
        );
        console.log(`    Text: "${line.text}"`);
        console.log(`    Items: ${line.items.length}`);
      });

      // Save detailed debug information
      const debugFile = saveLinesToFile(lines, currentPageNum, outputDir);

      // Save raw text items for comparison
      const rawItemsFile = `${outputDir}/page_${currentPageNum}_raw_items.json`;
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const rawItemsData = {
        pageNumber: currentPageNum,
        totalItems: textContent.items.length,
        extractedAt: new Date().toISOString(),
        items: textContent.items.map((item, index) => ({
          index,
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          fontName: item.fontName || "unknown",
          width: item.width || 0,
          height: item.height || Math.abs(item.transform[3]) || 0,
          transform: item.transform,
        })),
      };

      fs.writeFileSync(rawItemsFile, JSON.stringify(rawItemsData, null, 2));
      console.log(`💾 Saved raw items to ${rawItemsFile}`);

      // Show statistics
      console.log(`\n📈 Page ${currentPageNum} Statistics:`);
      console.log(`   - Raw text items: ${textContent.items.length}`);
      console.log(`   - Grouped lines: ${lines.length}`);
      console.log(
        `   - Compression ratio: ${(
          (lines.length / textContent.items.length) *
          100
        ).toFixed(1)}%`
      );

      // Show Y-position distribution
      const yPositions = textContent.items.map((item) => item.transform[5]);
      const uniqueY = [...new Set(yPositions)].sort((a, b) => b - a);
      console.log(`   - Unique Y positions: ${uniqueY.length}`);
      console.log(
        `   - Y range: ${Math.min(...yPositions).toFixed(1)} to ${Math.max(
          ...yPositions
        ).toFixed(1)}`
      );
    }

    console.log("\n✅ Text extraction and grouping test completed!");
  } catch (error) {
    console.error("❌ Error processing PDF:", error);
  }
}

/**
 * Extracts citation links and finds the 2 most common X positions of their destination references
 * @param {string} pdfPath - Path to PDF file
 * @returns {Array} Array of the 2 most common reference X positions with their counts
 */
async function getTwoMostCommonCitationX(pdfPath) {
  const pdf = await getDocument(pdfPath).promise;
  console.log(
    `📄 Analyzing citation destinations in PDF with ${pdf.numPages} pages.`
  );

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
            console.log(`⚠️ Could not resolve destination: ${ann.dest}`);
            continue;
          }

          // dest structure: [pageRef, type, x, y, ...]
          // dest[2] = x-position of the reference
          // dest[3] = y-position of the reference
          const referenceX = dest[2] ?? 0;
          const referenceY = dest[3] ?? 0;

          // Get page index for the reference
          const pageIndex = await pdf.getPageIndex(dest[0]);

          console.log(
            `🔗 Citation "${ann.dest}" -> Reference at page ${
              pageIndex + 1
            }, X=${referenceX.toFixed(1)}, Y=${referenceY.toFixed(1)}`
          );

          referenceXPositions.push({
            citationId: ann.dest,
            referenceX: referenceX,
            referenceY: referenceY,
            referencePage: pageIndex + 1,
            citationPage: pageNum,
            citationRect: ann.rect,
          });
        } catch (error) {
          console.log(
            `⚠️ Error resolving destination "${ann.dest}": ${error.message}`
          );
        }
      }
    }
  }

  console.log(
    `🔗 Found ${referenceXPositions.length} citation links with resolved destinations.`
  );

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
      targetCluster.positions.reduce((a, b) => a + b, 0) /
      targetCluster.positions.length;
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

  console.log(`🎯 Two most common reference X positions:`);
  sortedClusters.forEach((cluster, index) => {
    console.log(
      `   ${index + 1}. X = ${cluster.xPosition} (${cluster.count} references)`
    );
    console.log(
      `      Sample references: ${cluster.sampleReferences
        .map(
          (ref) =>
            `${ref.citationId} at (${ref.x}, ${ref.y}) on page ${ref.page}`
        )
        .join(", ")}`
    );
  });

  return sortedClusters;
}

async function testGetTwoMostCommonCitationX() {
  console.log("🧪 Testing getTwoMostCommonCitationX function...\n");

  const testPdfs = ["./1.pdf", "./2.pdf", "./3.pdf", "./4.pdf"];

  for (const pdfPath of testPdfs) {
    try {
      console.log(`--- Testing ${pdfPath} ---`);
      const result = await getTwoMostCommonCitationX(pdfPath);

      if (result.length > 0) {
        console.log(`✅ Success! Found ${result.length} common X positions:`);
        result.forEach((pos, index) => {
          console.log(
            `   ${index + 1}. X = ${pos.xPosition} (${pos.count} citations)`
          );
        });
      } else {
        console.log(`⚠️ No citation links found in ${pdfPath}`);
      }
      console.log(""); // Empty line for separation
    } catch (error) {
      console.error(`❌ Error testing ${pdfPath}:`, error.message);
      console.log(""); // Empty line for separation
    }
  }
}

/**
 * Main filtering function that extracts reference lines using existing functions
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputPath - Optional output path to save results
 * @returns {Object} Filtered reference lines with metadata
 */
async function extractReferenceLines(pdfPath, outputPath = null) {
  const pdf = await getDocument(pdfPath).promise;
  console.log(
    `📄 Starting reference extraction from ${pdfPath} with ${pdf.numPages} pages.`
  );

  // Step 1: Get the 2 most common X positions using existing function
  const commonXPositions = await getTwoMostCommonCitationX(pdfPath);

  if (commonXPositions.length === 0) {
    console.log("⚠️ No common X positions found for references.");
    return {
      referenceLines: [],
      metadata: { totalLines: 0, filteredLines: 0 },
    };
  }

  console.log(
    `🎯 Using ${commonXPositions.length} common X positions for filtering`
  );

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
  console.log(`📚 Found references on pages: ${referencePages.join(", ")}`);

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
        .split(/\s+/)
        .filter((word) => word.length > 0).length,
    }));

    allLinesWithIndices.push(...linesWithIndices);
  }

  console.log(
    `📝 Extracted ${allLinesWithIndices.length} total lines from reference pages`
  );

  // Step 4: Filter lines that start within (x-1, x+20) for each common X
  // AND label starting lines that are within (x-1, x+8)
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

  console.log(`🔍 Filtering lines with X ranges:`);
  xRanges.forEach((range, index) => {
    console.log(
      `   Range ${index + 1}: Filter ${range.xMin.toFixed(
        1
      )} to ${range.xMax.toFixed(
        1
      )}, Starting lines ${range.startingLineXMin.toFixed(
        1
      )} to ${range.startingLineXMax.toFixed(1)}`
    );
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

  console.log(`   Found ${filteredLines.length} lines matching X ranges`);
  console.log(`   Found ${startingLinesCount} starting lines`);

  // Step 5: Remove duplicates while preserving order (keep the first occurrence)
  const uniqueLines = [];
  const seen = new Set();

  for (const line of filteredLines) {
    const key = `${line.pageNumber}_${Math.round(
      line.yPosition
    )}_${line.text.substring(0, 50)}`;

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
  console.log(
    `📋 After removing duplicates: ${uniqueLines.length} unique lines (${finalStartingLinesCount} starting lines)`
  );

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

  // Step 7: Save results if output path provided
  if (outputPath) {
    if (!fs.existsSync("./debug")) {
      fs.mkdirSync("./debug", { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`💾 Saved filtered reference lines to ${outputPath}`);
  }

  console.log(
    `✅ Successfully extracted ${
      uniqueLines.length
    } reference lines (${finalStartingLinesCount} starting, ${
      uniqueLines.length - finalStartingLinesCount
    } continuation)`
  );

  // Show sample results with starting line labels
  console.log(`\n📋 Sample reference lines (first 5):`);
  uniqueLines.slice(0, 5).forEach((line, index) => {
    const lineType = line.isStartingLine ? "🟢 START" : "🔵 CONT";
    console.log(
      `   ${index + 1}. ${lineType} LineIndex: ${line.lineIndex}, Page ${
        line.pageNumber
      }, Y=${line.yPosition.toFixed(1)}, X=${line.xPosition.toFixed(1)}`
    );
    console.log(
      `      Text: "${line.text.substring(0, 80)}${
        line.text.length > 80 ? "..." : ""
      }"`
    );
  });

  // Show starting lines summary
  console.log(`\n🟢 Starting lines summary:`);
  const startingLines = uniqueLines.filter((line) => line.isStartingLine);
  startingLines.slice(0, 3).forEach((line, index) => {
    console.log(
      `   ${index + 1}. Line ${line.lineIndex}: "${line.text.substring(0, 60)}${
        line.text.length > 60 ? "..." : ""
      }"`
    );
  });

  return result;
}
// Test the function
async function testExtractReferenceLines() {
  console.log("🧪 Testing extractReferenceLines function...\n");

  const testPdfs = ["./2.pdf"];

  for (const pdfPath of testPdfs) {
    try {
      console.log(`\n--- Testing ${pdfPath} ---`);
      const result = await extractReferenceLines(
        pdfPath,
        `./debug/references_${pdfPath
          .replace("./", "")
          .replace(".pdf", "")}.json`
      );

      console.log(`✅ Results for ${pdfPath}:`);
      console.log(
        `   - Reference pages: ${result.metadata.referencePagesFound}`
      );
      console.log(`   - Total lines: ${result.metadata.totalLinesExtracted}`);
      console.log(`   - Filtered lines: ${result.metadata.filteredLinesCount}`);
    } catch (error) {
      console.error(`❌ Error processing ${pdfPath}:`, error.message);
    }
  }
}

// // Comment out the old test and run the new one
// // testGetTwoMostCommonCitationX().catch(console.error);
testExtractReferenceLines().catch(console.error);

// // Run only this test
// testGetTwoMostCommonCitationX().catch(console.error);

// // Test the functions
// // Update with your PDF path

// // Extract text from all pages
// // extractAndTestTextLayer(pdfPath);

// // Extract text from specific page
// const pdfPath = "./1.pdf";
// // extractAndTestTextLayer(pdfPath, 6);

// const pdfPath2 = "./2.pdf";
// const pdfPath3 = "./3.pdf";
// const pdfPath4 = "./4.pdf";
// extractAndTestTextLayer(pdfPath2, 9);
// extractAndTestTextLayer(pdfPath3, 10);
// extractAndTestTextLayer(pdfPath4, 12);
