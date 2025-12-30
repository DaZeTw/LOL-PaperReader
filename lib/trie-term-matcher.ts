/**
 * Trie-based Term Matcher for PDF Keyword Recognition
 * 
 * Ported from pdf_highlighter.py to TypeScript for browser-based PDF keyword matching.
 * Uses a Trie (prefix tree) data structure for efficient term matching.
 * 
 * Features:
 * - Efficient O(n) text scanning with Trie data structure
 * - Text normalization (lowercase, punctuation removal)
 * - Simple lemmatization (handling plurals and common suffixes)
 * - Longest match priority to handle overlapping terms
 */

/**
 * Interface for a draft term from the JSON file
 */
export interface DraftTerm {
  name: string
  url: string
  short_definition: string
}

/**
 * Interface for a matched term in the text
 */
export interface MatchedTerm {
  matchedText: string
  termName: string
  url: string
  shortDefinition: string
  startIdx: number
  endIdx: number
}

/**
 * A node in the Trie data structure
 */
class TrieNode {
  children: Map<string, TrieNode> = new Map()
  termData: DraftTerm | null = null
  isEndOfTerm: boolean = false
}

/**
 * Trie (prefix tree) for efficient term matching
 */
class Trie {
  root: TrieNode = new TrieNode()
  numTerms: number = 0
  maxDepth: number = 0

  /**
   * Insert a term into the Trie
   */
  insert(tokens: string[], termData: DraftTerm): void {
    let node = this.root
    for (const token of tokens) {
      if (!node.children.has(token)) {
        node.children.set(token, new TrieNode())
      }
      node = node.children.get(token)!
    }
    node.isEndOfTerm = true
    node.termData = termData
    this.numTerms++
    this.maxDepth = Math.max(this.maxDepth, tokens.length)
  }

  /**
   * Search for the longest matching term starting at a given position
   */
  searchLongestMatch(tokens: string[], startIdx: number): { termData: DraftTerm; endIdx: number } | null {
    let node = this.root
    let longestMatch: { termData: DraftTerm; endIdx: number } | null = null
    let currentIdx = startIdx

    while (currentIdx < tokens.length) {
      const token = tokens[currentIdx]
      if (!node.children.has(token)) {
        break
      }
      node = node.children.get(token)!
      if (node.isEndOfTerm && node.termData) {
        longestMatch = { termData: node.termData, endIdx: currentIdx }
      }
      currentIdx++
    }

    return longestMatch
  }
}

/**
 * Simple lemmatization rules for English
 * This is a simplified version - consider using a proper NLP library for production
 */
function simpleLemmatize(word: string): string {
  // Convert to lowercase first
  const lower = word.toLowerCase()
  
  // Handle common plural forms
  if (lower.endsWith('ies') && lower.length > 4) {
    return lower.slice(0, -3) + 'y'
  }
  if (lower.endsWith('es') && lower.length > 3) {
    // Check for words ending in s, x, z, ch, sh
    const stem = lower.slice(0, -2)
    if (stem.endsWith('s') || stem.endsWith('x') || stem.endsWith('z') || 
        stem.endsWith('ch') || stem.endsWith('sh')) {
      return stem
    }
    // Otherwise just remove 's'
    return lower.slice(0, -1)
  }
  if (lower.endsWith('s') && lower.length > 2 && !lower.endsWith('ss')) {
    return lower.slice(0, -1)
  }
  
  // Handle -ing forms
  if (lower.endsWith('ing') && lower.length > 5) {
    const stem = lower.slice(0, -3)
    // Handle doubling consonant
    if (stem.length > 1 && stem[stem.length - 1] === stem[stem.length - 2]) {
      return stem.slice(0, -1)
    }
    // Handle -e removal
    if (stem.length > 0) {
      return stem + 'e'
    }
    return stem
  }
  
  // Handle -ed forms
  if (lower.endsWith('ed') && lower.length > 4) {
    const stem = lower.slice(0, -2)
    // Handle -ied -> -y
    if (lower.endsWith('ied')) {
      return lower.slice(0, -3) + 'y'
    }
    // Handle doubling consonant
    if (stem.length > 1 && stem[stem.length - 1] === stem[stem.length - 2]) {
      return stem.slice(0, -1)
    }
    return stem
  }
  
  return lower
}

/**
 * Trie-based Term Matcher
 * 
 * Efficiently matches terms from a dictionary against text using a Trie.
 */
export class TrieTermMatcher {
  private trie: Trie = new Trie()
  private buildTimeMs: number = 0

  constructor(draftTerms: DraftTerm[]) {
    const buildStart = performance.now()

    for (const term of draftTerms) {
      const normalizedName = this.normalizeAndLemmatize(term.name)
      const tokens = normalizedName.split(/\s+/).filter(t => t.length > 0)
      if (tokens.length > 0) {
        this.trie.insert(tokens, term)
      }
    }

    this.buildTimeMs = performance.now() - buildStart
    console.log(`[TrieTermMatcher] Build time: ${this.buildTimeMs.toFixed(2)}ms`)
    console.log(`[TrieTermMatcher] Terms indexed: ${this.trie.numTerms}, Max depth: ${this.trie.maxDepth}`)
  }

  /**
   * Normalize text: lowercase and remove punctuation
   */
  private normalizeText(text: string): string {
    // Replace punctuation with spaces
    let normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ')
    // Collapse multiple spaces
    normalized = normalized.replace(/\s+/g, ' ').trim()
    return normalized
  }

  /**
   * Lemmatize a list of tokens
   */
  private lemmatizeTokens(tokens: string[]): string[] {
    return tokens.map(token => simpleLemmatize(token))
  }

  /**
   * Normalize and lemmatize text
   */
  private normalizeAndLemmatize(text: string): string {
    const normalized = this.normalizeText(text)
    const tokens = normalized.split(/\s+/).filter(t => t.length > 0)
    const lemmatized = this.lemmatizeTokens(tokens)
    return lemmatized.join(' ')
  }

  /**
   * Match terms in the given text
   */
  match(text: string): MatchedTerm[] {
    const matchStart = performance.now()

    const normalizedText = this.normalizeText(text)
    const tokens = normalizedText.split(/\s+/).filter(t => t.length > 0)
    const lemmatizedTokens = this.lemmatizeTokens(tokens)

    const matches: MatchedTerm[] = []
    let i = 0
    let iterations = 0

    while (i < lemmatizedTokens.length) {
      iterations++
      const result = this.trie.searchLongestMatch(lemmatizedTokens, i)

      if (result) {
        const { termData, endIdx } = result
        const originalMatchedText = tokens.slice(i, endIdx + 1).join(' ')

        matches.push({
          matchedText: originalMatchedText,
          termName: termData.name,
          url: termData.url,
          shortDefinition: termData.short_definition,
          startIdx: i,
          endIdx: endIdx
        })
        i = endIdx + 1
      } else {
        i++
      }
    }

    const totalTime = performance.now() - matchStart
    console.log(`[TrieTermMatcher] Match time: ${totalTime.toFixed(2)}ms, Iterations: ${iterations}, Matches: ${matches.length}`)

    return matches
  }

  /**
   * Get build statistics
   */
  getStats(): { numTerms: number; maxDepth: number; buildTimeMs: number } {
    return {
      numTerms: this.trie.numTerms,
      maxDepth: this.trie.maxDepth,
      buildTimeMs: this.buildTimeMs
    }
  }
}

/**
 * Aggregated match result with occurrence count
 */
export interface AggregatedMatch {
  termName: string
  matchedText: string
  url: string
  shortDefinition: string
  count: number
  category?: string
}

/**
 * Aggregate matches to count occurrences of each unique term
 */
export function aggregateMatches(matches: MatchedTerm[]): AggregatedMatch[] {
  const termMap = new Map<string, AggregatedMatch>()

  for (const match of matches) {
    const key = match.termName.toLowerCase()
    if (termMap.has(key)) {
      const existing = termMap.get(key)!
      existing.count++
    } else {
      termMap.set(key, {
        termName: match.termName,
        matchedText: match.matchedText,
        url: match.url,
        shortDefinition: match.shortDefinition,
        count: 1
      })
    }
  }

  // Sort by count descending
  return Array.from(termMap.values()).sort((a, b) => b.count - a.count)
}

/**
 * Categorize a term based on its URL or name
 * This is a heuristic - could be improved with proper taxonomy data
 */
export function categorizeTerm(term: AggregatedMatch): string {
  const name = term.termName.toLowerCase()
  const url = term.url.toLowerCase()

  // Machine Learning related
  if (name.includes('learning') || name.includes('neural') || 
      name.includes('algorithm') || name.includes('model') ||
      name.includes('training') || name.includes('classification')) {
    return 'Machine Learning'
  }

  // Neural Architectures
  if (name.includes('network') || name.includes('transformer') ||
      name.includes('attention') || name.includes('encoder') ||
      name.includes('decoder') || name.includes('cnn') || name.includes('rnn')) {
    return 'Neural Architectures'
  }

  // NLP & Language
  if (name.includes('language') || name.includes('nlp') ||
      name.includes('text') || name.includes('semantic') ||
      name.includes('linguistic') || name.includes('natural language')) {
    return 'NLP & Language Models'
  }

  // Computer Vision
  if (name.includes('vision') || name.includes('image') ||
      name.includes('visual') || name.includes('recognition') ||
      name.includes('detection') || name.includes('segmentation')) {
    return 'Computer Vision'
  }

  // Data & Statistics
  if (name.includes('data') || name.includes('statistic') ||
      name.includes('analysis') || name.includes('probability')) {
    return 'Data & Statistics'
  }

  // Science & Research
  if (name.includes('science') || name.includes('research') ||
      name.includes('study') || name.includes('experiment')) {
    return 'Science & Research'
  }

  // Health & Medicine
  if (name.includes('health') || name.includes('medical') ||
      name.includes('clinical') || name.includes('disease') ||
      name.includes('patient') || name.includes('therapy')) {
    return 'Health & Medicine'
  }

  // Engineering & Technology
  if (name.includes('engineering') || name.includes('technology') ||
      name.includes('system') || name.includes('design')) {
    return 'Engineering & Technology'
  }

  return 'Other'
}
