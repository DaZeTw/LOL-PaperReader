import fs from "fs";
import pkg from "pdfjs-dist";

const { getDocument, GlobalWorkerOptions } = pkg;

// 🚫 Disable worker (use fake worker in Node)
GlobalWorkerOptions.workerSrc = null;

async function extractAnnotations(pdfUrl, outputPath = "./annotations.json") {
  const pdf = await getDocument(pdfUrl).promise;
  console.log(`📄 Loaded PDF with ${pdf.numPages} pages.`);

  const results = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const annotations = await page.getAnnotations();

    if (annotations.length > 0) {
      results.push({
        page: i,
        annotations: annotations.map((a) => a), // ✅ store full annotation object
      });
    }
  }

  // ✅ Save to JSON file
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`✅ Saved annotations to ${outputPath}`);

  return results;
}

// Run it
extractAnnotations("./5.pdf").catch(console.error);
