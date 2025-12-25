import { useState, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import KeywordPopup from './KeywordPopup';
import { fetchKeywordData, fetchConceptById } from '../api/taxonomyApi';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Keywords to highlight (case-insensitive matching)
const KEYWORDS = [
    'neural network', 'neural networks',
    'machine learning',
    'deep learning',
    'artificial intelligence',
    'transformer', 'transformers',
    'attention mechanism',
    'natural language processing', 'nlp',
    'computer vision',
    'reinforcement learning',
    'supervised learning',
    'unsupervised learning',
    'convolutional neural network', 'cnn',
    'recurrent neural network', 'rnn',
    'generative adversarial network', 'gan',
    'backpropagation',
    'gradient descent',
    'optimization',
    'embedding', 'embeddings',
    'language model', 'language models',
    'pre-training', 'pretraining',
    'fine-tuning', 'finetuning',
    'bert', 'gpt',
    'classification',
    'regression',
    'clustering',
    'feature extraction',
    'representation learning',
];

function PDFPaperViewer({ pdfUrl }) {
    const [numPages, setNumPages] = useState(null);
    const [selectedKeyword, setSelectedKeyword] = useState(null);
    const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
    const [keywordData, setKeywordData] = useState(null);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef(null);

    const onDocumentLoadSuccess = ({ numPages }) => {
        setNumPages(numPages);
    };

    // Highlight keywords in text layer after page renders
    const highlightKeywords = useCallback((pageNumber) => {
        setTimeout(() => {
            const textLayer = document.querySelector(
                `.react-pdf__Page[data-page-number="${pageNumber}"] .react-pdf__Page__textContent`
            );

            if (!textLayer) return;

            const spans = textLayer.querySelectorAll('span');
            spans.forEach((span) => {
                const text = span.textContent.toLowerCase();

                for (const keyword of KEYWORDS) {
                    if (text.includes(keyword.toLowerCase())) {
                        // Mark this span as a keyword
                        span.classList.add('keyword-highlight');
                        span.dataset.keyword = keyword;
                        span.style.backgroundColor = 'rgba(255, 215, 0, 0.4)';
                        span.style.borderRadius = '3px';
                        span.style.cursor = 'pointer';
                        span.style.transition = 'background-color 0.2s';

                        // Add hover effect
                        span.addEventListener('mouseenter', () => {
                            span.style.backgroundColor = 'rgba(255, 215, 0, 0.7)';
                        });
                        span.addEventListener('mouseleave', () => {
                            span.style.backgroundColor = 'rgba(255, 215, 0, 0.4)';
                        });

                        // Add click handler
                        span.addEventListener('click', (e) => handleKeywordClick(e, keyword));
                        break;
                    }
                }
            });
        }, 100);
    }, []);

    const handleKeywordClick = async (event, keyword) => {
        event.stopPropagation();

        const rect = event.target.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();

        setPopupPosition({
            x: rect.left - containerRect.left + rect.width / 2,
            y: rect.bottom - containerRect.top + 10,
        });

        setSelectedKeyword(keyword);
        setLoading(true);
        setKeywordData(null);

        try {
            const data = await fetchKeywordData(keyword);

            if (data.concept) {
                setKeywordData({
                    keyword: data.concept.name || keyword,
                    definition: data.concept.definition || 'No definition available.',
                    context: `Found in taxonomy: ${data.concept.taxonomy || 'General'}`,
                    siblings: data.siblings || [],
                    descendants: data.descendants || [],
                });
            } else {
                setKeywordData({
                    keyword: keyword,
                    definition: 'This concept was not found in the taxonomy database.',
                    context: 'No taxonomy context available.',
                    siblings: [],
                    descendants: [],
                });
            }
        } catch (error) {
            console.error('Error fetching keyword data:', error);
            setKeywordData({
                keyword: keyword,
                definition: 'Unable to fetch definition. Please try again.',
                context: 'API error occurred.',
                siblings: [],
                descendants: [],
            });
        } finally {
            setLoading(false);
        }
    };

    const handleNodeClick = async (nodeKeyword) => {
        setLoading(true);
        setSelectedKeyword(nodeKeyword);

        try {
            const data = await fetchKeywordData(nodeKeyword);

            if (data.concept) {
                setKeywordData({
                    keyword: data.concept.name || nodeKeyword,
                    definition: data.concept.definition || 'No definition available.',
                    context: `Found in taxonomy: ${data.concept.taxonomy || 'General'}`,
                    siblings: data.siblings || [],
                    descendants: data.descendants || [],
                });
            }
        } catch (error) {
            console.error('Error fetching node data:', error);
        } finally {
            setLoading(false);
        }
    };

    const closePopup = () => {
        setSelectedKeyword(null);
        setKeywordData(null);
    };

    return (
        <div className="pdf-paper-viewer" ref={containerRef}>
            <div className="pdf-header">
                <h1>📄 Paper Reader</h1>
                <p className="pdf-subtitle">Click on highlighted keywords to explore concepts</p>
            </div>

            <div className="pdf-container">
                <Document
                    file={pdfUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={
                        <div className="pdf-loading">
                            <div className="loading-spinner"></div>
                            <p>Loading PDF...</p>
                        </div>
                    }
                    error={
                        <div className="pdf-error">
                            <p>Failed to load PDF. Please check the file path.</p>
                        </div>
                    }
                >
                    {Array.from(new Array(numPages), (el, index) => (
                        <Page
                            key={`page_${index + 1}`}
                            pageNumber={index + 1}
                            className="pdf-page"
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            onRenderSuccess={() => highlightKeywords(index + 1)}
                            width={Math.min(800, window.innerWidth - 80)}
                        />
                    ))}
                </Document>
            </div>

            {selectedKeyword && (
                <KeywordPopup
                    keyword={selectedKeyword}
                    position={popupPosition}
                    onClose={closePopup}
                    data={keywordData}
                    loading={loading}
                    onNodeClick={handleNodeClick}
                />
            )}

            {numPages && (
                <div className="pdf-page-count">
                    {numPages} pages
                </div>
            )}
        </div>
    );
}

export default PDFPaperViewer;
