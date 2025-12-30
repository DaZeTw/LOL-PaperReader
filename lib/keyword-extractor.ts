import * as pdfjsLib from 'pdfjs-dist';
import {
  TrieTermMatcher,
  aggregateMatches,
  categorizeTerm,
  type DraftTerm,
  type MatchedTerm,
  type AggregatedMatch
} from './trie-term-matcher';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

/**
 * Interface for an extracted keyword with full term data
 */
export interface ExtractedKeyword {
  keyword: string
  count: number
  category: string
  url?: string
  shortDefinition?: string
}

/**
 * Interface for the extraction result
 */
export interface ExtractionResult {
  keywords: ExtractedKeyword[]
  totalKeywords: number
  numPages: number
  matcherStats?: {
    numTerms: number
    maxDepth: number
    buildTimeMs: number
  }
}

/**
 * Interface for page text extraction result
 */
export interface PageText {
  pageNum: number
  text: string
}

/**
 * Interface for text extraction result
 */
export interface TextExtractionResult {
  pages: PageText[]
  fullText: string
  numPages: number
}

// Cache for loaded draft terms
let cachedDraftTerms: DraftTerm[] | null = null
let cachedMatcher: TrieTermMatcher | null = null

/**
 * Load draft concepts from the JSON file
 */
async function loadDraftTerms(): Promise<DraftTerm[]> {
  if (cachedDraftTerms) {
    console.log('[KeywordExtractor] Using cached draft terms');
    return cachedDraftTerms;
  }

  try {
    console.log('[KeywordExtractor] Loading draft concepts...');
    const response = await fetch('/draft_concepts_v1_lv0123.json');
    if (!response.ok) {
      throw new Error(`Failed to load draft concepts: ${response.status}`);
    }
    cachedDraftTerms = await response.json();
    console.log(`[KeywordExtractor] Loaded ${cachedDraftTerms!.length} draft concepts`);
    return cachedDraftTerms!;
  } catch (error) {
    console.error('[KeywordExtractor] Error loading draft concepts:', error);
    // Return empty array - will use fallback matching
    return [];
  }
}

/**
 * Get or create the Trie matcher instance
 */
async function getMatcher(): Promise<TrieTermMatcher | null> {
  if (cachedMatcher) {
    return cachedMatcher;
  }

  const terms = await loadDraftTerms();
  if (terms.length === 0) {
    return null;
  }

  console.log('[KeywordExtractor] Building Trie matcher...');
  cachedMatcher = new TrieTermMatcher(terms);
  return cachedMatcher;
}

/**
 * Legacy keyword categories (fallback when draft terms unavailable)
 * Organized by category for better display
 */
const FALLBACK_KEYWORD_CATEGORIES: Record<string, string[]> = {
  'Machine Learning': [
    'machine learning', 'deep learning', 'neural network', 'neural networks',
    'supervised learning', 'unsupervised learning', 'reinforcement learning',
    'transfer learning', 'representation learning', 'feature extraction',
    'classification', 'regression', 'clustering', 'optimization',
    'gradient descent', 'backpropagation', 'overfitting', 'regularization'
  ],
  'Neural Architectures': [
    'transformer', 'transformers', 'attention mechanism', 'self-attention',
    'convolutional neural network', 'cnn', 'recurrent neural network', 'rnn',
    'lstm', 'gru', 'autoencoder', 'variational autoencoder', 'vae',
    'generative adversarial network', 'gan', 'diffusion model', 'diffusion models'
  ],
  'NLP & Language Models': [
    'natural language processing', 'nlp', 'language model', 'language models',
    'bert', 'gpt', 'embedding', 'embeddings', 'tokenization', 'word2vec',
    'pre-training', 'pretraining', 'fine-tuning', 'finetuning',
    'text generation', 'sentiment analysis', 'named entity recognition'
  ],
  'Computer Vision': [
    'computer vision', 'image classification', 'object detection',
    'image segmentation', 'semantic segmentation', 'instance segmentation',
    'feature map', 'convolution', 'pooling', 'vision transformer'
  ],
  'AI Concepts': [
    'artificial intelligence', 'inference', 'training', 'model',
    'dataset', 'benchmark', 'evaluation', 'accuracy', 'precision', 'recall',
    'loss function', 'cross-entropy', 'softmax', 'activation function'
  ]
};

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get the category for a keyword (fallback method)
 */
function getCategoryForKeyword(keyword: string): string {
  const lowerKeyword = keyword.toLowerCase();
  for (const [category, keywords] of Object.entries(FALLBACK_KEYWORD_CATEGORIES)) {
    if (keywords.some(k => k.toLowerCase() === lowerKeyword)) {
      return category;
    }
  }
  return 'Other';
}

/**
 * Convert a keyword to title case for display
 */
function toTitleCase(keyword: string): string {
  return keyword
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Find keywords using fallback method (when Trie matcher unavailable)
 */
function findKeywordsFallback(text: string): ExtractedKeyword[] {
  const lowerText = text.toLowerCase();
  const foundKeywords = new Map<string, ExtractedKeyword>();
  const allKeywords = Object.values(FALLBACK_KEYWORD_CATEGORIES).flat();

  for (const keyword of allKeywords) {
    const lowerKeyword = keyword.toLowerCase();
    const regex = new RegExp(`\\b${escapeRegex(lowerKeyword)}\\b`, 'gi');
    const matches = lowerText.match(regex);

    if (matches && matches.length > 0) {
      const displayName = toTitleCase(keyword);
      const baseKeyword = displayName.replace(/s$/i, '');

      if (foundKeywords.has(baseKeyword)) {
        const existing = foundKeywords.get(baseKeyword)!;
        existing.count += matches.length;
      } else if (foundKeywords.has(displayName)) {
        const existing = foundKeywords.get(displayName)!;
        existing.count += matches.length;
      } else {
        foundKeywords.set(displayName, {
          keyword: displayName,
          count: matches.length,
          category: getCategoryForKeyword(keyword)
        });
      }
    }
  }

  return Array.from(foundKeywords.values()).sort((a, b) => b.count - a.count);
}

/**
 * Extract text from a PDF file
 */
export async function extractTextFromPDF(pdfUrl: string): Promise<TextExtractionResult> {
  try {
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;

    const pages: PageText[] = [];
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ');

      pages.push({
        pageNum: i,
        text: pageText
      });
      fullText += pageText + ' ';
    }

    return { pages, fullText, numPages: pdf.numPages };
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw error;
  }
}

/**
 * Extract keywords from a PDF file using Trie-based matching
 * Falls back to legacy method if draft terms are unavailable
 */
export async function extractKeywordsFromPDF(pdfUrl: string): Promise<ExtractionResult> {
  console.log('[KeywordExtractor] Starting keyword extraction for:', pdfUrl);

  // Extract text from PDF
  const { fullText, numPages } = await extractTextFromPDF(pdfUrl);
  console.log(`[KeywordExtractor] Extracted ${fullText.length} characters from ${numPages} pages`);

  // Try to get the Trie matcher
  const matcher = await getMatcher();

  if (matcher) {
    // Use Trie-based matching with draft concepts
    console.log('[KeywordExtractor] Using Trie-based matching');
    const matches = matcher.match(fullText);
    const aggregated = aggregateMatches(matches);

    // Convert to ExtractedKeyword format with categories
    const keywords: ExtractedKeyword[] = aggregated.map(match => ({
      keyword: match.termName,
      count: match.count,
      category: categorizeTerm(match),
      url: match.url,
      shortDefinition: match.shortDefinition
    }));

    const stats = matcher.getStats();
    console.log(`[KeywordExtractor] Found ${keywords.length} unique keywords (${aggregated.reduce((sum, m) => sum + m.count, 0)} total)`);

    return {
      keywords,
      numPages,
      totalKeywords: aggregated.reduce((sum, m) => sum + m.count, 0),
      matcherStats: stats
    };
  } else {
    // Fallback to legacy keyword matching
    console.log('[KeywordExtractor] Using fallback keyword matching');
    const keywords = findKeywordsFallback(fullText);

    return {
      keywords,
      numPages,
      totalKeywords: keywords.reduce((sum, k) => sum + k.count, 0)
    };
  }
}

/**
 * Re-export types for convenience
 */
export type { DraftTerm, MatchedTerm, AggregatedMatch };
