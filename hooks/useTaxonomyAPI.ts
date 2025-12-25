import { useState, useCallback } from 'react'
import { BACKEND_API_URL } from '@/lib/config'

// ============================================================================
// Types
// ============================================================================

/**
 * Concept data returned from the Taxonomy API
 */
export interface ConceptData {
  id: string
  name: string
  definition: string
  level?: number
  category?: string
  ambiguous_with?: string[]
}

/**
 * A related concept (sibling or descendant)
 */
export interface RelatedConcept {
  id: string
  name: string
}

/**
 * Search result item from the Taxonomy API
 */
export interface ConceptSearchItem {
  id: string
  name: string
  score: number
}

/**
 * Combined keyword data including concept and related concepts
 */
export interface KeywordData {
  concept: ConceptData | null
  siblings: RelatedConcept[]
  descendants: RelatedConcept[]
  error: string | null
}

/**
 * Return type for the useTaxonomyAPI hook
 */
export interface UseTaxonomyAPIReturn {
  fetchKeywordData: (keyword: string) => Promise<KeywordData>
  fetchConceptById: (conceptId: string) => Promise<KeywordData>
  loading: boolean
  error: string | null
}

// ============================================================================
// API Functions
// ============================================================================

const API_BASE = `${BACKEND_API_URL}/api/taxonomy`

/**
 * Search for a concept by name
 * @param query - The keyword to search for
 * @param limit - Maximum results to return
 * @returns Array of matching concepts
 */
async function searchConcept(query: string, limit: number = 5): Promise<ConceptSearchItem[]> {
  const res = await fetch(
    `${API_BASE}/search?query=${encodeURIComponent(query)}&limit=${limit}`
  )
  
  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`)
  }
  
  const data = await res.json()
  return data.items || []
}

/**
 * Get concept details by ID
 * @param id - Concept ID
 * @returns Concept details
 */
async function getConcept(id: string): Promise<ConceptData | null> {
  const res = await fetch(`${API_BASE}/concepts/${id}`)
  
  if (!res.ok) {
    if (res.status === 404) {
      return null
    }
    throw new Error(`Concept fetch failed: ${res.status}`)
  }
  
  return await res.json()
}

/**
 * Get sibling concepts
 * @param id - Concept ID
 * @param limit - Maximum siblings to return
 * @returns Array of sibling concepts
 */
async function getSiblings(id: string, limit: number = 10): Promise<RelatedConcept[]> {
  const res = await fetch(`${API_BASE}/concepts/${id}/siblings?limit=${limit}`)
  
  if (!res.ok) {
    throw new Error(`Siblings fetch failed: ${res.status}`)
  }
  
  const data = await res.json()
  return data.siblings || []
}

/**
 * Get descendant concepts
 * @param id - Concept ID
 * @param maxNodes - Maximum descendants to return
 * @returns Array of descendant concepts
 */
async function getDescendants(id: string, maxNodes: number = 10): Promise<RelatedConcept[]> {
  const res = await fetch(`${API_BASE}/concepts/${id}/descendants?max_nodes=${maxNodes}`)
  
  if (!res.ok) {
    throw new Error(`Descendants fetch failed: ${res.status}`)
  }
  
  const data = await res.json()
  return data.descendants || []
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for fetching concept data from the Taxonomy API.
 * 
 * Provides functionality to:
 * - Fetch keyword data by searching for a keyword name
 * - Fetch concept data by ID (for graph node clicks)
 * - Track loading and error states
 * 
 * @returns Object containing fetch functions, loading state, and error
 * 
 * @example
 * ```tsx
 * const { fetchKeywordData, fetchConceptById, loading, error } = useTaxonomyAPI()
 * 
 * // Fetch data when a keyword is clicked
 * const handleKeywordClick = async (keyword: string) => {
 *   const data = await fetchKeywordData(keyword)
 *   if (data.concept) {
 *     setPopupData(data)
 *   }
 * }
 * 
 * // Fetch data when a graph node is clicked
 * const handleNodeClick = async (nodeId: string) => {
 *   const data = await fetchConceptById(nodeId)
 *   if (data.concept) {
 *     setPopupData(data)
 *   }
 * }
 * ```
 */
export function useTaxonomyAPI(): UseTaxonomyAPIReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetch all related data for a keyword by searching for it first
   * @param keyword - The keyword to look up
   * @returns Object with concept, siblings, descendants, and error
   */
  const fetchKeywordData = useCallback(async (keyword: string): Promise<KeywordData> => {
    setLoading(true)
    setError(null)

    try {
      // First, search for the concept
      const searchResults = await searchConcept(keyword, 1)

      if (searchResults.length === 0) {
        const notFoundError = 'Concept not found in taxonomy'
        setError(notFoundError)
        return {
          concept: null,
          siblings: [],
          descendants: [],
          error: notFoundError,
        }
      }

      const conceptId = searchResults[0].id

      // Fetch all related data in parallel
      const [concept, siblings, descendants] = await Promise.all([
        getConcept(conceptId),
        getSiblings(conceptId, 8),
        getDescendants(conceptId, 8),
      ])

      if (!concept) {
        const notFoundError = 'Concept not found'
        setError(notFoundError)
        return {
          concept: null,
          siblings: [],
          descendants: [],
          error: notFoundError,
        }
      }

      console.log(
        `[useTaxonomyAPI] Fetched data for "${keyword}": ` +
        `${siblings.length} siblings, ${descendants.length} descendants`
      )

      return {
        concept,
        siblings,
        descendants,
        error: null,
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch keyword data'
      console.error('[useTaxonomyAPI] Error fetching keyword data:', err)
      setError(errorMessage)
      return {
        concept: null,
        siblings: [],
        descendants: [],
        error: errorMessage,
      }
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Fetch concept data by ID (for graph node clicks)
   * @param conceptId - The concept ID
   * @returns Object with concept, siblings, descendants, and error
   */
  const fetchConceptById = useCallback(async (conceptId: string): Promise<KeywordData> => {
    setLoading(true)
    setError(null)

    try {
      // Fetch all related data in parallel
      const [concept, siblings, descendants] = await Promise.all([
        getConcept(conceptId),
        getSiblings(conceptId, 8),
        getDescendants(conceptId, 8),
      ])

      if (!concept) {
        const notFoundError = 'Concept not found'
        setError(notFoundError)
        return {
          concept: null,
          siblings: [],
          descendants: [],
          error: notFoundError,
        }
      }

      console.log(
        `[useTaxonomyAPI] Fetched data for concept ID "${conceptId}": ` +
        `${siblings.length} siblings, ${descendants.length} descendants`
      )

      return {
        concept,
        siblings,
        descendants,
        error: null,
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch concept data'
      console.error('[useTaxonomyAPI] Error fetching concept data:', err)
      setError(errorMessage)
      return {
        concept: null,
        siblings: [],
        descendants: [],
        error: errorMessage,
      }
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    fetchKeywordData,
    fetchConceptById,
    loading,
    error,
  }
}
