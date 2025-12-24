import { useState, useEffect, useRef } from 'react';
import { extractKeywordsFromPDF, KEYWORD_CATEGORIES } from '../utils/pdfKeywordExtractor';
import KeywordPopup from './KeywordPopup';
import { fetchKeywordData } from '../api/taxonomyApi';

/**
 * KeywordPanel - displays all keywords extracted from a PDF
 * @param {Object} props
 * @param {string} props.pdfUrl - URL of the PDF to extract keywords from
 */
export default function KeywordPanel({ pdfUrl }) {
    const [keywords, setKeywords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedKeyword, setSelectedKeyword] = useState(null);
    const [popupData, setPopupData] = useState(null);
    const [popupLoading, setPopupLoading] = useState(false);
    const [popupPosition, setPopupPosition] = useState({ top: 100, left: 100 });
    const [stats, setStats] = useState({ total: 0, numPages: 0 });
    const panelRef = useRef(null);

    // Extract keywords when PDF URL changes
    useEffect(() => {
        if (!pdfUrl) return;

        setLoading(true);
        setError(null);

        extractKeywordsFromPDF(pdfUrl)
            .then(result => {
                setKeywords(result.keywords);
                setStats({
                    total: result.totalKeywords,
                    numPages: result.numPages
                });
            })
            .catch(err => {
                console.error('Error extracting keywords:', err);
                setError('Failed to extract keywords from PDF');
            })
            .finally(() => {
                setLoading(false);
            });
    }, [pdfUrl]);

    // Handle keyword click
    const handleKeywordClick = async (event, keyword) => {
        const rect = event.target.getBoundingClientRect();

        setPopupPosition({
            top: rect.bottom + window.scrollY + 10,
            left: Math.min(rect.left, window.innerWidth - 460)
        });

        setSelectedKeyword(keyword.keyword);
        setPopupLoading(true);
        setPopupData(null);

        try {
            const data = await fetchKeywordData(keyword.keyword);
            setPopupData(data);
        } catch (err) {
            console.error('Error fetching keyword data:', err);
            setPopupData({
                concept: { name: keyword.keyword, definition: 'Unable to fetch definition.' },
                siblings: [],
                descendants: [],
                error: 'API error'
            });
        } finally {
            setPopupLoading(false);
        }
    };

    // Handle popup close
    const closePopup = () => {
        setSelectedKeyword(null);
        setPopupData(null);
    };

    // Handle node click in popup
    const handleNodeClick = async (nodeId, nodeName) => {
        setPopupLoading(true);
        const displayName = nodeName || nodeId;
        setSelectedKeyword(displayName);

        try {
            const data = await fetchKeywordData(displayName);
            setPopupData(data);
        } catch (err) {
            console.error('Error fetching node data:', err);
        } finally {
            setPopupLoading(false);
        }
    };

    // Group keywords by category
    const groupedKeywords = keywords.reduce((acc, kw) => {
        const category = kw.category || 'Other';
        if (!acc[category]) acc[category] = [];
        acc[category].push(kw);
        return acc;
    }, {});

    return (
        <div className="keyword-panel" ref={panelRef}>
            <div className="keyword-panel-header">
                <h2>🔍 Extracted Keywords</h2>
                {!loading && !error && (
                    <div className="keyword-stats">
                        <span className="stat-item">
                            <strong>{keywords.length}</strong> unique keywords
                        </span>
                        <span className="stat-item">
                            <strong>{stats.total}</strong> occurrences
                        </span>
                        <span className="stat-item">
                            <strong>{stats.numPages}</strong> pages
                        </span>
                    </div>
                )}
            </div>

            <div className="keyword-panel-content">
                {loading && (
                    <div className="keyword-panel-loading">
                        <div className="spinner"></div>
                        <p>Extracting keywords from PDF...</p>
                    </div>
                )}

                {error && (
                    <div className="keyword-panel-error">
                        <p>⚠️ {error}</p>
                    </div>
                )}

                {!loading && !error && (
                    <div className="keyword-categories">
                        {Object.entries(groupedKeywords).map(([category, categoryKeywords]) => (
                            <div key={category} className="keyword-category">
                                <h3 className="category-title">{category}</h3>
                                <div className="keyword-chips">
                                    {categoryKeywords.map(kw => (
                                        <button
                                            key={kw.keyword}
                                            className="keyword-chip"
                                            onClick={(e) => handleKeywordClick(e, kw)}
                                            title={`${kw.keyword} (${kw.count} occurrences)`}
                                        >
                                            <span className="chip-text">{kw.keyword}</span>
                                            <span className="chip-count">{kw.count}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Popup for selected keyword */}
            {selectedKeyword && (
                <KeywordPopup
                    isOpen={true}
                    keyword={selectedKeyword}
                    context={`Found ${keywords.find(k => k.keyword === selectedKeyword)?.count || 0} times in the document`}
                    concept={popupData?.concept}
                    siblings={popupData?.siblings || []}
                    descendants={popupData?.descendants || []}
                    loading={popupLoading}
                    error={popupData?.error}
                    onClose={closePopup}
                    onNodeClick={handleNodeClick}
                    position={popupPosition}
                />
            )}
        </div>
    );
}
