import { useMemo } from 'react';
import { escapeRegex } from '../utils/textUtils';

/**
 * HighlightedText component - renders text with clickable highlighted keywords
 * @param {Object} props
 * @param {string} props.text - The full paper text
 * @param {string[]} props.keywords - Array of keywords to highlight
 * @param {Function} props.onKeywordClick - Callback when keyword is clicked (keyword, element)
 * @param {string} props.selectedKeyword - Currently selected keyword (for styling)
 */
export default function HighlightedText({ text, keywords, onKeywordClick, selectedKeyword }) {
    // Create segments of text with keywords marked
    const segments = useMemo(() => {
        if (!keywords || keywords.length === 0) {
            return [{ type: 'text', content: text }];
        }

        // Build regex pattern for all keywords (case-insensitive, whole word preferred)
        const pattern = keywords
            .map(k => `(${escapeRegex(k)})`)
            .join('|');
        const regex = new RegExp(pattern, 'gi');

        const result = [];
        let lastIndex = 0;
        let match;
        let keywordCounter = {};

        while ((match = regex.exec(text)) !== null) {
            // Add text before the match
            if (match.index > lastIndex) {
                result.push({
                    type: 'text',
                    content: text.slice(lastIndex, match.index)
                });
            }

            // Determine which keyword matched
            const matchedText = match[0];
            const matchedKeyword = keywords.find(
                k => k.toLowerCase() === matchedText.toLowerCase()
            ) || matchedText;

            // Track occurrence number for unique IDs
            keywordCounter[matchedKeyword] = (keywordCounter[matchedKeyword] || 0) + 1;

            result.push({
                type: 'keyword',
                content: matchedText,
                keyword: matchedKeyword,
                id: `kw-${matchedKeyword.replace(/\s+/g, '-')}-${keywordCounter[matchedKeyword]}`
            });

            lastIndex = regex.lastIndex;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            result.push({
                type: 'text',
                content: text.slice(lastIndex)
            });
        }

        return result;
    }, [text, keywords]);

    const handleClick = (segment, event) => {
        if (onKeywordClick) {
            onKeywordClick(segment.keyword, event.currentTarget);
        }
    };

    return (
        <div className="highlighted-text">
            {segments.map((segment, index) => {
                if (segment.type === 'text') {
                    return <span key={index}>{segment.content}</span>;
                }

                const isSelected = selectedKeyword?.toLowerCase() === segment.keyword.toLowerCase();

                return (
                    <span
                        key={index}
                        id={segment.id}
                        className={`keyword-highlight ${isSelected ? 'selected' : ''}`}
                        onClick={(e) => handleClick(segment, e)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                handleClick(segment, e);
                            }
                        }}
                    >
                        {segment.content}
                    </span>
                );
            })}
        </div>
    );
}
