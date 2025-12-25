"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTaxonomyAPI, ConceptData, RelatedConcept } from "./useTaxonomyAPI";

/**
 * State for the text selection popup
 */
export interface TextSelectionPopupState {
    isOpen: boolean;
    selectedText: string;
    keyword: string;
    context: string;
    concept: ConceptData | null;
    siblings: RelatedConcept[];
    descendants: RelatedConcept[];
    loading: boolean;
    error: string | null;
    position: { top: number; left: number };
}

/**
 * Return type for the useTextSelectionPopup hook
 */
export interface UseTextSelectionPopupReturn {
    popupState: TextSelectionPopupState;
    handleTextSelection: (event: MouseEvent) => void;
    handleNodeClick: (nodeId: string, nodeName: string) => void;
    closePopup: () => void;
    isEnabled: boolean;
    setEnabled: (enabled: boolean) => void;
}

/**
 * Initial state for the popup
 */
const initialState: TextSelectionPopupState = {
    isOpen: false,
    selectedText: "",
    keyword: "",
    context: "",
    concept: null,
    siblings: [],
    descendants: [],
    loading: false,
    error: null,
    position: { top: 0, left: 0 },
};

/**
 * Cleans and normalizes selected text for keyword lookup
 */
function normalizeText(text: string): string {
    return text
        .trim()
        .replace(/\s+/g, " ") // Normalize whitespace
        .replace(/[^\w\s-]/g, "") // Remove special characters except hyphens
        .toLowerCase();
}

/**
 * Extracts the most relevant keyword from selected text
 * If the selection is too long, try to extract key phrases
 */
function extractKeyword(text: string): string {
    const normalized = normalizeText(text);

    // If text is short enough, use it directly
    if (normalized.length <= 50) {
        return normalized;
    }

    // For longer text, try to extract meaningful phrases
    // Take first few words (likely the main concept)
    const words = normalized.split(" ").filter(w => w.length > 2);
    return words.slice(0, 4).join(" ");
}

/**
 * React hook for handling text selection in PDF viewer and showing keyword popup.
 * 
 * Features:
 * - Listens for text selection (mouseup events)
 * - Fetches keyword definition from Taxonomy API
 * - Shows popup with definition and related concepts
 * - Supports clicking on related concepts to navigate
 * 
 * @param containerRef - Ref to the PDF viewer container
 * @returns Object containing popup state and control functions
 * 
 * @example
 * ```tsx
 * const {
 *   popupState,
 *   handleTextSelection,
 *   handleNodeClick,
 *   closePopup,
 *   isEnabled,
 *   setEnabled
 * } = useTextSelectionPopup();
 * 
 * useEffect(() => {
 *   const container = pdfContainerRef.current;
 *   if (container) {
 *     container.addEventListener('mouseup', handleTextSelection);
 *     return () => container.removeEventListener('mouseup', handleTextSelection);
 *   }
 * }, [handleTextSelection]);
 * ```
 */
export function useTextSelectionPopup(): UseTextSelectionPopupReturn {
    const [popupState, setPopupState] = useState<TextSelectionPopupState>(initialState);
    const [isEnabled, setEnabled] = useState(true);
    const { fetchKeywordData, fetchConceptById, loading: apiLoading } = useTaxonomyAPI();

    // Debounce timer ref
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    /**
     * Close the popup
     */
    const closePopup = useCallback(() => {
        setPopupState(initialState);
    }, []);

    /**
     * Handle text selection in the PDF viewer
     */
    const handleTextSelection = useCallback(async (event: MouseEvent) => {
        // Skip if feature is disabled
        if (!isEnabled) return;

        // Clear any pending debounce
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        // Debounce selection handling to avoid rapid API calls
        debounceTimer.current = setTimeout(async () => {
            const selection = window.getSelection();
            const selectedText = selection?.toString().trim();

            // Minimum text length and maximum length for meaningful lookup
            if (!selectedText || selectedText.length < 3 || selectedText.length > 200) {
                return;
            }

            // Don't trigger if clicking on the popup itself
            const target = event.target as HTMLElement;
            if (target.closest('[role="dialog"]') || target.closest('[data-keyword-popup]')) {
                return;
            }

            // Don't trigger if clicking on buttons or interactive elements
            if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
                return;
            }

            // Extract keyword from selection
            const keyword = extractKeyword(selectedText);

            if (!keyword) return;

            // Calculate popup position based on selection
            const range = selection?.getRangeAt(0);
            const rect = range?.getBoundingClientRect();

            if (!rect) return;

            const position = {
                top: rect.bottom + window.scrollY + 10,
                left: rect.left + window.scrollX,
            };

            // Ensure popup stays within viewport
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Adjust horizontal position
            if (position.left + 420 > viewportWidth) {
                position.left = Math.max(10, viewportWidth - 440);
            }

            // Adjust vertical position
            if (position.top + 500 > viewportHeight + window.scrollY) {
                position.top = rect.top + window.scrollY - 510;
            }

            // Update state to show loading popup
            setPopupState({
                isOpen: true,
                selectedText,
                keyword,
                context: `Selected text: "${selectedText.substring(0, 100)}${selectedText.length > 100 ? '...' : ''}"`,
                concept: null,
                siblings: [],
                descendants: [],
                loading: true,
                error: null,
                position,
            });

            console.log(`[useTextSelectionPopup] Looking up keyword: "${keyword}"`);

            // Fetch keyword data from API
            try {
                const data = await fetchKeywordData(keyword);

                setPopupState(prev => ({
                    ...prev,
                    concept: data.concept,
                    siblings: data.siblings,
                    descendants: data.descendants,
                    loading: false,
                    error: data.error,
                }));

                if (data.concept) {
                    console.log(`[useTextSelectionPopup] Found concept: "${data.concept.name}" with definition`);
                } else {
                    console.log(`[useTextSelectionPopup] Concept not found for: "${keyword}"`);
                }
            } catch (err) {
                console.error("[useTextSelectionPopup] Error fetching keyword data:", err);
                setPopupState(prev => ({
                    ...prev,
                    loading: false,
                    error: err instanceof Error ? err.message : "Failed to fetch keyword data",
                }));
            }
        }, 300); // 300ms debounce
    }, [isEnabled, fetchKeywordData]);

    /**
     * Handle clicking on a related concept in the popup
     */
    const handleNodeClick = useCallback(async (nodeId: string, nodeName: string) => {
        console.log(`[useTextSelectionPopup] Node clicked: "${nodeName}" (ID: ${nodeId})`);

        // Show loading state while keeping popup open
        setPopupState(prev => ({
            ...prev,
            keyword: nodeName,
            loading: true,
            error: null,
        }));

        try {
            const data = await fetchConceptById(nodeId);

            setPopupState(prev => ({
                ...prev,
                keyword: data.concept?.name || nodeName,
                concept: data.concept,
                siblings: data.siblings,
                descendants: data.descendants,
                loading: false,
                error: data.error,
                context: `Navigated from related concept`,
            }));
        } catch (err) {
            console.error("[useTextSelectionPopup] Error fetching concept:", err);
            setPopupState(prev => ({
                ...prev,
                loading: false,
                error: err instanceof Error ? err.message : "Failed to fetch concept data",
            }));
        }
    }, [fetchConceptById]);

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, []);

    return {
        popupState,
        handleTextSelection,
        handleNodeClick,
        closePopup,
        isEnabled,
        setEnabled,
    };
}

export default useTextSelectionPopup;
