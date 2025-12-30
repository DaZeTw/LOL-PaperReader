/**
 * Concept Refiner for Academic Keyword Refinement
 * 
 * Post-processes extracted keywords into a high-precision academic concept list.
 * Uses multi-factor scoring, synonym merging, and MMR-based diversity selection.
 * 
 * @module concept-refiner
 */

import type { ExtractedKeyword } from './keyword-extractor';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Options for the concept refinement process
 */
export interface RefinerOptions {
    /** Maximum number of concepts to return (default: 20) */
    maxConcepts: number;
    /** Weight for ontology alignment score (default: 0.4) */
    ontologyWeight: number;
    /** Penalty for generic/boilerplate terms (default: 0.3) */
    genericPenalty: number;
    /** Minimum words per concept (default: 2) */
    minWordCount: number;
    /** Maximum words per concept (default: 5) */
    maxWordCount: number;
    /** MMR diversity weight (default: 0.3) */
    diversityFactor: number;
}

/**
 * A refined academic concept with scoring metadata
 */
export interface RefinedConcept {
    /** Canonical concept name (noun phrase) */
    concept: string;
    /** Combined relevance score [0, 1] */
    score: number;
    /** Whether this term matches the domain ontology */
    isOntologyAligned: boolean;
    /** Occurrence count in the document */
    frequency: number;
    /** Domain category */
    category: string;
    /** Ontology URL if available */
    url?: string;
    /** Short definition from ontology */
    shortDefinition?: string;
}

/**
 * Internal scored keyword during refinement
 */
interface ScoredKeyword extends ExtractedKeyword {
    score: number;
    wordCount: number;
    isOntologyAligned: boolean;
    isGeneric: boolean;
    normalizedForm: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default refinement options
 */
export const DEFAULT_REFINER_OPTIONS: RefinerOptions = {
    maxConcepts: 20,
    ontologyWeight: 0.4,
    genericPenalty: 0.3,
    minWordCount: 2,
    maxWordCount: 5,
    diversityFactor: 0.3,
};

/**
 * Generic/boilerplate academic terms to penalize
 * These appear frequently but don't convey domain-specific meaning
 */
const GENERIC_TERMS = new Set([
    'research', 'study', 'method', 'approach', 'analysis', 'data',
    'result', 'system', 'model', 'problem', 'solution', 'framework',
    'technique', 'process', 'application', 'performance', 'evaluation',
    'experiment', 'paper', 'work', 'field', 'area', 'domain',
    'information', 'knowledge', 'concept', 'theory', 'principle',
    'structure', 'function', 'feature', 'property', 'characteristic',
    'aspect', 'factor', 'element', 'component', 'part',
    'type', 'kind', 'form', 'level', 'degree',
    'effect', 'impact', 'influence', 'role', 'relationship',
    'development', 'implementation', 'design', 'construction', 'creation',
    'use', 'usage', 'utilization', 'case', 'example',
]);

/**
 * Common academic phrase patterns that are too generic
 */
const GENERIC_PATTERNS = [
    /^(the|a|an)\s+/i,
    /\s+(method|approach|technique|system|framework)$/i,
    /^(this|our|their|the)\s+/i,
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalize a term to lowercase with trimmed whitespace
 */
function normalizeText(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Count words in a term
 */
function countWords(text: string): number {
    return text.trim().split(/\s+/).length;
}

/**
 * Simple lemmatization - remove common suffixes
 */
function simpleLemma(word: string): string {
    const lower = word.toLowerCase();

    // Handle common plural/verbal forms
    if (lower.endsWith('ies') && lower.length > 4) {
        return lower.slice(0, -3) + 'y';
    }
    if (lower.endsWith('es') && lower.length > 3) {
        const stem = lower.slice(0, -2);
        if (stem.endsWith('s') || stem.endsWith('x') || stem.endsWith('z') ||
            stem.endsWith('ch') || stem.endsWith('sh')) {
            return stem;
        }
        return lower.slice(0, -1);
    }
    if (lower.endsWith('s') && lower.length > 2 && !lower.endsWith('ss')) {
        return lower.slice(0, -1);
    }
    if (lower.endsWith('ing') && lower.length > 5) {
        return lower.slice(0, -3);
    }
    if (lower.endsWith('ed') && lower.length > 4) {
        return lower.slice(0, -2);
    }

    return lower;
}

/**
 * Lemmatize a phrase (each word)
 */
function lemmatizePhrase(phrase: string): string {
    return phrase
        .split(/\s+/)
        .map(word => simpleLemma(word))
        .join(' ');
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Calculate similarity between two strings (0-1)
 */
function stringSimilarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Calculate word overlap similarity between two phrases
 */
function wordOverlapSimilarity(a: string, b: string): number {
    const wordsA = new Set(normalizeText(a).split(/\s+/));
    const wordsB = new Set(normalizeText(b).split(/\s+/));

    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;

    return union === 0 ? 0 : intersection / union;
}

/**
 * Check if a term is generic/boilerplate
 */
function isGenericTerm(term: string): boolean {
    const normalized = normalizeText(term);
    const words = normalized.split(/\s+/);

    // Single word in generic list
    if (words.length === 1 && GENERIC_TERMS.has(words[0])) {
        return true;
    }

    // Check generic patterns
    for (const pattern of GENERIC_PATTERNS) {
        if (pattern.test(normalized)) {
            return true;
        }
    }

    // If most words are generic, the phrase is generic
    const genericWordCount = words.filter(w => GENERIC_TERMS.has(w)).length;
    if (words.length > 1 && genericWordCount >= words.length * 0.5) {
        return true;
    }

    return false;
}

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate ontology alignment score
 * @returns 1.0 if term has URL (from ontology), 0.0 otherwise
 */
function calculateOntologyScore(keyword: ExtractedKeyword): number {
    return keyword.url ? 1.0 : 0.0;
}

/**
 * Calculate length score - prefers 2-4 word phrases
 * Score = 1 - |wordCount - 3| / 3
 */
function calculateLengthScore(wordCount: number): number {
    const optimalLength = 3;
    const deviation = Math.abs(wordCount - optimalLength);
    return Math.max(0, 1 - deviation / 3);
}

/**
 * Calculate frequency score - log normalized
 * Score = log(1 + count) / log(1 + maxCount)
 */
function calculateFrequencyScore(count: number, maxCount: number): number {
    if (maxCount <= 1) return count > 0 ? 1 : 0;
    return Math.log(1 + count) / Math.log(1 + maxCount);
}

/**
 * Calculate specificity score - longer terms are more specific
 */
function calculateSpecificityScore(wordCount: number, maxWordCount: number): number {
    return wordCount / Math.max(maxWordCount, 1);
}

/**
 * Calculate combined score for a keyword
 */
function calculateCombinedScore(
    keyword: ExtractedKeyword,
    maxCount: number,
    maxWordCount: number,
    options: RefinerOptions
): ScoredKeyword {
    const wordCount = countWords(keyword.keyword);
    const isOntologyAligned = !!keyword.url;
    const isGeneric = isGenericTerm(keyword.keyword);

    // Individual scores
    const ontologyScore = calculateOntologyScore(keyword);
    const lengthScore = calculateLengthScore(wordCount);
    const frequencyScore = calculateFrequencyScore(keyword.count, maxCount);
    const specificityScore = calculateSpecificityScore(wordCount, maxWordCount);

    // Weighted combination
    let score =
        options.ontologyWeight * ontologyScore +
        0.20 * lengthScore +
        0.20 * frequencyScore +
        0.10 * specificityScore;

    // Apply generic penalty
    if (isGeneric) {
        score -= options.genericPenalty;
    }

    // Clamp to [0, 1]
    score = Math.max(0, Math.min(1, score));

    return {
        ...keyword,
        score,
        wordCount,
        isOntologyAligned,
        isGeneric,
        normalizedForm: lemmatizePhrase(normalizeText(keyword.keyword)),
    };
}

// ============================================================================
// SYNONYM MERGING
// ============================================================================

/**
 * Group similar keywords together and merge into canonical forms
 */
function mergeSynonyms(keywords: ScoredKeyword[]): ScoredKeyword[] {
    const groups: ScoredKeyword[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < keywords.length; i++) {
        if (used.has(i)) continue;

        const group: ScoredKeyword[] = [keywords[i]];
        used.add(i);

        for (let j = i + 1; j < keywords.length; j++) {
            if (used.has(j)) continue;

            const kw1 = keywords[i];
            const kw2 = keywords[j];

            // Check if they should be merged
            const shouldMerge =
                // Same lemmatized form
                kw1.normalizedForm === kw2.normalizedForm ||
                // High string similarity
                stringSimilarity(kw1.normalizedForm, kw2.normalizedForm) > 0.85 ||
                // Same category and high word overlap
                (kw1.category === kw2.category && wordOverlapSimilarity(kw1.keyword, kw2.keyword) > 0.6);

            if (shouldMerge) {
                group.push(keywords[j]);
                used.add(j);
            }
        }

        groups.push(group);
    }

    // Select canonical form from each group
    return groups.map(group => {
        // Sort by: ontology aligned first, then higher score, then longer term
        group.sort((a, b) => {
            if (a.isOntologyAligned !== b.isOntologyAligned) {
                return a.isOntologyAligned ? -1 : 1;
            }
            if (a.score !== b.score) {
                return b.score - a.score;
            }
            return b.wordCount - a.wordCount;
        });

        const canonical = group[0];

        // Combine counts from all group members
        const totalCount = group.reduce((sum, kw) => sum + kw.count, 0);

        // Take the highest score
        const maxScore = Math.max(...group.map(kw => kw.score));

        return {
            ...canonical,
            count: totalCount,
            score: maxScore,
        };
    });
}

// ============================================================================
// DIVERSITY SELECTION (MMR)
// ============================================================================

/**
 * Select diverse concepts using Maximal Marginal Relevance
 */
function selectDiverseConcepts(
    candidates: ScoredKeyword[],
    k: number,
    diversityWeight: number
): ScoredKeyword[] {
    if (candidates.length <= k) return candidates;

    const selected: ScoredKeyword[] = [];
    const remaining = [...candidates];

    // Sort by score and select the highest first
    remaining.sort((a, b) => b.score - a.score);
    selected.push(remaining.shift()!);

    while (selected.length < k && remaining.length > 0) {
        let bestIdx = 0;
        let bestMMR = -Infinity;

        for (let i = 0; i < remaining.length; i++) {
            const relevance = remaining[i].score;

            // Calculate max similarity to already selected concepts
            const maxSimilarity = Math.max(
                ...selected.map(s => wordOverlapSimilarity(s.keyword, remaining[i].keyword))
            );

            // MMR formula: λ * relevance - (1 - λ) * maxSimilarity
            const mmr = (1 - diversityWeight) * relevance - diversityWeight * maxSimilarity;

            if (mmr > bestMMR) {
                bestMMR = mmr;
                bestIdx = i;
            }
        }

        selected.push(remaining.splice(bestIdx, 1)[0]);
    }

    return selected;
}

// ============================================================================
// MAIN REFINER FUNCTION
// ============================================================================

/**
 * Refine extracted keywords into high-precision academic concepts
 * 
 * @param keywords - Raw keywords from extraction
 * @param options - Refinement options
 * @returns Refined, ranked list of academic concepts
 */
export function refineConcepts(
    keywords: ExtractedKeyword[],
    options: Partial<RefinerOptions> = {}
): RefinedConcept[] {
    const opts = { ...DEFAULT_REFINER_OPTIONS, ...options };

    console.log(`[ConceptRefiner] Starting refinement of ${keywords.length} keywords`);

    // Step 1: Filter by word count
    const filtered = keywords.filter(kw => {
        const wordCount = countWords(kw.keyword);
        return wordCount >= opts.minWordCount && wordCount <= opts.maxWordCount;
    });

    console.log(`[ConceptRefiner] After word count filter: ${filtered.length} keywords`);

    if (filtered.length === 0) {
        // Fallback: if no multi-word phrases, include single words
        const singleWords = keywords.filter(kw => countWords(kw.keyword) === 1);
        if (singleWords.length > 0) {
            console.log(`[ConceptRefiner] Fallback to single words: ${singleWords.length}`);
            filtered.push(...singleWords.slice(0, opts.maxConcepts));
        }
    }

    // Step 2: Calculate scores
    const maxCount = Math.max(...filtered.map(kw => kw.count), 1);
    const maxWordCount = Math.max(...filtered.map(kw => countWords(kw.keyword)), 1);

    const scored = filtered.map(kw =>
        calculateCombinedScore(kw, maxCount, maxWordCount, opts)
    );

    // Step 3: Merge synonyms
    const merged = mergeSynonyms(scored);
    console.log(`[ConceptRefiner] After synonym merge: ${merged.length} concepts`);

    // Step 4: Sort by score
    merged.sort((a, b) => b.score - a.score);

    // Step 5: Apply MMR diversity selection
    const diverse = selectDiverseConcepts(merged, opts.maxConcepts, opts.diversityFactor);
    console.log(`[ConceptRefiner] After diversity selection: ${diverse.length} concepts`);

    // Step 6: Convert to RefinedConcept format
    const refined: RefinedConcept[] = diverse.map(kw => ({
        concept: kw.keyword,
        score: kw.score,
        isOntologyAligned: kw.isOntologyAligned,
        frequency: kw.count,
        category: kw.category,
        url: kw.url,
        shortDefinition: kw.shortDefinition,
    }));

    console.log(`[ConceptRefiner] Final refined concepts: ${refined.length}`);

    return refined;
}

/**
 * Quick check if refinement is likely to produce useful results
 */
export function canRefine(keywords: ExtractedKeyword[]): boolean {
    return keywords.some(kw => countWords(kw.keyword) >= 2);
}
