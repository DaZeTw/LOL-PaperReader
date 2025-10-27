import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface CitationMetadata {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue: string;
  abstract: string;
  url: string;
  doi?: string;
  arxivId?: string;
  cachedAt: string;
}

interface ScholarSearchResult {
  title: string;
  authors: string[];
  year: number;
  venue: string;
  abstract: string;
  url: string;
  doi?: string;
  arxivId?: string;
}

/**
 * POST /api/citations/metadata
 * Fetch citation metadata from Google Scholar or cache
 */
export async function POST(request: NextRequest) {
  try {
    const { citationText, citationId } = await request.json();

    if (!citationText && !citationId) {
      return NextResponse.json({ error: "Citation text or ID required" }, { status: 400 });
    }

    // Check cache first
    const cachePath = path.join(process.cwd(), "data", "citation_cache.json");
    const cache = loadCache(cachePath);
    
    const cacheKey = citationId || generateCacheKey(citationText);
    const cached = cache[cacheKey];

    if (cached && !isCacheExpired(cached.cachedAt)) {
      console.log(`[citationMetadata] Using cached data for ${cacheKey}`);
      return NextResponse.json({ metadata: cached, fromCache: true });
    }

    // Fetch from Google Scholar
    console.log(`[citationMetadata] Fetching fresh data for: ${citationText?.substring(0, 100)}...`);
    const metadata = await fetchFromGoogleScholar(citationText);

    if (metadata) {
      // Cache the result
      const citationMetadata: CitationMetadata = {
        id: cacheKey,
        ...metadata,
        cachedAt: new Date().toISOString(),
      };

      cache[cacheKey] = citationMetadata;
      saveCache(cachePath, cache);

      return NextResponse.json({ metadata: citationMetadata, fromCache: false });
    }

    return NextResponse.json({ error: "No metadata found" }, { status: 404 });
  } catch (error) {
    console.error("[citationMetadata] Error:", error);
    return NextResponse.json({ error: "Failed to fetch metadata" }, { status: 500 });
  }
}

/**
 * GET /api/citations/metadata?q=query
 * Search for citations by query
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json({ error: "Query parameter required" }, { status: 400 });
    }

    // Check cache first
    const cachePath = path.join(process.cwd(), "data", "citation_cache.json");
    const cache = loadCache(cachePath);
    
    const cacheKey = generateCacheKey(query);
    const cached = cache[cacheKey];

    if (cached && !isCacheExpired(cached.cachedAt)) {
      console.log(`[citationMetadata] Using cached search for ${cacheKey}`);
      return NextResponse.json({ metadata: cached, fromCache: true });
    }

    // Search Google Scholar
    console.log(`[citationMetadata] Searching for: ${query}`);
    const metadata = await searchGoogleScholar(query);

    if (metadata) {
      // Cache the result
      const citationMetadata: CitationMetadata = {
        id: cacheKey,
        ...metadata,
        cachedAt: new Date().toISOString(),
      };

      cache[cacheKey] = citationMetadata;
      saveCache(cachePath, cache);

      return NextResponse.json({ metadata: citationMetadata, fromCache: false });
    }

    return NextResponse.json({ error: "No results found" }, { status: 404 });
  } catch (error) {
    console.error("[citationMetadata] Error:", error);
    return NextResponse.json({ error: "Failed to search citations" }, { status: 500 });
  }
}

/**
 * Load citation cache from file
 */
function loadCache(cachePath: string): Record<string, CitationMetadata> {
  try {
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn("[citationMetadata] Failed to load cache:", error);
  }
  return {};
}

/**
 * Save citation cache to file
 */
function saveCache(cachePath: string, cache: Record<string, CitationMetadata>) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(cachePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    console.log(`[citationMetadata] Cache saved to ${cachePath}`);
  } catch (error) {
    console.error("[citationMetadata] Failed to save cache:", error);
  }
}

/**
 * Generate cache key from citation text
 */
function generateCacheKey(text: string): string {
  // Create a simple hash of the text for caching
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 50);
}

/**
 * Check if cache entry is expired (24 hours)
 */
function isCacheExpired(cachedAt: string): boolean {
  const cacheTime = new Date(cachedAt).getTime();
  const now = new Date().getTime();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return now - cacheTime > twentyFourHours;
}

/**
 * Fetch metadata from Google Scholar using web scraping
 * Note: This is a simplified implementation. In production, you'd want to use
 * a proper Google Scholar API or a service like SerpAPI
 */
async function fetchFromGoogleScholar(citationText: string): Promise<ScholarSearchResult | null> {
  try {
    // Extract key terms from citation text
    const searchQuery = extractSearchTerms(citationText);
    
    // For now, we'll simulate the API response
    // In production, you'd integrate with a real Google Scholar API
    const mockResult = await simulateGoogleScholarSearch(searchQuery);
    
    return mockResult;
  } catch (error) {
    console.error("[citationMetadata] Google Scholar fetch error:", error);
    return null;
  }
}

/**
 * Search Google Scholar with a query
 */
async function searchGoogleScholar(query: string): Promise<ScholarSearchResult | null> {
  try {
    // For now, we'll simulate the search
    // In production, you'd integrate with a real Google Scholar API
    const mockResult = await simulateGoogleScholarSearch(query);
    
    return mockResult;
  } catch (error) {
    console.error("[citationMetadata] Google Scholar search error:", error);
    return null;
  }
}

/**
 * Extract search terms from citation text
 */
function extractSearchTerms(citationText: string): string {
  // Extract title (usually the first part before year)
  const yearMatch = citationText.match(/(\d{4})/);
  if (yearMatch) {
    const yearIndex = yearMatch.index || 0;
    const beforeYear = citationText.substring(0, yearIndex).trim();
    return beforeYear.split('.').slice(0, 2).join(' ').trim();
  }
  
  // Fallback: take first 100 characters
  return citationText.substring(0, 100).trim();
}

/**
 * Simulate Google Scholar search (replace with real API)
 */
async function simulateGoogleScholarSearch(query: string): Promise<ScholarSearchResult | null> {
  // This is a mock implementation
  // In production, replace with actual Google Scholar API integration
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock response based on query
  const mockResults: Record<string, ScholarSearchResult> = {
    "machine learning": {
      title: "Deep Learning for Natural Language Processing",
      authors: ["John Smith", "Jane Doe", "Bob Johnson"],
      year: 2023,
      venue: "Journal of Machine Learning Research",
      abstract: "This paper presents novel approaches to natural language processing using deep learning techniques...",
      url: "https://scholar.google.com/scholar?q=machine+learning",
      doi: "10.1000/example",
    },
    "neural networks": {
      title: "Advanced Neural Network Architectures",
      authors: ["Alice Brown", "Charlie Wilson"],
      year: 2022,
      venue: "Neural Computation",
      abstract: "We propose new neural network architectures that improve performance on various tasks...",
      url: "https://scholar.google.com/scholar?q=neural+networks",
      arxivId: "2201.12345",
    },
  };

  // Find best match or return first result
  const lowerQuery = query.toLowerCase();
  for (const [key, result] of Object.entries(mockResults)) {
    if (lowerQuery.includes(key)) {
      return result;
    }
  }

  // Default mock result
  return {
    title: `Research on ${query}`,
    authors: ["Author One", "Author Two"],
    year: 2023,
    venue: "International Conference on Research",
    abstract: `This paper explores various aspects of ${query} and presents novel findings...`,
    url: `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
  };
}
