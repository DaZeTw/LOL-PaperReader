import { Plugin } from "@react-pdf-viewer/core";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

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
}

interface CitationPluginProps {
    onCitationClick?: (citation: Citation, event: MouseEvent) => void;
    pdfUrl?: string; // PDF URL or file path for loading annotations
}

// Store valid citation IDs globally
let validCitationIds: Set<string> = new Set();

export const useCitationPlugin = (props?: CitationPluginProps): Plugin => {
    const { onCitationClick, pdfUrl } = props || {};

    // Load and filter PDF.js annotations on plugin initialization
    const loadPDFAnnotations = async (url: string) => {
        try {
            const pdf = await getDocument(url).promise;
            const allValidIds = new Set<string>();

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

                // Extract IDs and store them
                citationAnnotations.forEach((ann: any) => {
                    if (ann.id) {
                        allValidIds.add(ann.id);
                        console.log(`✓ Valid citation found: ${ann.id} -> ${ann.dest}`);
                    }
                });
            }

            validCitationIds = allValidIds;
            console.log(`📚 Loaded ${validCitationIds.size} valid citation IDs`);
            
        } catch (error) {
            console.error("Failed to load PDF annotations:", error);
        }
    };

    // Initialize PDF annotations if URL is provided
    if (pdfUrl) {
        loadPDFAnnotations(pdfUrl);
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

            // Find all annotation links
            const citationLinks = annotationLayer.querySelectorAll("a[data-annotation-link]");
            
            citationLinks.forEach((link: Element) => {
                const anchorLink = link as HTMLAnchorElement;
                const annotationId = anchorLink.getAttribute("data-annotation-link");
                
                // Skip if already processed
                if (anchorLink.getAttribute("data-citation-processed") === "true") {
                    return;
                }

                // ✨ KEY FILTER: Only process if this ID is in our valid citations list
                if (!annotationId || !validCitationIds.has(annotationId)) {
                    console.log(`❌ Skipping non-citation link: ${annotationId}`);
                    return;
                }

                console.log(`✅ Processing valid citation: ${annotationId}`);

                anchorLink.addEventListener("click", (ev: MouseEvent) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    ev.stopImmediatePropagation();

                    const rect = anchorLink.getBoundingClientRect();
                    const popupX = rect.left + (rect.width / 2);
                    const popupY = rect.bottom + 10;

                    const citation: Citation = {
                        id: annotationId,
                        type: "reference",
                        text: anchorLink.textContent || `Citation ${annotationId}`,
                        position: { x: popupX, y: popupY },
                        confidence: 0.95 // High confidence since it's PDF.js validated
                    };

                    if (onCitationClick) {
                        onCitationClick(citation, ev);
                    } else {
                        showCitationPopup(citation, popupX, popupY);
                    }
                });

                // Remove href to prevent navigation
                anchorLink.removeAttribute("href");
                
                // Add visual styling for valid citations
                anchorLink.style.cursor = "pointer";
                anchorLink.style.borderBottom = "1px dotted #dc2626";
                anchorLink.style.color = "#dc2626";
                anchorLink.style.backgroundColor = "rgba(220, 38, 38, 0.05)";
                anchorLink.style.padding = "1px 2px";
                anchorLink.style.borderRadius = "2px";
                anchorLink.style.transition = "all 0.2s ease";
                
                // Add hover effects
                anchorLink.addEventListener('mouseenter', () => {
                    anchorLink.style.backgroundColor = "rgba(220, 38, 38, 0.1)";
                    anchorLink.style.transform = "translateY(-1px)";
                });
                
                anchorLink.addEventListener('mouseleave', () => {
                    anchorLink.style.backgroundColor = "rgba(220, 38, 38, 0.05)";
                    anchorLink.style.transform = "translateY(0)";
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
                        showCitationPopup(citation, popupX, popupY);
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

function showCitationPopup(citation: Citation, x: number, y: number) {
    // Remove any existing citation popup safely
    const existingPopup = document.querySelector('.citation-popup');
    safeRemoveElement(existingPopup);

    const popup = document.createElement("div");
    popup.className = "citation-popup";
    
    // Enhanced hardcoded popup content
    popup.innerHTML = `
        <div class="citation-header">
            <span class="citation-type">${citation.type.toUpperCase()}</span>
            <span class="citation-id">${citation.id}</span>
        </div>
        <div class="citation-content">
            <div class="citation-text">${citation.text}</div>
            <div class="citation-actions">
                <button class="citation-btn">View Reference</button>
                <button class="citation-btn">Copy</button>
            </div>
        </div>
    `;
    
    // Position popup below the citation
    popup.style.position = "fixed";
    popup.style.left = `${Math.max(10, Math.min(x - 150, window.innerWidth - 320))}px`; // Center popup horizontally
    popup.style.top = `${Math.min(y, window.innerHeight - 150)}px`; // Position below citation
    popup.style.width = "300px";
    popup.style.padding = "16px";
    popup.style.background = "#ffffff";
    popup.style.border = "1px solid #e5e7eb";
    popup.style.borderRadius = "12px";
    popup.style.zIndex = "10000";
    popup.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)";
    popup.style.fontSize = "14px";
    popup.style.fontFamily = "system-ui, -apple-system, sans-serif";
    popup.style.color = "#374151";

    // Style the header
    const header = popup.querySelector('.citation-header') as HTMLElement;
    if (header) {
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        header.style.marginBottom = "12px";
        header.style.paddingBottom = "8px";
        header.style.borderBottom = "1px solid #f3f4f6";
    }

    // Style the type badge
    const typeEl = popup.querySelector('.citation-type') as HTMLElement;
    if (typeEl) {
        typeEl.style.fontSize = "10px";
        typeEl.style.fontWeight = "bold";
        typeEl.style.color = "#ffffff";
        typeEl.style.backgroundColor = "#dc2626";
        typeEl.style.padding = "2px 8px";
        typeEl.style.borderRadius = "4px";
        typeEl.style.textTransform = "uppercase";
    }

    // Style the citation ID
    const idEl = popup.querySelector('.citation-id') as HTMLElement;
    if (idEl) {
        idEl.style.fontSize = "12px";
        idEl.style.fontWeight = "600";
        idEl.style.color = "#6b7280";
    }

    // Style the citation text
    const textEl = popup.querySelector('.citation-text') as HTMLElement;
    if (textEl) {
        textEl.style.marginBottom = "12px";
        textEl.style.fontWeight = "500";
        textEl.style.lineHeight = "1.4";
    }

    // Style the actions
    const actionsEl = popup.querySelector('.citation-actions') as HTMLElement;
    if (actionsEl) {
        actionsEl.style.display = "flex";
        actionsEl.style.gap = "8px";
    }

    // Style the buttons
    popup.querySelectorAll('.citation-btn').forEach((btn) => {
        const button = btn as HTMLElement;
        button.style.flex = "1";
        button.style.padding = "8px 12px";
        button.style.fontSize = "12px";
        button.style.fontWeight = "500";
        button.style.border = "1px solid #d1d5db";
        button.style.borderRadius = "6px";
        button.style.backgroundColor = "#ffffff";
        button.style.color = "#374151";
        button.style.cursor = "pointer";
        button.style.transition = "all 0.2s ease";
        
        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = "#f9fafb";
            button.style.borderColor = "#9ca3af";
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = "#ffffff";
            button.style.borderColor = "#d1d5db";
        });
        
        // Add click handlers for buttons
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            if (button.textContent === 'Copy') {
                navigator.clipboard.writeText(citation.text);
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = 'Copy';
                }, 1000);
            } else if (button.textContent === 'View Reference') {
                // Placeholder for view reference functionality
                console.log('View reference for:', citation.id);
            }
        });
    });

    // Add click-to-close functionality (click outside popup area)
    const closePopup = (e: MouseEvent) => {
        if (!popup.contains(e.target as Node)) {
            safeRemoveElement(popup);
            document.removeEventListener('click', closePopup);
        }
    };
    
    // Delay adding the click listener to prevent immediate closure
    setTimeout(() => {
        document.addEventListener('click', closePopup);
    }, 100);

    // Add escape key to close
    const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            safeRemoveElement(popup);
            document.removeEventListener('keydown', handleEscape);
            document.removeEventListener('click', closePopup);
        }
    };
    document.addEventListener('keydown', handleEscape);

    document.body.appendChild(popup);

    // Auto-close after 10 seconds
    setTimeout(() => {
        safeRemoveElement(popup);
        document.removeEventListener('keydown', handleEscape);
        document.removeEventListener('click', closePopup);
    }, 10000);
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
