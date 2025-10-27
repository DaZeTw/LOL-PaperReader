const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

/**
 * Cleans and normalizes reference text for better search results
 */
function cleanReferenceForSearch(referenceText) {
  return (
    referenceText
      // Remove citation numbers like [1], [11], etc.
      .replace(/^\s*\[\d+\]\s*/, "")
      // Remove numbered list markers like "1. ", "11. "
      .replace(/^\s*\d+\.\s*/, "")
      // Remove extra whitespace and normalize
      .replace(/\s+/g, " ")
      // Remove common PDF artifacts
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, " ")
      // Remove trailing dots and clean up
      .replace(/\.\s*$/, "")
      .trim()
  );
}

/**
 * Extracts key components from a reference for better search
 */
function extractReferenceComponents(referenceText) {
  const cleaned = cleanReferenceForSearch(referenceText);

  // Try to extract authors, title, year, and venue
  const patterns = {
    // Author-year format: "Author, A. (2020). Title. Venue."
    authorYear: /^([^.]+?)\s*\((\d{4})\)\s*\.?\s*([^.]+?)\.?\s*(.+)?$/,
    // Title first format: "Title. Author, Year. Venue."
    titleFirst: /^([^.]+?)\.\s*([^,]+),\s*(\d{4})\s*\.?\s*(.+)?$/,
    // Simple format: "Author Title Year Venue"
    simple: /^(.+?)\s+(\d{4})\b(.*)$/,
  };

  for (const [format, pattern] of Object.entries(patterns)) {
    const match = cleaned.match(pattern);
    if (match) {
      switch (format) {
        case "authorYear":
          return {
            authors: match[1],
            year: match[2],
            title: match[3],
            venue: match[4] || "",
            format,
          };
        case "titleFirst":
          return {
            title: match[1],
            authors: match[2],
            year: match[3],
            venue: match[4] || "",
            format,
          };
        case "simple":
          return {
            authors: match[1],
            year: match[2],
            title: "",
            venue: match[3] || "",
            format,
          };
      }
    }
  }

  return {
    authors: "",
    title: "",
    year: "",
    venue: cleaned,
    format: "unknown",
  };
}

/**
 * Creates an optimized search query for Google Scholar
 */
function createScholarQuery(referenceText) {
  const components = extractReferenceComponents(referenceText);

  // Strategy: Use the most distinctive parts for search
  const queryParts = [];

  // Add title in quotes if we have it and it's substantial
  if (components.title && components.title.length > 10) {
    queryParts.push(`"${components.title}"`);
  }

  // Add authors (first few words to avoid long author lists)
  if (components.authors) {
    const authorWords = components.authors.split(/\s+/).slice(0, 3);
    queryParts.push(authorWords.join(" "));
  }

  // Add year if available
  if (components.year) {
    queryParts.push(components.year);
  }

  // If we don't have good components, use the cleaned text directly
  if (queryParts.length === 0) {
    const cleaned = cleanReferenceForSearch(referenceText);
    // Take first 100 characters to avoid overly long queries
    queryParts.push(cleaned.substring(0, 100));
  }

  return queryParts.join(" ").trim();
}

/**
 * Generates Google Scholar search URL
 */
function generateScholarUrl(query) {
  const encodedQuery = encodeURIComponent(query);
  const baseUrl = "https://scholar.google.com/scholar";
  const params = new URLSearchParams({
    q: query,
    hl: "en",
    output: "gsb", // For bibliographic format
    oi: "gsr-r", // For reference search
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Fetch content from URL with proper headers
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === "https:" ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        Connection: "keep-alive",
      },
    };

    const req = client.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.end();
  });
}

/**
 * Extract search results from Scholar HTML
 */
function extractScholarResults(html) {
  const results = [];

  try {
    // Basic regex patterns to extract scholar results
    const titlePattern =
      /<h3[^>]*class="gs_rt"[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g;
    const authorPattern = /<div[^>]*class="gs_a"[^>]*>(.*?)<\/div>/g;
    const snippetPattern = /<span[^>]*class="gs_rs"[^>]*>(.*?)<\/span>/g;
    const citationPattern =
      /<a[^>]*href="\/scholar\?cites=([^"]*)"[^>]*>Cited by (\d+)<\/a>/g;

    let titleMatch;
    let index = 0;

    while ((titleMatch = titlePattern.exec(html)) !== null && index < 5) {
      const result = {
        index: index + 1,
        title: titleMatch[2].replace(/<[^>]*>/g, "").trim(),
        url: titleMatch[1],
        authors: "",
        snippet: "",
        citedBy: 0,
      };

      // Try to find corresponding author info
      authorPattern.lastIndex = titleMatch.index;
      const authorMatch = authorPattern.exec(html);
      if (authorMatch && authorMatch.index < titleMatch.index + 1000) {
        result.authors = authorMatch[1].replace(/<[^>]*>/g, "").trim();
      }

      // Try to find snippet
      snippetPattern.lastIndex = titleMatch.index;
      const snippetMatch = snippetPattern.exec(html);
      if (snippetMatch && snippetMatch.index < titleMatch.index + 2000) {
        result.snippet = snippetMatch[1].replace(/<[^>]*>/g, "").trim();
      }

      // Try to find citation count
      citationPattern.lastIndex = titleMatch.index;
      const citationMatch = citationPattern.exec(html);
      if (citationMatch && citationMatch.index < titleMatch.index + 2000) {
        result.citedBy = parseInt(citationMatch[2]) || 0;
      }

      results.push(result);
      index++;
    }
  } catch (error) {
    console.warn("Error extracting results:", error.message);
  }

  return results;
}

/**
 * Processes a single citation and fetches scholar search results
 */
async function processCitationWithFetch(citation, delay = 1000) {
  try {
    const query = createScholarQuery(citation.referenceText);
    const scholarUrl = generateScholarUrl(query);

    console.log(`🔍 Fetching: ${citation.citationId}`);

    // Add delay to avoid rate limiting
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const response = await fetchUrl(scholarUrl);

    if (response.statusCode === 200) {
      const results = extractScholarResults(response.body);

      return {
        citationId: citation.citationId,
        originalText: citation.referenceText,
        searchQuery: query,
        scholarUrl: scholarUrl,
        fetchSuccess: true,
        statusCode: response.statusCode,
        searchResults: results,
        resultCount: results.length,
        fetchedAt: new Date().toISOString(),
      };
    } else {
      return {
        citationId: citation.citationId,
        originalText: citation.referenceText,
        searchQuery: query,
        scholarUrl: scholarUrl,
        fetchSuccess: false,
        statusCode: response.statusCode,
        searchResults: [],
        resultCount: 0,
        error: `HTTP ${response.statusCode}`,
        fetchedAt: new Date().toISOString(),
      };
    }
  } catch (error) {
    return {
      citationId: citation.citationId,
      originalText: citation.referenceText,
      searchQuery: createScholarQuery(citation.referenceText),
      scholarUrl: generateScholarUrl(
        createScholarQuery(citation.referenceText)
      ),
      fetchSuccess: false,
      statusCode: 0,
      searchResults: [],
      resultCount: 0,
      error: error.message || "Unknown error",
      fetchedAt: new Date().toISOString(),
    };
  }
}

/**
 * Main function to process citations and fetch scholar results
 */
async function generateAndFetchScholarResults(
  citationsJsonPath = "citations.json",
  outputPath = "scholar_results.json",
  fetchDelay = 2000 // 2 seconds between requests
) {
  try {
    console.log("🚀 Starting Scholar search and fetch...");

    // Check if citations file exists
    if (!fs.existsSync(citationsJsonPath)) {
      console.error(`❌ Citations file not found: ${citationsJsonPath}`);
      return;
    }

    // Read citations.json
    const citationsData = JSON.parse(
      fs.readFileSync(citationsJsonPath, "utf-8")
    );

    // Filter out entries without citationId (invalid entries)
    const validCitations = citationsData.filter(
      (citation) => citation.citationId && citation.referenceText
    );

    console.log(`📚 Processing ${validCitations.length} valid citations...`);
    console.log(`⏱️  Delay between requests: ${fetchDelay}ms`);

    const results = [];

    // Process citations one by one with delay
    for (let i = 0; i < validCitations.length; i++) {
      const citation = validCitations[i];
      console.log(
        `\n[${i + 1}/${validCitations.length}] Processing: ${
          citation.citationId
        }`
      );

      const result = await processCitationWithFetch(
        citation,
        i > 0 ? fetchDelay : 0
      );

      console.log(
        `   Status: ${result.fetchSuccess ? "✅ Success" : "❌ Failed"}`
      );
      console.log(`   Results found: ${result.resultCount}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }

      results.push(result);

      // Save intermediate results every 5 citations
      if ((i + 1) % 5 === 0) {
        const tempPath = outputPath.replace(".json", "_temp.json");
        fs.writeFileSync(tempPath, JSON.stringify(results, null, 2));
        console.log(`💾 Intermediate save: ${tempPath}`);
      }
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save final results
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    // Generate summary
    const successful = results.filter((r) => r.fetchSuccess).length;
    const failed = results.length - successful;
    const totalResults = results.reduce((sum, r) => sum + r.resultCount, 0);

    console.log(`\n📊 Final Summary:`);
    console.log(`   - Total citations processed: ${results.length}`);
    console.log(`   - Successful fetches: ${successful}`);
    console.log(`   - Failed fetches: ${failed}`);
    console.log(`   - Total search results found: ${totalResults}`);
    console.log(
      `   - Average results per citation: ${(
        totalResults / successful || 0
      ).toFixed(1)}`
    );
    console.log(`   - Results saved to: ${outputPath}`);

    // Show sample results
    const successfulWithResults = results.filter(
      (r) => r.fetchSuccess && r.resultCount > 0
    );
    if (successfulWithResults.length > 0) {
      console.log(`\n🔍 Sample Search Results:`);
      const sample = successfulWithResults[0];
      console.log(`Citation: ${sample.citationId}`);
      console.log(`Query: ${sample.searchQuery}`);
      console.log(`Found ${sample.resultCount} results:`);
      sample.searchResults.slice(0, 2).forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.title}`);
        console.log(`     Authors: ${result.authors}`);
        console.log(`     Cited by: ${result.citedBy}`);
      });
    }

    return results;
  } catch (error) {
    console.error("❌ Error processing citations:", error.message);
    throw error;
  }
}

/**
 * Test function with example data and fetch
 */
async function testWithExampleAndFetch() {
  console.log("🧪 Testing with example citation fetch...\n");

  const testCitation = {
    citationId: "cite.tldr",
    sourcePage: 1,
    targetPage: 6,
    referenceText:
      "[11] Isabel Cachola, Kyle Lo, Arman Cohan, and Daniel S. Weld. 2020. TLDR: Extreme Summarization of Scientific Documents. In Findings of EMNLP.",
    extractionMethod: "numbered",
    confidence: 0.95,
    timestamp: "2025-10-26T00:00:00.000Z",
  };

  const result = await processCitationWithFetch(testCitation, 0);

  console.log("📋 Test Result:");
  console.log(`   Citation ID: ${result.citationId}`);
  console.log(`   Search Query: ${result.searchQuery}`);
  console.log(`   Fetch Success: ${result.fetchSuccess}`);
  console.log(`   Status Code: ${result.statusCode}`);
  console.log(`   Results Found: ${result.resultCount}`);

  if (result.searchResults.length > 0) {
    console.log(`   First Result: ${result.searchResults[0].title}`);
    console.log(`   Authors: ${result.searchResults[0].authors}`);
    console.log(`   Cited by: ${result.searchResults[0].citedBy}`);
  }

  return result;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--test")) {
    await testWithExampleAndFetch();
    return;
  }

  const citationsPath = args[0] || "citations.json";
  const outputPath = args[1] || "scholar_results.json";
  const delay = parseInt(args[2]) || 2000;

  try {
    await generateAndFetchScholarResults(citationsPath, outputPath, delay);
  } catch (error) {
    console.error("💥 Script failed:", error.message);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

// Export functions for use as module
module.exports = {
  generateAndFetchScholarResults,
  processCitationWithFetch,
  testWithExampleAndFetch,
  createScholarQuery,
  generateScholarUrl,
};
