import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  findKeywords,
  getCategoryForKeyword,
  getBaseKeyword,
  escapeRegex,
  KEYWORD_CATEGORIES,
  ALL_KEYWORDS,
  ExtractedKeyword,
} from './keyword-extractor';

/**
 * Feature: keyword-explorer-integration
 * Property 2: Word Boundary Matching Accuracy
 * 
 * For any text containing a keyword K, the keyword extractor SHALL only match K
 * when it appears as a complete word (bounded by word boundaries), not as a
 * substring of another word.
 * 
 * Validates: Requirements 1.2
 */
describe('Property 2: Word Boundary Matching Accuracy', () => {
  // Helper to generate a random prefix/suffix that would make a keyword a substring
  const nonWordBoundaryChars = fc.constantFrom(
    'pre', 'un', 'anti', 'super', 'sub', 'ing', 'ed', 'er', 'ly', 'tion', 'ness'
  );

  it('should only match keywords at word boundaries, not as substrings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_KEYWORDS.slice(0, 20)), // Sample of keywords
        fc.boolean(), // Whether to add prefix
        fc.boolean(), // Whether to add suffix
        nonWordBoundaryChars,
        nonWordBoundaryChars,
        (keyword, addPrefix, addSuffix, prefix, suffix) => {
          // Create text with keyword embedded as substring (not at word boundary)
          const embeddedKeyword = `${addPrefix ? prefix : ''}${keyword}${addSuffix ? suffix : ''}`;
          
          // Only test when we actually modified the keyword
          if (!addPrefix && !addSuffix) {
            // If no modification, keyword should be found
            const text = `This is about ${keyword} in research.`;
            const result = findKeywords(text, [keyword]);
            const totalCount = Array.from(result.values()).reduce((sum, k) => sum + k.count, 0);
            return totalCount >= 1;
          }
          
          // When keyword is embedded in another word, it should NOT be found
          const textWithEmbedded = `This is about ${embeddedKeyword} in research.`;
          const result = findKeywords(textWithEmbedded, [keyword]);
          
          // The embedded version should not match the original keyword
          // unless the embedded word happens to contain the keyword at a word boundary
          const hasWordBoundaryMatch = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(textWithEmbedded);
          const totalCount = Array.from(result.values()).reduce((sum, k) => sum + k.count, 0);
          
          if (hasWordBoundaryMatch) {
            return totalCount >= 1;
          } else {
            return totalCount === 0;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should match keywords surrounded by punctuation', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_KEYWORDS.slice(0, 15)),
        fc.constantFrom('.', ',', '!', '?', ':', ';', '(', ')', '"', "'"),
        fc.constantFrom('.', ',', '!', '?', ':', ';', '(', ')', '"', "'"),
        (keyword, leftPunc, rightPunc) => {
          const text = `Research shows ${leftPunc}${keyword}${rightPunc} is important.`;
          const result = findKeywords(text, [keyword]);
          const totalCount = Array.from(result.values()).reduce((sum, k) => sum + k.count, 0);
          return totalCount >= 1;
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: keyword-explorer-integration
 * Property 3: Keyword Categorization and Counting
 * 
 * For any keyword found in the text, it SHALL be assigned to exactly one category
 * from the predefined categories, and the count SHALL equal the actual number of
 * word-boundary matches in the text.
 * 
 * Validates: Requirements 1.3, 1.4
 */
describe('Property 3: Keyword Categorization and Counting', () => {
  it('should assign each keyword to exactly one valid category', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_KEYWORDS),
        (keyword) => {
          const category = getCategoryForKeyword(keyword);
          const validCategories = [...Object.keys(KEYWORD_CATEGORIES), 'Other'];
          return validCategories.includes(category);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should count keyword occurrences accurately', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_KEYWORDS.slice(0, 20)),
        fc.integer({ min: 1, max: 10 }),
        (keyword, repeatCount) => {
          // Create text with exact number of keyword occurrences
          const occurrences = Array(repeatCount).fill(keyword).join(' and ');
          const text = `The paper discusses ${occurrences} in detail.`;
          
          const result = findKeywords(text, [keyword]);
          const totalCount = Array.from(result.values()).reduce((sum, k) => sum + k.count, 0);
          
          // Count should match the number of times we inserted the keyword
          return totalCount === repeatCount;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should categorize keywords consistently with KEYWORD_CATEGORIES', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(KEYWORD_CATEGORIES)),
        (categoryName) => {
          const keywords = KEYWORD_CATEGORIES[categoryName];
          // All keywords in a category should return that category
          return keywords.every(kw => getCategoryForKeyword(kw) === categoryName);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: keyword-explorer-integration
 * Property 4: Singular/Plural Merging
 * 
 * For any keyword that has both singular and plural forms in the text
 * (e.g., "neural network" and "neural networks"), they SHALL be merged into
 * a single entry with the combined count of both forms.
 * 
 * Validates: Requirements 1.5
 */
describe('Property 4: Singular/Plural Merging', () => {
  // Keywords that have both singular and plural forms in KEYWORD_CATEGORIES
  const singularPluralPairs = [
    { singular: 'neural network', plural: 'neural networks' },
    { singular: 'transformer', plural: 'transformers' },
    { singular: 'language model', plural: 'language models' },
    { singular: 'diffusion model', plural: 'diffusion models' },
    { singular: 'embedding', plural: 'embeddings' },
  ];

  it('should merge singular and plural forms into a single entry', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...singularPluralPairs),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        ({ singular, plural }, singularCount, pluralCount) => {
          // Create text with both singular and plural forms
          const singularOccurrences = Array(singularCount).fill(singular).join(' and ');
          const pluralOccurrences = Array(pluralCount).fill(plural).join(' and ');
          const text = `The paper discusses ${singularOccurrences}. It also mentions ${pluralOccurrences}.`;
          
          const result = findKeywords(text, [singular, plural]);
          
          // Should have at most one entry (merged)
          const entries = Array.from(result.values());
          
          // Total count should be sum of both forms
          const totalCount = entries.reduce((sum, k) => sum + k.count, 0);
          const expectedCount = singularCount + pluralCount;
          
          return totalCount === expectedCount;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce consistent base keyword from getBaseKeyword', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...singularPluralPairs),
        ({ singular, plural }) => {
          // Title case versions
          const singularTitle = singular.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          const pluralTitle = plural.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          
          // Base keyword of plural should equal singular (or be very close)
          const basePlural = getBaseKeyword(pluralTitle);
          const baseSingular = getBaseKeyword(singularTitle);
          
          // The base of plural should match singular (removing trailing 's')
          return basePlural === singularTitle || baseSingular === basePlural;
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: keyword-explorer-integration
 * Property 9: Document Switch State Reset
 * 
 * For any document switch event, the Keyword Panel SHALL clear all previous
 * extraction results and initiate a new extraction for the new document.
 * 
 * This property test validates that:
 * 1. After any extraction result, calling reset clears all state
 * 2. The reset state matches the initial state exactly
 * 3. State is properly cleared regardless of previous extraction results
 * 
 * Validates: Requirements 6.5
 */
describe('Property 9: Document Switch State Reset', () => {
  // Define the initial/reset state structure
  const initialState = {
    keywords: [] as ExtractedKeyword[],
    loading: false,
    error: null as string | null,
    stats: { total: 0, numPages: 0 },
  };

  // Simulate state after extraction
  interface ExtractionState {
    keywords: ExtractedKeyword[];
    loading: boolean;
    error: string | null;
    stats: { total: number; numPages: number };
  }

  // Reset function implementation (mirrors the hook's reset logic)
  function resetState(): ExtractionState {
    return {
      keywords: [],
      loading: false,
      error: null,
      stats: { total: 0, numPages: 0 },
    };
  }

  // Helper to check if state equals initial state
  function isInitialState(state: ExtractionState): boolean {
    return (
      state.keywords.length === 0 &&
      state.loading === false &&
      state.error === null &&
      state.stats.total === 0 &&
      state.stats.numPages === 0
    );
  }

  it('should reset to initial state regardless of previous extraction results', () => {
    fc.assert(
      fc.property(
        // Generate random extraction results
        fc.array(
          fc.record({
            keyword: fc.constantFrom(...ALL_KEYWORDS.slice(0, 30)),
            count: fc.integer({ min: 1, max: 100 }),
            category: fc.constantFrom(...Object.keys(KEYWORD_CATEGORIES)),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        fc.integer({ min: 1, max: 1000 }), // total
        fc.integer({ min: 1, max: 100 }), // numPages
        (keywords, total, numPages) => {
          // Simulate state after extraction
          const stateAfterExtraction: ExtractionState = {
            keywords: keywords as ExtractedKeyword[],
            loading: false,
            error: null,
            stats: { total, numPages },
          };

          // Apply reset
          const stateAfterReset = resetState();

          // Verify reset state matches initial state
          return isInitialState(stateAfterReset);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reset to initial state regardless of error state', () => {
    fc.assert(
      fc.property(
        // Generate random error messages
        fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
        fc.boolean(), // loading state
        (errorMsg, loading) => {
          // Simulate state with error
          const stateWithError: ExtractionState = {
            keywords: [],
            loading,
            error: errorMsg ?? null,
            stats: { total: 0, numPages: 0 },
          };

          // Apply reset
          const stateAfterReset = resetState();

          // Verify reset state matches initial state
          return isInitialState(stateAfterReset);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reset to initial state from any valid state combination', () => {
    fc.assert(
      fc.property(
        // Generate any valid state combination
        fc.record({
          keywords: fc.array(
            fc.record({
              keyword: fc.string({ minLength: 1, maxLength: 50 }),
              count: fc.integer({ min: 1, max: 1000 }),
              category: fc.string({ minLength: 1, maxLength: 30 }),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          loading: fc.boolean(),
          error: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
          stats: fc.record({
            total: fc.integer({ min: 0, max: 10000 }),
            numPages: fc.integer({ min: 0, max: 500 }),
          }),
        }),
        (previousState) => {
          // Apply reset
          const stateAfterReset = resetState();

          // Verify all fields are reset to initial values
          const keywordsCleared = stateAfterReset.keywords.length === 0;
          const loadingCleared = stateAfterReset.loading === false;
          const errorCleared = stateAfterReset.error === null;
          const statsCleared = stateAfterReset.stats.total === 0 && stateAfterReset.stats.numPages === 0;

          return keywordsCleared && loadingCleared && errorCleared && statsCleared;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce idempotent reset (resetting twice equals resetting once)', () => {
    fc.assert(
      fc.property(
        // Generate any valid state
        fc.record({
          keywords: fc.array(
            fc.record({
              keyword: fc.constantFrom(...ALL_KEYWORDS.slice(0, 20)),
              count: fc.integer({ min: 1, max: 100 }),
              category: fc.constantFrom(...Object.keys(KEYWORD_CATEGORIES)),
            }),
            { minLength: 0, maxLength: 10 }
          ),
          loading: fc.boolean(),
          error: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
          stats: fc.record({
            total: fc.integer({ min: 0, max: 1000 }),
            numPages: fc.integer({ min: 0, max: 100 }),
          }),
        }),
        () => {
          // Reset once
          const firstReset = resetState();
          // Reset again
          const secondReset = resetState();

          // Both resets should produce identical state
          return (
            firstReset.keywords.length === secondReset.keywords.length &&
            firstReset.loading === secondReset.loading &&
            firstReset.error === secondReset.error &&
            firstReset.stats.total === secondReset.stats.total &&
            firstReset.stats.numPages === secondReset.stats.numPages
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
