import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

/**
 * Interface for a keyword category
 */
export interface KeywordCategory {
  name: string;
  keywords: string[];
}

/**
 * Interface for an extracted keyword
 */
export interface ExtractedKeyword {
  keyword: string;
  count: number;
  category: string;
}

/**
 * Interface for the extraction result
 */
export interface ExtractionResult {
  keywords: ExtractedKeyword[];
  totalKeywords: number;
  numPages: number;
}

/**
 * Interface for page text extraction result
 */
export interface PageText {
  pageNum: number;
  text: string;
}

/**
 * Interface for text extraction result
 */
export interface TextExtractionResult {
  pages: PageText[];
  fullText: string;
  numPages: number;
}

/**
 * Predefined keywords to search for in PDFs
 * Organized by category for better display
 */
export const KEYWORD_CATEGORIES: Record<string, string[]> = {
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
 * Flatten all keywords for easy searching
 */
export const ALL_KEYWORDS: string[] = Object.values(KEYWORD_CATEGORIES).flat();


/**
 * Escape special regex characters in a string
 * @param str - The string to escape
 * @returns The escaped string safe for use in regex
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get the category for a keyword
 * @param keyword - The keyword to categorize
 * @returns The category name or 'Other' if not found
 */
export function getCategoryForKeyword(keyword: string): string {
  const lowerKeyword = keyword.toLowerCase();
  for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
    if (keywords.some(k => k.toLowerCase() === lowerKeyword)) {
      return category;
    }
  }
  return 'Other';
}

/**
 * Convert a keyword to title case for display
 * @param keyword - The keyword to convert
 * @returns The keyword in title case
 */
export function toTitleCase(keyword: string): string {
  return keyword
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Get the base form of a keyword by removing trailing 's' for singular/plural merging
 * @param keyword - The keyword to get base form of
 * @returns The base form of the keyword
 */
export function getBaseKeyword(keyword: string): string {
  return keyword.replace(/s$/i, '');
}

/**
 * Find all keyword occurrences in text using word-boundary matching
 * @param text - The text to search in
 * @param keywords - Keywords to search for (defaults to ALL_KEYWORDS)
 * @returns Map of found keywords with their counts and categories
 */
export function findKeywords(
  text: string,
  keywords: string[] = ALL_KEYWORDS
): Map<string, ExtractedKeyword> {
  const lowerText = text.toLowerCase();
  const foundKeywords = new Map<string, ExtractedKeyword>();

  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    // Use word boundary matching to avoid partial matches
    const regex = new RegExp(`\\b${escapeRegex(lowerKeyword)}\\b`, 'gi');
    const matches = lowerText.match(regex);

    if (matches && matches.length > 0) {
      // Normalize keyword to title case for display
      const displayName = toTitleCase(keyword);

      // Get base keyword for singular/plural merging
      const baseKeyword = getBaseKeyword(displayName);

      // Check if we already have this keyword or its base form
      if (foundKeywords.has(baseKeyword)) {
        // Merge with existing base form
        const existing = foundKeywords.get(baseKeyword)!;
        existing.count += matches.length;
      } else if (foundKeywords.has(displayName)) {
        // Merge with existing display name
        const existing = foundKeywords.get(displayName)!;
        existing.count += matches.length;
      } else {
        // Check if there's an existing entry that this is a base form of
        const pluralForm = displayName + 's';
        if (foundKeywords.has(pluralForm)) {
          // Merge into the plural form entry
          const existing = foundKeywords.get(pluralForm)!;
          existing.count += matches.length;
          // Re-key to base form
          foundKeywords.delete(pluralForm);
          existing.keyword = baseKeyword;
          foundKeywords.set(baseKeyword, existing);
        } else {
          // Create new entry
          foundKeywords.set(displayName, {
            count: matches.length,
            keyword: displayName,
            category: getCategoryForKeyword(keyword)
          });
        }
      }
    }
  }

  return foundKeywords;
}


/**
 * Extract text from a PDF file
 * @param pdfUrl - URL or path to the PDF file
 * @returns Promise with pages array, full text, and page count
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
 * Extract keywords from a PDF file
 * @param pdfUrl - URL or path to the PDF file
 * @returns Promise with keywords array, page count, and total keyword occurrences
 */
export async function extractKeywordsFromPDF(pdfUrl: string): Promise<ExtractionResult> {
  const { fullText, numPages } = await extractTextFromPDF(pdfUrl);
  const keywordMap = findKeywords(fullText);

  // Convert map to sorted array (by count descending)
  const keywords = Array.from(keywordMap.values())
    .sort((a, b) => b.count - a.count);

  return {
    keywords,
    numPages,
    totalKeywords: keywords.reduce((sum, k) => sum + k.count, 0)
  };
}
