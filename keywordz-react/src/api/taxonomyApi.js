const API_BASE = '/api';

/**
 * Search for a concept by name
 * @param {string} query - The keyword to search for
 * @param {number} limit - Maximum results to return
 * @returns {Promise<Array>} - Array of matching concepts
 */
export async function searchConcept(query, limit = 5) {
    try {
        const res = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}&limit=${limit}`);
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const data = await res.json();
        return data.items || [];
    } catch (error) {
        console.error('searchConcept error:', error);
        return [];
    }
}

/**
 * Get concept details by ID
 * @param {string} id - Concept ID
 * @returns {Promise<Object|null>} - Concept details or null
 */
export async function getConcept(id) {
    try {
        const res = await fetch(`${API_BASE}/concepts/${id}`);
        if (!res.ok) throw new Error(`Concept fetch failed: ${res.status}`);
        return await res.json();
    } catch (error) {
        console.error('getConcept error:', error);
        return null;
    }
}

/**
 * Get sibling concepts
 * @param {string} id - Concept ID
 * @param {number} limit - Maximum siblings to return
 * @returns {Promise<Array>} - Array of sibling concepts
 */
export async function getSiblings(id, limit = 10) {
    try {
        const res = await fetch(`${API_BASE}/concepts/${id}/siblings?limit=${limit}`);
        if (!res.ok) throw new Error(`Siblings fetch failed: ${res.status}`);
        const data = await res.json();
        return data.siblings || [];
    } catch (error) {
        console.error('getSiblings error:', error);
        return [];
    }
}

/**
 * Get descendant concepts
 * @param {string} id - Concept ID
 * @param {number} maxNodes - Maximum descendants to return
 * @returns {Promise<Array>} - Array of descendant concepts
 */
export async function getDescendants(id, maxNodes = 10) {
    try {
        const res = await fetch(`${API_BASE}/concepts/${id}/descendants?max_nodes=${maxNodes}`);
        if (!res.ok) throw new Error(`Descendants fetch failed: ${res.status}`);
        const data = await res.json();
        return data.descendants || [];
    } catch (error) {
        console.error('getDescendants error:', error);
        return [];
    }
}

/**
 * Fetch all related data for a concept
 * @param {string} keyword - The keyword to look up
 * @returns {Promise<Object>} - Object with concept, siblings, descendants
 */
export async function fetchKeywordData(keyword) {
    // First, search for the concept
    const searchResults = await searchConcept(keyword, 1);

    if (searchResults.length === 0) {
        return { concept: null, siblings: [], descendants: [], error: 'Concept not found' };
    }

    const conceptId = searchResults[0].id;

    // Fetch all related data in parallel
    const [concept, siblings, descendants] = await Promise.all([
        getConcept(conceptId),
        getSiblings(conceptId, 8),
        getDescendants(conceptId, 8)
    ]);

    return {
        concept,
        siblings,
        descendants,
        error: null
    };
}

/**
 * Fetch concept data by ID (for graph node clicks)
 * @param {string} conceptId - The concept ID
 * @returns {Promise<Object>} - Object with concept, siblings, descendants
 */
export async function fetchConceptById(conceptId) {
    const [concept, siblings, descendants] = await Promise.all([
        getConcept(conceptId),
        getSiblings(conceptId, 8),
        getDescendants(conceptId, 8)
    ]);

    return {
        concept,
        siblings,
        descendants,
        error: concept ? null : 'Concept not found'
    };
}
