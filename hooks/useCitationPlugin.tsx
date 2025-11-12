import { Plugin } from "@react-pdf-viewer/core";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { useRef, useEffect } from "react";
import { useCitationContext } from "@/contexts/CitationContext";

// Required for PDF.js to work in browser environments
GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

interface PluginRenderEvent {
    container?: HTMLElement;
    ele?: HTMLElement;
}

interface Citation {
    id: string;
    type: "inline" | "reference" | "doi" | "url";
    text: string;
    position?: { x: number; y: number };
    confidence?: number;
    extractedData?: any; // Full extracted citation data
}

interface CitationPluginProps {
    tabId: string; // Tab ID for state isolation
    onCitationClick?: (citation: Citation, event: MouseEvent) => void;
    pdfUrl?: string; // PDF URL or file path for loading annotations
    extractedCitations?: any[]; // Extracted citation data from API
}

/**
 * Citation plugin with per-tab state isolation
 * Uses CitationContext to prevent state pollution between different PDFs
 */
export const useCitationPlugin = (props: CitationPluginProps): Plugin => {
    const { tabId, onCitationClick, pdfUrl, extractedCitations = [] } = props;

    // Get context for managing per-tab citation state
    const citationContext = useCitationContext();

    // Get state for this specific tab
    const tabState = citationContext.getTabState(tabId);

    // Update extracted citations in context whenever prop changes
    useEffect(() => {
        citationContext.updateCitations(tabId, extractedCitations);
    }, [tabId, extractedCitations, citationContext]);

    console.log('[CitationPlugin] Initialized/Updated for tab', tabId, 'with', extractedCitations.length, 'citations');

    // Load and filter PDF.js annotations on plugin initialization
    // Now stores state per-tab instead of globally
    const loadPDFAnnotations = async (url: string) => {
        try {
            const pdf = await getDocument(url).promise;
            const allValidIds = new Set<string>();
            const idToDestMapping = new Map<string, string>();

            // Process all pages
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const annotations = await page.getAnnotations();

                // Filter for citation annotations only
                const citationAnnotations = annotations.filter((ann: any) =>
                    ann.subtype === "Link" &&
                    typeof ann.dest === "string" &&
                    ann.dest.startsWith("cite.")
                );

                // Extract IDs and store mapping for this tab
                citationAnnotations.forEach((ann: any) => {
                    if (ann.id && ann.dest) {
                        allValidIds.add(ann.id);
                        idToDestMapping.set(ann.id, ann.dest);
                        console.log(`✓ Tab ${tabId}: Valid citation found: ${ann.id} -> ${ann.dest}`);
                    }
                });
            }

            // Update context state for this tab
            citationContext.updateValidIds(tabId, allValidIds);
            citationContext.updateAnnotationMapping(tabId, idToDestMapping);
            console.log(`📚 Tab ${tabId}: Loaded ${allValidIds.size} valid citation IDs`);

        } catch (error) {
            console.error(`Tab ${tabId}: Failed to load PDF annotations:`, error);
        }
    };

    // Initialize PDF annotations if URL is provided
    if (pdfUrl) {
        loadPDFAnnotations(pdfUrl).catch(err =>
            console.error("Failed to initialize PDF annotations:", err)
        );
    }

    return {
        onDocumentLoad: async (e: any) => {
            // If PDF URL wasn't provided in props, try to get it from the document
            if (!pdfUrl && e.doc) {
                try {
                    // Attempt to extract PDF source and load annotations
                    const pdfSource = e.doc.loadingTask?.source;
                    if (pdfSource) {
                        await loadPDFAnnotations(pdfSource);
                    }
                } catch (error) {
                    console.warn("Could not auto-load PDF annotations:", error);
                }
            }
        },

        onAnnotationLayerRender: (e: PluginRenderEvent) => {
            const annotationLayer = e.container || e.ele;
            if (!annotationLayer) return;

            // Get current state for this tab (refreshed on each render)
            const currentTabState = citationContext.getTabState(tabId);

            console.log(`[Tab ${tabId}] onAnnotationLayerRender - extractedCitations available:`, currentTabState.extractedCitations.length);

            // Find all annotation links
            const citationLinks = annotationLayer.querySelectorAll("a[data-annotation-link]");

            citationLinks.forEach((link: Element) => {
                const anchorLink = link as HTMLAnchorElement;
                const annotationId = anchorLink.getAttribute("data-annotation-link");

                // Skip if already processed
                if (anchorLink.getAttribute("data-citation-processed") === "true") {
                    return;
                }

                // ✨ KEY FILTER: Only process if this ID is in our valid citations list for THIS tab
                if (!annotationId || !currentTabState.validCitationIds.has(annotationId)) {
                    console.log(`❌ Tab ${tabId}: Skipping non-citation link: ${annotationId}`);
                    return;
                }

                console.log(`✅ Tab ${tabId}: Processing valid citation: ${annotationId}`);

                // Use capture phase to ensure we get the event first
                // IMPORTANT: Create closure over tabId to ensure correct state is accessed
                anchorLink.addEventListener("click", (ev: MouseEvent) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    ev.stopImmediatePropagation();

                    console.log(`🖱️ Tab ${tabId}: Citation clicked: ${annotationId}`, ev);

                    // Remove any existing popup before showing new one
                    const existingPopup = document.querySelector('.citation-popup');
                    if (existingPopup) {
                        safeRemoveElement(existingPopup);
                    }

                    const rect = anchorLink.getBoundingClientRect();
                    const popupX = rect.left + (rect.width / 2);
                    const popupY = rect.bottom + 10;

                    // Get fresh state from context (not closure) to avoid stale data
                    const freshTabState = citationContext.getTabState(tabId);

                    console.log(`🔍 Tab ${tabId}: Searching for citation. AnnotationId: ${annotationId}, Available citations:`, freshTabState.extractedCitations.length);

                    // Get the citation destination (cite.xxx) from the annotation ID for THIS tab
                    const citationDestination = freshTabState.annotationIdToDestination.get(annotationId);
                    console.log(`📍 Tab ${tabId}: Annotation ${annotationId} maps to destination:`, citationDestination);

                    // Match by destination using THIS tab's citations
                    const extractedCitation = freshTabState.extractedCitations.find(extracted => {
                        // Try exact match with destination first
                        if (citationDestination && extracted.id === citationDestination) {
                            console.log(`✓ Tab ${tabId}: Found exact match for ${annotationId}:`, extracted.id, 'Text length:', extracted.text?.length);
                            return true;
                        }

                        // Fallback to partial matches
                        const idMatch = extracted.id === annotationId ||
                            annotationId.includes(extracted.id.replace('cite.', '')) ||
                            extracted.id.includes(annotationId.replace('cite.', ''));

                        if (idMatch) {
                            console.log(`✓ Tab ${tabId}: Found partial match for ${annotationId}:`, extracted.id, 'Text length:', extracted.text?.length);
                        }
                        return idMatch;
                    });

                    if (!extractedCitation) {
                        console.warn(`❌ Tab ${tabId}: No extracted citation found for ${annotationId} (dest: ${citationDestination}). Available IDs:`,
                            freshTabState.extractedCitations.slice(0, 5).map(c => c.id));
                    }

                    const citationText = extractedCitation?.text || anchorLink.textContent || `Citation ${annotationId}`;
                    console.log(`📝 Tab ${tabId}: Citation text (length ${citationText.length}):`, citationText.substring(0, 100));

                    const citation: Citation = {
                        id: annotationId,
                        type: "reference",
                        text: citationText,
                        position: { x: popupX, y: popupY },
                        confidence: extractedCitation?.confidence || 0.95,
                        // Add extracted citation data
                        extractedData: extractedCitation
                    };

                    console.log(`📋 Tab ${tabId}: Citation data created. Text length: ${citation.text.length}, Has extracted data: ${!!extractedCitation}`);

                    if (onCitationClick) {
                        console.log(`📤 Tab ${tabId}: Calling onCitationClick handler`);
                        onCitationClick(citation, ev);
                    } else {
                        console.log(`📱 Tab ${tabId}: Showing built-in popup`);
                        showCitationPopup(citation, popupX, popupY).catch(err => {
                            console.error(`Tab ${tabId}: Failed to show citation popup:`, err);
                        });
                    }
                }, { capture: true });

                // Remove href to prevent navigation
                anchorLink.removeAttribute("href");
                
                // Add visual styling for valid citations
                anchorLink.style.cursor = "pointer";
                anchorLink.style.borderBottom = "2px solid #dc2626";
                anchorLink.style.color = "#dc2626";
                anchorLink.style.backgroundColor = "rgba(220, 38, 38, 0.1)";
                anchorLink.style.padding = "2px 4px";
                anchorLink.style.borderRadius = "4px";
                anchorLink.style.transition = "all 0.2s ease";
                anchorLink.style.fontWeight = "600";
                anchorLink.style.textDecoration = "none";
                anchorLink.title = `Click to view citation details: ${annotationId}`;
                
                // Add hover effects
                anchorLink.addEventListener('mouseenter', () => {
                    anchorLink.style.backgroundColor = "rgba(220, 38, 38, 0.2)";
                    anchorLink.style.transform = "translateY(-2px) scale(1.05)";
                    anchorLink.style.boxShadow = "0 4px 8px rgba(220, 38, 38, 0.3)";
                });
                
                anchorLink.addEventListener('mouseleave', () => {
                    anchorLink.style.backgroundColor = "rgba(220, 38, 38, 0.1)";
                    anchorLink.style.transform = "translateY(0) scale(1)";
                    anchorLink.style.boxShadow = "none";
                });
                
                // Mark as processed
                anchorLink.setAttribute("data-citation-processed", "true");
                anchorLink.setAttribute("data-citation", "true");
                anchorLink.setAttribute("data-citation-id", annotationId);
            });
        },

        // Keep the text layer render for text-based citations (optional)
        onTextLayerRender: (e: PluginRenderEvent) => {
            // This can remain for detecting inline citations in text
            // but will have lower confidence than annotation-based ones
            const textLayer = e.container || e.ele;
            if (!textLayer) return;

            if (textLayer.getAttribute('data-citations-processed') === 'true') {
                return;
            }

            // Only process basic text patterns with lower confidence
            const citationPatterns = [
                { pattern: /\[\d+\]/g, type: "reference" as const },
                { pattern: /\(\w+\s+\d{4}\)/g, type: "inline" as const }
            ];

            let htmlContent = textLayer.innerHTML;
            
            citationPatterns.forEach(({ pattern, type }) => {
                htmlContent = htmlContent.replace(pattern, (match: string) => {
                    const id = `text-cite-${type}-${Math.random().toString(36).substr(2, 9)}`;
                    return `<span class="inline-citation citation-${type}" data-cite="${match}" data-type="${type}" data-id="${id}">${match}</span>`;
                });
            });

            textLayer.innerHTML = htmlContent;
            textLayer.setAttribute('data-citations-processed', 'true');

            // Add click handlers with lower confidence
            textLayer.querySelectorAll(".inline-citation").forEach((el: Element) => {
                el.addEventListener("click", (ev: Event) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    
                    const cite = el.getAttribute("data-cite");
                    const type = el.getAttribute("data-type") as Citation["type"];
                    const id = el.getAttribute("data-id");
                    const mouseEvent = ev as MouseEvent;

                    const rect = (el as HTMLElement).getBoundingClientRect();
                    const popupX = rect.left + (rect.width / 2);
                    const popupY = rect.bottom + 10;

                    const citation: Citation = {
                        id: id || `text-citation-${Date.now()}`,
                        type: type || "inline",
                        text: cite || "Text citation",
                        position: { x: popupX, y: popupY },
                        confidence: 0.6 // Lower confidence for text-based detection
                    };

                    if (onCitationClick) {
                        onCitationClick(citation, mouseEvent);
                    } else {
                        showCitationPopup(citation, popupX, popupY).catch(err => {
                            console.error('Failed to show citation popup:', err);
                        });
                    }
                });

                // Style text-based citations differently
                (el as HTMLElement).style.cursor = 'pointer';
                (el as HTMLElement).style.borderBottom = '1px dotted #3b82f6';
                (el as HTMLElement).style.color = '#3b82f6';
                (el as HTMLElement).style.backgroundColor = 'rgba(59, 130, 246, 0.05)';
                (el as HTMLElement).style.padding = '1px 2px';
                (el as HTMLElement).style.borderRadius = '2px';
                (el as HTMLElement).style.transition = 'all 0.2s ease';
            });
        },
    };
};

// Utility function to safely remove DOM elements
function safeRemoveElement(element: Element | null) {
    if (element && element.parentNode) {
        try {
            element.parentNode.removeChild(element);
        } catch (error) {
            // Fallback to remove() method if removeChild fails
            try {
                (element as any).remove?.();
            } catch (fallbackError) {
                console.warn('Failed to remove element:', fallbackError);
            }
        }
    }
}

function detectCitationType(href: string | null): Citation["type"] {
    if (!href) return "inline";
    
    if (href.includes("doi")) return "doi";
    if (href.startsWith("http")) return "url";
    if (href.includes("cite.") || href.includes("#ref")) return "reference";
    
    return "inline";
}

async function showCitationPopup(citation: Citation, x: number, y: number) {
    console.log(`🎯 Creating citation popup at (${x}, ${y}) for:`, citation);

    // Validate citation text - must be meaningful (more than just a number)
    const cleanText = citation.text.replace(/^\[\d+\]\s*/, '').trim();
    const isValidCitation = cleanText.length > 20; // Need at least some meaningful text

    if (!isValidCitation) {
        console.warn('[CitationPopup] Citation text too short, showing basic info only:', citation.text);
    }

    const popup = document.createElement("div");
    popup.className = "citation-popup";

    // Prevent popup clicks from closing it
    popup.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Base popup styles
    popup.style.position = "fixed";
    popup.style.left = `${Math.max(10, Math.min(x - 192, window.innerWidth - 400))}px`;
    popup.style.top = `${Math.min(y, window.innerHeight - 200)}px`;
    popup.style.width = "384px";
    popup.style.maxHeight = "450px";
    popup.style.overflowY = "auto";
    popup.style.padding = "16px";
    popup.style.background = "#ffffff";
    popup.style.border = "1px solid #e5e7eb";
    popup.style.borderRadius = "8px";
    popup.style.zIndex = "99999";
    popup.style.boxShadow = "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)";
    popup.style.fontFamily = "system-ui, -apple-system, sans-serif";

    // Show loading state initially only if citation text is valid
    popup.innerHTML = isValidCitation ? `
        <div class="citation-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: #6b7280;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                <span>Citation Details</span>
            </div>
            <button class="citation-close" style="color: #9ca3af; cursor: pointer; border: none; background: none; padding: 0;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <div class="citation-loading" style="display: flex; align-items: center; justify-content: center; padding: 32px 0;">
            <div style="width: 24px; height: 24px; border: 2px solid #e5e7eb; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.6s linear infinite;"></div>
            <span style="margin-left: 8px; font-size: 14px; color: #6b7280;">Loading metadata...</span>
        </div>
    ` : `
        <div class="citation-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: #6b7280;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                <span>Citation</span>
            </div>
            <button class="citation-close" style="color: #9ca3af; cursor: pointer; border: none; background: none; padding: 0;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <div style="text-align: center; padding: 24px 0;">
            <div style="font-size: 48px; margin-bottom: 12px;">${citation.text}</div>
            <div style="color: #6b7280; font-size: 14px; margin-bottom: 8px;">Citation Reference</div>
            <div style="color: #9ca3af; font-size: 12px; font-style: italic;">
                Unable to fetch full citation details.<br/>
                Please ensure extracted citations are loaded.
            </div>
        </div>
    `;

    // Add spin animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // Append to body immediately
    document.body.appendChild(popup);

    // If citation text is not valid, skip API call and just show basic info
    if (!isValidCitation) {
        // Add close button handler for basic popup
        const closeBtn = popup.querySelector('.citation-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                safeRemoveElement(popup);
            });
            closeBtn.addEventListener('mouseenter', () => {
                (closeBtn as HTMLElement).style.color = '#374151';
            });
            closeBtn.addEventListener('mouseleave', () => {
                (closeBtn as HTMLElement).style.color = '#9ca3af';
            });
        }

        // Add event handlers for closing
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                safeRemoveElement(popup);
                document.removeEventListener('keydown', handleEscape);
                document.removeEventListener('click', closePopup);
            }
        };
        document.addEventListener('keydown', handleEscape);

        const closePopup = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!popup.contains(target) &&
                !(target as Element).closest?.('[data-citation-processed="true"]')) {
                safeRemoveElement(popup);
                document.removeEventListener('click', closePopup);
                document.removeEventListener('keydown', handleEscape);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closePopup);
        }, 300);

        void popup.offsetHeight;
        console.log(`✅ Basic citation popup created`);

        return; // Exit early - don't fetch API
    }

    // Parse citation text to extract metadata
    const parseCitation = (text: string) => {
        const cleanText = text.replace(/^\[\d+\]\s*/, '');
        const yearMatch = cleanText.match(/\b(19\d{2}|20\d{2})\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : undefined;

        const parts = cleanText.split('.');
        const authorsText = parts[0]?.trim() || '';
        const authors = authorsText ? authorsText.split(/,\s*(?:and\s+)?|(?:\s+and\s+)/i).map(a => a.trim()) : [];

        let title = '';

        // Try multiple strategies to extract title
        if (year) {
            const afterYear = cleanText.substring(cleanText.indexOf(year.toString()) + 4).trim();
            const segments = afterYear.split('.').filter(s => s.trim().length > 0);
            if (segments.length >= 2) {
                title = segments.slice(0, -2).join('. ').trim();
            } else if (segments.length === 1) {
                title = segments[0].trim();
            }
        }

        // Fallback: try to get title from segments
        if (!title || title.length < 10) {
            const segments = parts.slice(1).filter(s => s.trim().length > 0);
            if (segments.length >= 2) {
                title = segments.slice(0, -1).join('. ').trim();
            } else if (segments.length > 0) {
                title = segments[0].trim();
            }
        }

        // Final fallback: use first 100 chars of clean text
        if (!title || title.length < 5) {
            title = cleanText.substring(0, 100).trim();
        }

        console.log('[CitationPopup] Parsed citation:', { title: title.substring(0, 50), authors, year });

        return { title, authors, year };
    };

    const parsed = parseCitation(citation.text);

    // Fetch citation metadata from API
    try {
        // Ensure we have a valid title (required by API)
        const searchTitle = parsed.title || citation.text.replace(/^\[\d+\]\s*/, '').substring(0, 100) || citation.text.substring(0, 100) || 'Unknown';

        console.log('[CitationPopup] Sending to API:', {
            title: searchTitle.substring(0, 50),
            authors: parsed.authors?.join(", "),
            year: parsed.year,
            fullCitationLength: citation.text.length
        });

        const response = await fetch("/api/references/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                title: searchTitle,
                authors: parsed.authors?.join(", ") || undefined,
                year: parsed.year?.toString() || undefined,
                fullCitation: citation.text,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            console.error('[CitationPopup] API error:', response.status, errorData);
            throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        console.log('[CitationPopup] Fetched metadata:', data);

        // Format authors
        const formatAuthors = (authors: string[]) => {
            if (!authors || authors.length === 0) return 'Unknown authors';
            if (authors.length <= 2) return authors.join(", ");
            return `${authors.slice(0, 2).join(", ")} et al.`;
        };

        // Truncate abstract
        const truncateText = (text: string, maxLength: number = 200) => {
            if (!text || text.length <= maxLength) return text;
            return text.substring(0, maxLength).trim() + "...";
        };

        // Update popup with fetched data
        popup.innerHTML = `
            <div class="citation-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: #6b7280;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    <span>Citation Details</span>
                </div>
                <button class="citation-close" style="color: #9ca3af; cursor: pointer; border: none; background: none; padding: 0; transition: color 0.2s;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <div style="margin-bottom: 12px;">
                <h3 style="font-weight: 600; color: #111827; font-size: 14px; line-height: 1.4; margin-bottom: 4px;">
                    ${data.title || citation.text}
                </h3>
                ${data.url ? `
                    <a href="${data.url}" target="_blank" rel="noopener noreferrer"
                       style="display: inline-flex; align-items: center; font-size: 12px; color: #2563eb; text-decoration: none; transition: color 0.2s;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        View Paper
                    </a>
                ` : ''}
            </div>

            ${data.authors && data.authors.length > 0 ? `
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #9ca3af;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    <span style="font-size: 12px; color: #374151;">${formatAuthors(data.authors)}</span>
                </div>
            ` : ''}

            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px; font-size: 12px; color: #6b7280;">
                ${data.year ? `
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        <span>${data.year}</span>
                    </div>
                ` : ''}
                ${data.venue ? `
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${truncateText(data.venue, 30)}</span>
                    </div>
                ` : ''}
            </div>

            ${data.abstract ? `
                <div style="margin-bottom: 12px;">
                    <div style="font-size: 12px; font-weight: 500; color: #374151; margin-bottom: 4px;">Abstract</div>
                    <p style="font-size: 12px; color: #6b7280; line-height: 1.5;">
                        ${truncateText(data.abstract, 200)}
                    </p>
                </div>
            ` : ''}

            ${(data.doi || data.arxivId) ? `
                <div style="padding-top: 12px; border-top: 1px solid #f3f4f6;">
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px;">
                        ${data.doi ? `<span style="padding: 4px 8px; background: #f3f4f6; color: #374151; border-radius: 4px;">DOI: ${data.doi}</span>` : ''}
                        ${data.arxivId ? `<span style="padding: 4px 8px; background: #fed7aa; color: #c2410c; border-radius: 4px;">arXiv: ${data.arxivId}</span>` : ''}
                    </div>
                </div>
            ` : ''}
        `;

    } catch (error) {
        console.error('[CitationPopup] Failed to fetch metadata:', error);

        // Show error state
        popup.innerHTML = `
            <div class="citation-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: #6b7280;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    <span>Citation Details</span>
                </div>
                <button class="citation-close" style="color: #9ca3af; cursor: pointer; border: none; background: none; padding: 0;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <div style="text-align: center; padding: 32px 0;">
                <div style="color: #ef4444; font-size: 14px; margin-bottom: 8px;">Failed to load metadata</div>
                <div style="color: #9ca3af; font-size: 12px; margin-bottom: 12px;">${error instanceof Error ? error.message : 'Unknown error'}</div>
                <div style="color: #6b7280; font-size: 12px; line-height: 1.5; margin-bottom: 12px; max-height: 100px; overflow-y: auto;">
                    ${citation.text}
                </div>
            </div>
        `;
    }

    // Add close button handler
    const closeBtn = popup.querySelector('.citation-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            safeRemoveElement(popup);
        });
        closeBtn.addEventListener('mouseenter', () => {
            (closeBtn as HTMLElement).style.color = '#374151';
        });
        closeBtn.addEventListener('mouseleave', () => {
            (closeBtn as HTMLElement).style.color = '#9ca3af';
        });
    }

    // Add link hover effects
    popup.querySelectorAll('a').forEach((link) => {
        link.addEventListener('mouseenter', () => {
            (link as HTMLElement).style.color = '#1d4ed8';
        });
        link.addEventListener('mouseleave', () => {
            (link as HTMLElement).style.color = '#2563eb';
        });
    });

    // Add escape key to close
    const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            safeRemoveElement(popup);
            document.removeEventListener('keydown', handleEscape);
            document.removeEventListener('click', closePopup);
        }
    };
    document.addEventListener('keydown', handleEscape);

    // Add click-to-close functionality (click outside popup area)
    const closePopup = (e: MouseEvent) => {
        const target = e.target as Node;
        // Check if click is outside popup and not on a citation link
        if (!popup.contains(target) &&
            !(target as Element).closest?.('[data-citation-processed="true"]')) {
            safeRemoveElement(popup);
            document.removeEventListener('click', closePopup);
            document.removeEventListener('keydown', handleEscape);
        }
    };

    // Delay adding the click listener to prevent immediate closure from the same click event
    setTimeout(() => {
        document.addEventListener('click', closePopup);
    }, 300);

    // Force a reflow to ensure the popup is rendered
    void popup.offsetHeight;

    console.log(`✅ Citation popup created and visible in DOM`);

    // Auto-close after 15 seconds
    setTimeout(() => {
        if (popup.parentNode) {
            safeRemoveElement(popup);
            document.removeEventListener('keydown', handleEscape);
            document.removeEventListener('click', closePopup);
        }
    }, 15000);
}

function getCitationTypeColor(type: Citation["type"]): string {
    switch (type) {
        case "reference": return "#dc2626"; // red
        case "inline": return "#2563eb"; // blue
        case "doi": return "#059669"; // green
        case "url": return "#7c3aed"; // purple
        default: return "#374151"; // gray
    }
}