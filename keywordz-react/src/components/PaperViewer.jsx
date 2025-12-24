import { useState, useCallback } from 'react';
import HighlightedText from './HighlightedText';
import KeywordPopup from './KeywordPopup';
import { fetchKeywordData, fetchConceptById } from '../api/taxonomyApi';
import { extractContext } from '../utils/textUtils';

/**
 * PaperViewer component - main container for the keyword expansion feature
 * @param {Object} props
 * @param {string} props.paperText - The full text of the research paper
 * @param {string[]} props.keywords - Array of keywords to highlight
 */
export default function PaperViewer({ paperText, keywords }) {
    const [popupState, setPopupState] = useState({
        isOpen: false,
        keyword: null,
        context: '',
        concept: null,
        siblings: [],
        descendants: [],
        loading: false,
        error: null,
        position: null
    });

    // Handle keyword click from highlighted text
    const handleKeywordClick = useCallback(async (keyword, element) => {
        // Get position for popup
        const rect = element.getBoundingClientRect();
        const position = {
            top: rect.bottom + window.scrollY + 10,
            left: rect.left + window.scrollX
        };

        // Scroll element into view if needed
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Set loading state
        setPopupState(prev => ({
            ...prev,
            isOpen: true,
            keyword,
            context: extractContext(paperText, keyword, 1),
            loading: true,
            error: null,
            position
        }));

        // Fetch data from API
        const data = await fetchKeywordData(keyword);

        setPopupState(prev => ({
            ...prev,
            concept: data.concept,
            siblings: data.siblings,
            descendants: data.descendants,
            loading: false,
            error: data.error
        }));
    }, [paperText]);

    // Handle node click in the graph (multi-level expansion)
    const handleNodeClick = useCallback(async (conceptId, conceptName) => {
        // Update keyword name if available
        setPopupState(prev => ({
            ...prev,
            keyword: conceptName || prev.keyword,
            loading: true,
            error: null
        }));

        // Fetch new concept data
        const data = await fetchConceptById(conceptId);

        // Try to find context if the concept name exists in paper text
        let newContext = 'This concept was not found in the paper text.';
        if (data.concept?.name) {
            const lowerText = paperText.toLowerCase();
            if (lowerText.includes(data.concept.name.toLowerCase())) {
                newContext = extractContext(paperText, data.concept.name, 1);
            }
        }

        setPopupState(prev => ({
            ...prev,
            keyword: data.concept?.name || conceptName || prev.keyword,
            context: newContext,
            concept: data.concept,
            siblings: data.siblings,
            descendants: data.descendants,
            loading: false,
            error: data.error
        }));
    }, [paperText]);

    // Close popup
    const handleClose = useCallback(() => {
        setPopupState(prev => ({
            ...prev,
            isOpen: false
        }));
    }, []);

    return (
        <div className="paper-viewer">
            <div className="paper-content">
                <HighlightedText
                    text={paperText}
                    keywords={keywords}
                    onKeywordClick={handleKeywordClick}
                    selectedKeyword={popupState.isOpen ? popupState.keyword : null}
                />
            </div>

            <KeywordPopup
                isOpen={popupState.isOpen}
                keyword={popupState.keyword}
                context={popupState.context}
                concept={popupState.concept}
                siblings={popupState.siblings}
                descendants={popupState.descendants}
                loading={popupState.loading}
                error={popupState.error}
                onClose={handleClose}
                onNodeClick={handleNodeClick}
                position={popupState.position}
            />
        </div>
    );
}
