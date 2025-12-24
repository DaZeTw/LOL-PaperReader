/**
 * Extract context sentences around a keyword occurrence in text
 * @param {string} text - The full text
 * @param {string} keyword - The keyword to find context for
 * @param {number} sentenceCount - Number of sentences before/after to include
 * @returns {string} - Context with the keyword
 */
export function extractContext(text, keyword, sentenceCount = 1) {
    const lowerText = text.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    const keywordIndex = lowerText.indexOf(lowerKeyword);

    if (keywordIndex === -1) {
        return `"${keyword}" not found in text.`;
    }

    // Find sentence boundaries
    const sentenceEnders = /[.!?]+/g;
    const sentences = [];
    let lastEnd = 0;
    let match;

    while ((match = sentenceEnders.exec(text)) !== null) {
        sentences.push({
            text: text.slice(lastEnd, match.index + match[0].length).trim(),
            start: lastEnd,
            end: match.index + match[0].length
        });
        lastEnd = match.index + match[0].length;
    }

    // Add remaining text as a sentence if exists
    if (lastEnd < text.length) {
        sentences.push({
            text: text.slice(lastEnd).trim(),
            start: lastEnd,
            end: text.length
        });
    }

    // Find which sentence contains the keyword
    let keywordSentenceIdx = sentences.findIndex(
        s => s.start <= keywordIndex && keywordIndex < s.end
    );

    if (keywordSentenceIdx === -1) {
        // Fallback: return text around the keyword
        const start = Math.max(0, keywordIndex - 100);
        const end = Math.min(text.length, keywordIndex + keyword.length + 100);
        return '...' + text.slice(start, end) + '...';
    }

    // Get surrounding sentences
    const startIdx = Math.max(0, keywordSentenceIdx - sentenceCount);
    const endIdx = Math.min(sentences.length - 1, keywordSentenceIdx + sentenceCount);

    const contextSentences = sentences.slice(startIdx, endIdx + 1).map(s => s.text);
    return contextSentences.join(' ');
}

/**
 * Find all occurrences of keywords in text
 * @param {string} text - The full text
 * @param {string[]} keywords - Array of keywords to find
 * @returns {Array<{keyword: string, positions: number[]}>} - Occurrences
 */
export function findKeywordOccurrences(text, keywords) {
    const lowerText = text.toLowerCase();
    const results = [];

    for (const keyword of keywords) {
        const lowerKeyword = keyword.toLowerCase();
        const positions = [];
        let pos = 0;

        while ((pos = lowerText.indexOf(lowerKeyword, pos)) !== -1) {
            positions.push(pos);
            pos += lowerKeyword.length;
        }

        if (positions.length > 0) {
            results.push({ keyword, positions });
        }
    }

    return results;
}

/**
 * Escape special regex characters in a string
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
export function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
