import { pdfjs } from 'react-pdf';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * Predefined keywords to search for in PDFs
 * Organized by category for better display
 */
export const KEYWORD_CATEGORIES = {
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

// Flatten keywords for easy searching
export const ALL_KEYWORDS = Object.values(KEYWORD_CATEGORIES).flat();

/**
 * Extract text from a PDF file
 * @param {string} pdfUrl - URL or path to the PDF file
 * @returns {Promise<{pages: Array<{pageNum: number, text: string}>, fullText: string}>}
 */
export async function extractTextFromPDF(pdfUrl) {
    try {
        const loadingTask = pdfjs.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;

        const pages = [];
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');

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
 * Find all keyword occurrences in text
 * @param {string} text - The text to search in
 * @param {Array<string>} keywords - Keywords to search for
 * @returns {Map<string, {count: number, keyword: string}>}
 */
export function findKeywords(text, keywords = ALL_KEYWORDS) {
    const lowerText = text.toLowerCase();
    const foundKeywords = new Map();

    for (const keyword of keywords) {
        const lowerKeyword = keyword.toLowerCase();
        // Use word boundary matching to avoid partial matches
        const regex = new RegExp(`\\b${escapeRegex(lowerKeyword)}\\b`, 'gi');
        const matches = lowerText.match(regex);

        if (matches && matches.length > 0) {
            // Normalize keyword to title case for display
            const displayName = keyword
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');

            // Merge similar keywords (e.g., 'neural network' and 'neural networks')
            const baseKeyword = displayName.replace(/s$/i, '');

            if (foundKeywords.has(baseKeyword)) {
                const existing = foundKeywords.get(baseKeyword);
                existing.count += matches.length;
            } else if (foundKeywords.has(displayName)) {
                const existing = foundKeywords.get(displayName);
                existing.count += matches.length;
            } else {
                foundKeywords.set(displayName, {
                    count: matches.length,
                    keyword: displayName,
                    category: getCategoryForKeyword(keyword)
                });
            }
        }
    }

    return foundKeywords;
}

/**
 * Get the category for a keyword
 * @param {string} keyword 
 * @returns {string}
 */
function getCategoryForKeyword(keyword) {
    const lowerKeyword = keyword.toLowerCase();
    for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
        if (keywords.some(k => k.toLowerCase() === lowerKeyword)) {
            return category;
        }
    }
    return 'Other';
}

/**
 * Escape special regex characters
 * @param {string} str 
 * @returns {string}
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract keywords from a PDF file
 * @param {string} pdfUrl - URL or path to the PDF file
 * @returns {Promise<{keywords: Array<{keyword: string, count: number, category: string}>, numPages: number}>}
 */
export async function extractKeywordsFromPDF(pdfUrl) {
    const { fullText, numPages } = await extractTextFromPDF(pdfUrl);
    const keywordMap = findKeywords(fullText);

    // Convert map to sorted array
    const keywords = Array.from(keywordMap.values())
        .sort((a, b) => b.count - a.count);

    return {
        keywords,
        numPages,
        totalKeywords: keywords.reduce((sum, k) => sum + k.count, 0)
    };
}
