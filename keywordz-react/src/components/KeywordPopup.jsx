import { useEffect, useRef } from 'react';
import MiniGraph from './MiniGraph';

/**
 * KeywordPopup component - displays keyword details in a popup overlay
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether popup is visible
 * @param {string} props.keyword - The selected keyword
 * @param {string} props.context - Contextual text around the keyword
 * @param {Object} props.concept - Concept data from API
 * @param {Array} props.siblings - Sibling concepts
 * @param {Array} props.descendants - Descendant concepts
 * @param {boolean} props.loading - Loading state
 * @param {string} props.error - Error message if any
 * @param {Function} props.onClose - Close popup callback
 * @param {Function} props.onNodeClick - Graph node click callback
 * @param {Object} props.position - Position for the popup
 */
export default function KeywordPopup({
    isOpen,
    keyword,
    context,
    concept,
    siblings,
    descendants,
    loading,
    error,
    onClose,
    onNodeClick,
    position
}) {
    const popupRef = useRef();

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (popupRef.current && !popupRef.current.contains(event.target)) {
                // Check if click is on a keyword (don't close if clicking another keyword)
                if (!event.target.classList.contains('keyword-highlight')) {
                    onClose();
                }
            }
        };

        // Close on Escape key
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Calculate popup position
    const style = position ? {
        top: Math.min(position.top, window.innerHeight - 500),
        left: Math.min(position.left, window.innerWidth - 450)
    } : {};

    return (
        <div className="popup-overlay">
            <div
                className="keyword-popup"
                ref={popupRef}
                style={style}
            >
                <button className="popup-close-btn" onClick={onClose} aria-label="Close popup">
                    ✕
                </button>

                <div className="popup-header">
                    <h2>{keyword}</h2>
                    {concept?.level !== undefined && (
                        <span className="level-badge">Level {concept.level}</span>
                    )}
                </div>

                {loading ? (
                    <div className="popup-loading">
                        <div className="spinner"></div>
                        <span>Loading...</span>
                    </div>
                ) : error ? (
                    <div className="popup-error">
                        <span>⚠️ {error}</span>
                    </div>
                ) : (
                    <>
                        {/* Contextual expansion */}
                        <section className="popup-section">
                            <h3>📖 Context</h3>
                            <p className="context-text">{context || 'No context available'}</p>
                        </section>

                        {/* Definition */}
                        <section className="popup-section">
                            <h3>📚 Definition</h3>
                            <p className="definition-text">
                                {concept?.definition || 'No definition available'}
                            </p>
                        </section>

                        {/* Related keywords */}
                        <section className="popup-section">
                            <h3>🔗 Related Keywords</h3>
                            <div className="related-keywords">
                                {siblings.length > 0 && (
                                    <div className="keyword-group">
                                        <span className="group-label sibling">Siblings:</span>
                                        <div className="keyword-tags">
                                            {siblings.slice(0, 5).map(sib => (
                                                <button
                                                    key={sib.id}
                                                    className="keyword-tag sibling"
                                                    onClick={() => onNodeClick(sib.id, sib.name)}
                                                >
                                                    {sib.name}
                                                </button>
                                            ))}
                                            {siblings.length > 5 && (
                                                <span className="more-count">+{siblings.length - 5} more</span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {descendants.length > 0 && (
                                    <div className="keyword-group">
                                        <span className="group-label descendant">Descendants:</span>
                                        <div className="keyword-tags">
                                            {descendants.slice(0, 5).map(desc => (
                                                <button
                                                    key={desc.id}
                                                    className="keyword-tag descendant"
                                                    onClick={() => onNodeClick(desc.id, desc.name)}
                                                >
                                                    {desc.name}
                                                </button>
                                            ))}
                                            {descendants.length > 5 && (
                                                <span className="more-count">+{descendants.length - 5} more</span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {concept?.ambiguous_with?.length > 0 && (
                                    <div className="keyword-group">
                                        <span className="group-label ambiguous">Ambiguous with:</span>
                                        <div className="keyword-tags">
                                            {concept.ambiguous_with.slice(0, 3).map(id => (
                                                <button
                                                    key={id}
                                                    className="keyword-tag ambiguous"
                                                    onClick={() => onNodeClick(id, null)}
                                                >
                                                    {id.slice(0, 8)}...
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {siblings.length === 0 && descendants.length === 0 &&
                                    (!concept?.ambiguous_with || concept.ambiguous_with.length === 0) && (
                                        <p className="no-related">No related keywords found</p>
                                    )}
                            </div>
                        </section>

                        {/* Mini Knowledge Graph */}
                        <section className="popup-section graph-section">
                            <h3>🕸️ Knowledge Graph</h3>
                            <MiniGraph
                                concept={concept}
                                siblings={siblings}
                                descendants={descendants}
                                onNodeClick={onNodeClick}
                            />
                            <p className="graph-hint">Click on a node to explore</p>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}
