import fs from "fs";
import pkg from "pdfjs-dist";
import { ref } from "process";

const { getDocument, GlobalWorkerOptions } = pkg;

// Disable workers (Node environment)
GlobalWorkerOptions.workerSrc = null;

/**
 * Extract citation texts based on annotation rectangles
 * @param {string} pdfPath - Path to PDF file
 */
async function extractCitations(pdfPath) {
  const loadingTask = getDocument(pdfPath);
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const results = [];

  // Loop through all pages
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    // Get annotations and text content
    const annotations = await page.getAnnotations();
    const textContent = await page.getTextContent();

    // Loop through annotation layer
    for (const ann of annotations) {
      // Only process link-type citations
      if (
        ann.subtype === "Link" &&
        typeof ann.dest === "string" &&
        ann.dest.startsWith("cite.")
      ) {
        const rect = ann.rect;
        const [x1, y1, x2, y2] = rect;

        // Extract text within this rect
        const matchedTexts = [];
        for (const item of textContent.items) {
          const tx = item.transform;
          const x = tx[4];
          const y = tx[5];
          if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
            matchedTexts.push(item.str);
          }
        }

        results.push({
          page: pageNum,
          dest: ann.dest,
          rect,
          text: matchedTexts.join(" "),
        });
      }
    }
  }

  console.log("Extracted citation annotations:", results);
  return results;
}

// Example usage
(async () => {
  const pdfPath = "./1.pdf";
  const citations = await extractCitations(pdfPath);
  console.log(JSON.stringify(citations, null, 2));
})();
