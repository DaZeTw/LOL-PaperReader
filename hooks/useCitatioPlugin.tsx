import { Plugin } from "@react-pdf-viewer/core";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { useRef, useEffect } from "react";

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
    extractedData?: any;
}

interface CitationPluginProps {
    onCitationClick?: (citation: Citation, event: MouseEvent) => void;
    pdfUrl?: string;
    extractedCitations?: any[];
}

interface ValidLink {
    element: HTMLAnchorElement;
    id: string;
    destination: string;
    numericId: number;
    suffix: string;
    rect: DOMRect;
}

interface CitationGroup {
    links: ValidLink[];
    groupId: string;
    destination: string;
}

// Store valid citation IDs globally
let validCitationIds: Set<string> = new Set();
let annotationIdToDestination: Map<string, string> = new Map();
let moduleExtractedCitations: any[] = [];
let citationGroups: Map<string, string[]> = new Map();
let annotationToGroup: Map<string, string> = new Map();

// ==================== PDF ANNOTATIONS LOADING ====================

async function loadPDFAnnotations(url: string): Promise<void> {
    console.log('[loadPDFAnnotations] Starting to load annotations from:', url.substring(0, 50));
    
    try {
        const pdf = await getDocument(url).promise;
        const allValidIds = new Set<string>();
        const allAnnotations: Array<{id: string, dest: string, pageNum: number}> = [];

        // Step 1: Process all pages and collect annotations
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const annotations = await page.getAnnotations();

            // Filter for citation annotations only
            const citationAnnotations = annotations.filter((ann: any) => 
                ann.subtype === "Link" && 
                typeof ann.dest === "string" && 
                ann.dest.startsWith("cite.")
            );

            citationAnnotations.forEach((ann: any) => {
                if (ann.id && ann.dest) {
                    allValidIds.add(ann.id);
                    annotationIdToDestination.set(ann.id, ann.dest);
                    allAnnotations.push({
                        id: ann.id,
                        dest: ann.dest,
                        pageNum: pageNum
                    });
                    console.log(`✓ Valid citation found: ${ann.id} -> ${ann.dest} (page ${pageNum})`);
                }
            });
        }

        validCitationIds = allValidIds;
        
        // Step 2: Group mergeable citations
        groupCitations(allAnnotations);
        
        console.log(`✅ Loaded ${allValidIds.size} valid citations from ${pdf.numPages} pages`);
        
    } catch (error) {
        console.error("[loadPDFAnnotations] Failed to load PDF annotations:", error);
        throw error;
    }
}

function groupCitations(allAnnotations: Array<{id: string, dest: string, pageNum: number}>): void {
    console.log('[groupCitations] Starting to group', allAnnotations.length, 'annotations');
    
    citationGroups.clear();
    annotationToGroup.clear();
    
    const processedIds = new Set<string>();

    for (const annotation of allAnnotations) {
        if (processedIds.has(annotation.id)) continue;

        // Extract numeric ID from annotation ID (e.g., "46R" -> 46)
        const numericMatch = annotation.id.match(/^(\d+)(.*)$/);
        if (!numericMatch) {
            // Non-numeric IDs are single citations
            createSingleCitationGroup(annotation, processedIds);
            continue;
        }

        const baseNumber = parseInt(numericMatch[1]);
        const suffix = numericMatch[2];
        const citationDest = annotation.dest;

        // Find consecutive annotations with same destination
        const group = findConsecutiveGroup(annotation, allAnnotations, processedIds, baseNumber, suffix, citationDest);
        
        // Create group mapping
        const groupId = annotation.id;
        citationGroups.set(groupId, group);
        
        group.forEach(id => {
            annotationToGroup.set(id, groupId);
        });

        if (group.length > 1) {
            console.log(`📚 Created citation group ${groupId}: [${group.join(', ')}] -> ${citationDest}`);
        }
    }

    const mergedGroupsCount = Array.from(citationGroups.values()).filter(g => g.length > 1).length;
    console.log(`🔗 Created ${citationGroups.size} citation groups (${mergedGroupsCount} merged groups)`);
}

function createSingleCitationGroup(annotation: {id: string, dest: string, pageNum: number}, processedIds: Set<string>): void {
    const groupId = annotation.id;
    citationGroups.set(groupId, [annotation.id]);
    annotationToGroup.set(annotation.id, groupId);
    processedIds.add(annotation.id);
}

function findConsecutiveGroup(
    annotation: {id: string, dest: string, pageNum: number}, 
    allAnnotations: Array<{id: string, dest: string, pageNum: number}>,
    processedIds: Set<string>,
    baseNumber: number,
    suffix: string,
    citationDest: string
): string[] {
    const group: string[] = [annotation.id];
    processedIds.add(annotation.id);

    let nextNumber = baseNumber + 1;
    let foundConsecutive = true;

    while (foundConsecutive) {
        foundConsecutive = false;
        const nextId = nextNumber.toString() + suffix;
        
        const nextAnnotation = allAnnotations.find(ann => 
            ann.id === nextId && !processedIds.has(ann.id)
        );

        if (nextAnnotation && nextAnnotation.dest === citationDest) {
            group.push(nextAnnotation.id);
            processedIds.add(nextAnnotation.id);
            nextNumber++;
            foundConsecutive = true;
            console.log(`🔗 Grouping ${annotation.id} with ${nextId} (same dest: ${citationDest})`);
        }
    }

    return group;
}

// ==================== CITATION LINK PROCESSING ====================

function collectValidLinks(annotationLayer: HTMLElement): ValidLink[] {
    const citationLinks = Array.from(annotationLayer.querySelectorAll("a[data-annotation-link]"));
    console.log(`🔍 Found ${citationLinks.length} annotation links in layer`);

    const validLinks: ValidLink[] = [];

    citationLinks.forEach((link: Element) => {
        const anchorLink = link as HTMLAnchorElement;
        const annotationId = anchorLink.getAttribute("data-annotation-link");
        
        if (!annotationId || 
            !validCitationIds.has(annotationId) ||
            anchorLink.getAttribute("data-citation-processed") === "true") {
            return;
        }

        const destination = annotationIdToDestination.get(annotationId);
        if (!destination) return;

        const match = annotationId.match(/^(\d+)(.*)$/);
        if (!match) return;

        const numericId = parseInt(match[1]);
        const suffix = match[2];

        validLinks.push({
            element: anchorLink,
            id: annotationId,
            destination,
            numericId,
            suffix,
            rect: anchorLink.getBoundingClientRect()
        });
    });

    console.log(`✅ Found ${validLinks.length} valid citation links`);
    return validLinks;
}

function createMergedGroups(validLinks: ValidLink[]): CitationGroup[] {
    const processedIds = new Set<string>();
    const mergedGroups: CitationGroup[] = [];

    // Sort by numeric ID to process in order
    validLinks.sort((a, b) => a.numericId - b.numericId);

    for (const link of validLinks) {
        if (processedIds.has(link.id)) continue;

        const group = [link];
        processedIds.add(link.id);

        // Look for consecutive links with same destination
        let nextId = link.numericId + 1;
        let foundConsecutive = true;

        while (foundConsecutive) {
            foundConsecutive = false;
            const nextLink = validLinks.find(l => 
                l.numericId === nextId && 
                l.suffix === link.suffix && 
                l.destination === link.destination &&
                !processedIds.has(l.id)
            );

            if (nextLink) {
                group.push(nextLink);
                processedIds.add(nextLink.id);
                nextId++;
                foundConsecutive = true;
            }
        }

        mergedGroups.push({
            links: group,
            groupId: link.id,
            destination: link.destination
        });

        if (group.length > 1) {
            console.log(`🔗 Created merge group: [${group.map(l => l.id).join(', ')}] -> ${link.destination}`);
        }
    }

    return mergedGroups;
}

// ==================== CITATION STYLING AND INTERACTION ====================

function applyCitationStyling(element: HTMLElement, annotationId: string): void {
    Object.assign(element.style, {
        cursor: "pointer",
        borderBottom: "2px solid #dc2626",
        color: "#dc2626",
        backgroundColor: "rgba(220, 38, 38, 0.1)",
        padding: "2px 4px",
        borderRadius: "4px",
        transition: "all 0.2s ease",
        fontWeight: "600",
        textDecoration: "none"
    });
    element.title = `Click to view citation details: ${annotationId}`;
}

function addHoverEffects(element: HTMLElement): void {
    element.addEventListener('mouseenter', () => {
        element.style.backgroundColor = "rgba(220, 38, 38, 0.2)";
        element.style.transform = "translateY(-2px) scale(1.05)";
        element.style.boxShadow = "0 4px 8px rgba(220, 38, 38, 0.3)";
    });
    
    element.addEventListener('mouseleave', () => {
        element.style.backgroundColor = "rgba(220, 38, 38, 0.1)";
        element.style.transform = "translateY(0) scale(1)";
        element.style.boxShadow = "none";
    });
}

function setupSingleCitationLink(anchorLink: HTMLAnchorElement, annotationId: string): void {
    const citationDestination = annotationIdToDestination.get(annotationId);
    console.log(`✅ Processing single citation: ${annotationId} -> ${citationDestination}`);

    try {
        // Add click handler
        anchorLink.addEventListener("click", (ev: MouseEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();

            console.log(`🖱️ Single citation clicked: ${annotationId}`);
            handleCitationClick(annotationId, citationDestination, anchorLink, ev);
        }, { capture: true });

        // Remove href to prevent navigation
        anchorLink.removeAttribute("href");
        
        // Apply citation styling
        applyCitationStyling(anchorLink, annotationId);
        addHoverEffects(anchorLink);
        
        // Mark as processed
        anchorLink.setAttribute("data-citation-processed", "true");
        anchorLink.setAttribute("data-citation", "true");
        anchorLink.setAttribute("data-citation-id", annotationId);

    } catch (error) {
        console.error(`❌ Failed to setup single citation ${annotationId}:`, error);
    }
}

function createMergedCitationGroup(group: CitationGroup): void {
    const firstLink = group.links[0].element;
    const lastLink = group.links[group.links.length - 1].element;
    
    console.log(`🔗 Creating merged citation for ${group.links.length} links: [${group.links.map(l => l.id).join(', ')}]`);

    // Check if links are visually adjacent
    if (!areLinksVisuallyAdjacent(firstLink, lastLink)) {
        console.log(`⚠️ Links not visually adjacent, treating as separate citations`);
        group.links.forEach(link => {
            setupSingleCitationLink(link.element, link.id);
        });
        return;
    }

    try {
        const fullCitationText = extractFullCitationText(firstLink, lastLink);
        setupMergedCitationElement(group, firstLink, fullCitationText);
        
        console.log(`✅ Successfully merged citation: "${fullCitationText}" for group ${group.groupId}`);

    } catch (error) {
        console.error(`❌ Failed to create merged citation for group ${group.groupId}:`, error);
        // Fallback: treat as individual citations
        group.links.forEach(link => {
            setupSingleCitationLink(link.element, link.id);
        });
    }
}

function areLinksVisuallyAdjacent(firstLink: HTMLElement, lastLink: HTMLElement): boolean {
    const firstRect = firstLink.getBoundingClientRect();
    const lastRect = lastLink.getBoundingClientRect();
    const maxDistance = 150;
    
    return Math.abs(lastRect.right - firstRect.left) < maxDistance ||
           Math.abs(firstRect.right - lastRect.left) < maxDistance ||
           Math.abs(lastRect.left - firstRect.right) < maxDistance;
}

function extractFullCitationText(firstLink: HTMLElement, lastLink: HTMLElement): string {
    const parentElement = firstLink.parentElement;
    if (!parentElement) {
        throw new Error('No parent element found');
    }

    const parentText = parentElement.textContent || '';
    const firstLinkText = firstLink.textContent || '';
    const lastLinkText = lastLink.textContent || '';
    
    console.log(`📍 Parent text: "${parentText}"`);
    console.log(`📍 First link: "${firstLinkText}"`);
    console.log(`📍 Last link: "${lastLinkText}"`);

    const firstPos = parentText.indexOf(firstLinkText);
    const lastPos = parentText.lastIndexOf(lastLinkText);
    
    if (firstPos === -1 || lastPos === -1) {
        throw new Error('Could not locate link positions in parent text');
    }

    const fullCitationText = parentText.substring(firstPos, lastPos + lastLinkText.length).trim();
    console.log(`📝 Extracted full citation text: "${fullCitationText}"`);
    
    return fullCitationText;
}

function setupMergedCitationElement(group: CitationGroup, primaryLink: HTMLElement, fullCitationText: string): void {
    // Update the primary link with the full citation text
    primaryLink.textContent = fullCitationText;
    
    // Hide all other links in the group
    group.links.slice(1).forEach(link => {
        link.element.style.display = 'none';
        link.element.removeAttribute("href");
        link.element.setAttribute("data-citation-processed", "true");
    });
    
    // Style the primary link
    primaryLink.removeAttribute("href");
    
    // Apply enhanced citation styling to primary link
    Object.assign(primaryLink.style, {
        cursor: "pointer",
        color: "#dc2626",
        backgroundColor: "rgba(220, 38, 38, 0.1)",
        borderBottom: "2px solid #dc2626",
        padding: "2px 4px",
        borderRadius: "4px",
        transition: "all 0.2s ease",
        fontWeight: "600",
        textDecoration: "none",
        display: "inline"
    });

    primaryLink.title = `Click to view citation: ${group.groupId} (merged ${group.links.length} parts) - ${fullCitationText}`;

    // Add click handler to the primary link
    primaryLink.addEventListener("click", (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();

        console.log(`🖱️ Merged citation clicked: ${group.groupId} (${group.links.length} parts)`);
        handleCitationClick(group.groupId, group.destination, primaryLink, ev);
    }, { capture: true });

    // Add hover effects to primary link
    addHoverEffects(primaryLink);

    // Mark primary link as processed
    primaryLink.setAttribute("data-citation-processed", "true");
    primaryLink.setAttribute("data-citation", "true");
    primaryLink.setAttribute("data-citation-id", group.groupId);
    primaryLink.setAttribute("data-citation-group-size", group.links.length.toString());
}

// ==================== CITATION CLICK HANDLING ====================

function handleCitationClick(annotationId: string, citationDestination: string | undefined, element: HTMLElement, ev: MouseEvent): void {
    console.log(`🔍 Handling citation click for: ${annotationId}`);
    
    // Remove any existing popup before showing new one
    removeExistingPopups();

    const rect = element.getBoundingClientRect();
    const popupX = rect.left + (rect.width / 2);
    const popupY = rect.bottom + 10;

    console.log(`🔍 Searching for citation. AnnotationId: ${annotationId}, Available citations:`, moduleExtractedCitations.length);
    console.log(`📍 Annotation ${annotationId} maps to destination:`, citationDestination);

    // Find extracted citation data
    const extractedCitation = findExtractedCitation(annotationId, citationDestination);
    const citationText = extractedCitation?.text || element.textContent || `Citation ${annotationId}`;

    const citation: Citation = {
        id: annotationId,
        type: "reference",
        text: citationText,
        position: { x: popupX, y: popupY },
        confidence: extractedCitation?.confidence || 0.95,
        extractedData: extractedCitation
    };

    // Call handler or show popup
    if (getCurrentCitationClickHandler()) {
        console.log(`📤 Calling onCitationClick handler`);
        getCurrentCitationClickHandler()!(citation, ev);
    } else {
        console.log(`📱 Showing built-in popup`);
        showCitationPopup(citation, popupX, popupY).catch(err => {
            console.error('Failed to show citation popup:', err);
        });
    }
}

function removeExistingPopups(): void {
    const existingPopup = document.querySelector('.citation-popup');
    if (existingPopup) {
        safeRemoveElement(existingPopup);
    }
}

function findExtractedCitation(annotationId: string, citationDestination: string | undefined): any {
    return moduleExtractedCitations.find(extracted => {
        // Try exact match with destination first
        if (citationDestination && extracted.id === citationDestination) {
            console.log(`✓ Found exact destination match for ${annotationId}:`, extracted.id);
            return true;
        }

        // Try matching with annotation ID
        if (extracted.id === annotationId) {
            console.log(`✓ Found exact ID match for ${annotationId}:`, extracted.id);
            return true;
        }

        // Fallback to partial matches
        const idMatch = annotationId.includes(extracted.id.replace('cite.', '')) ||
            extracted.id.includes(annotationId.replace('cite.', ''));

        if (idMatch) {
            console.log(`✓ Found partial match for ${annotationId}:`, extracted.id);
        }
        return idMatch;
    });
}

// ==================== TEXT LAYER PROCESSING ====================

function processTextLayer(textLayer: HTMLElement): void {
    if (textLayer.getAttribute('data-citations-processed') === 'true') {
        return;
    }

    console.log('[processTextLayer] Processing text-based citations');

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

    addTextCitationHandlers(textLayer);
}

function addTextCitationHandlers(textLayer: HTMLElement): void {
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
                confidence: 0.6
            };

            if (getCurrentCitationClickHandler()) {
                getCurrentCitationClickHandler()!(citation, mouseEvent);
            } else {
                showCitationPopup(citation, popupX, popupY).catch(err => {
                    console.error('Failed to show citation popup:', err);
                });
            }
        });

        // Style text-based citations
        styleTextCitation(el as HTMLElement);
    });
}

function styleTextCitation(element: HTMLElement): void {
    element.style.cursor = 'pointer';
    element.style.borderBottom = '1px dotted #3b82f6';
    element.style.color = '#3b82f6';
    element.style.backgroundColor = 'rgba(59, 130, 246, 0.05)';
    element.style.padding = '1px 2px';
    element.style.borderRadius = '2px';
    element.style.transition = 'all 0.2s ease';
}

// ==================== POPUP FUNCTIONS ====================

async function showCitationPopup(citation: Citation, x: number, y: number): Promise<void> {
    console.log(`🎯 Creating citation popup at (${x}, ${y}) for:`, citation);

    const cleanText = citation.text.replace(/^\[\d+\]\s*/, '').trim();
    const isValidCitation = cleanText.length > 20;

    if (!isValidCitation) {
        console.warn('[CitationPopup] Citation text too short, showing basic info only:', citation.text);
    }

    const popup = createPopupElement(x, y);
    
    if (isValidCitation) {
        showLoadingState(popup);
        document.body.appendChild(popup);
        
        try {
            await fetchAndDisplayMetadata(popup, citation);
        } catch (error) {
            showErrorState(popup, citation, error);
        }
    } else {
        showBasicCitationInfo(popup, citation);
        document.body.appendChild(popup);
    }

    setupPopupEventHandlers(popup);
    console.log(`✅ Citation popup created and visible in DOM`);
}

function createPopupElement(x: number, y: number): HTMLDivElement {
    const popup = document.createElement("div");
    popup.className = "citation-popup";

    // Prevent popup clicks from closing it
    popup.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Base popup styles
    Object.assign(popup.style, {
        position: "fixed",
        left: `${Math.max(10, Math.min(x - 192, window.innerWidth - 400))}px`,
        top: `${Math.min(y, window.innerHeight - 200)}px`,
        width: "384px",
        maxHeight: "450px",
        overflowY: "auto",
        padding: "16px",
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        zIndex: "99999",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        fontFamily: "system-ui, -apple-system, sans-serif"
    });

    return popup;
}

function showLoadingState(popup: HTMLElement): void {
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
        <div class="citation-loading" style="display: flex; align-items: center; justify-content: center; padding: 32px 0;">
            <div style="width: 24px; height: 24px; border: 2px solid #e5e7eb; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.6s linear infinite;"></div>
            <span style="margin-left: 8px; font-size: 14px; color: #6b7280;">Loading metadata...</span>
        </div>
    `;

    addSpinAnimation();
}

function showBasicCitationInfo(popup: HTMLElement, citation: Citation): void {
    popup.innerHTML = `
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
}

function showErrorState(popup: HTMLElement, citation: Citation, error: any): void {
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

function addSpinAnimation(): void {
    if (!document.querySelector('#citation-spin-animation')) {
        const style = document.createElement('style');
        style.id = 'citation-spin-animation';
        style.textContent = `
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
}

function setupPopupEventHandlers(popup: HTMLElement): void {
    // Close button handler
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

    // Link hover effects
    popup.querySelectorAll('a').forEach((link) => {
        link.addEventListener('mouseenter', () => {
            (link as HTMLElement).style.color = '#1d4ed8';
        });
        link.addEventListener('mouseleave', () => {
            (link as HTMLElement).style.color = '#2563eb';
        });
    });

    // Escape key and click-to-close
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

    // Auto-close after 15 seconds
    setTimeout(() => {
        if (popup.parentNode) {
            safeRemoveElement(popup);
            document.removeEventListener('keydown', handleEscape);
            document.removeEventListener('click', closePopup);
        }
    }, 15000);
}

// ==================== API FUNCTIONS ====================

async function fetchAndDisplayMetadata(popup: HTMLElement, citation: Citation): Promise<void> {
    const parsed = parseCitation(citation.text);
    const searchTitle = parsed.title || citation.text.replace(/^\[\d+\]\s*/, '').substring(0, 100) || citation.text.substring(0, 100) || 'Unknown';

    console.log('[fetchAndDisplayMetadata] Sending to API:', {
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
        console.error('[fetchAndDisplayMetadata] API error:', response.status, errorData);
        throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[fetchAndDisplayMetadata] Fetched metadata:', data);

    updatePopupWithMetadata(popup, data, citation);
}

function parseCitation(text: string): { title: string; authors: string[]; year?: number } {
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

    console.log('[parseCitation] Parsed citation:', { title: title.substring(0, 50), authors, year });

    return { title, authors, year };
}

function updatePopupWithMetadata(popup: HTMLElement, data: any, citation: Citation): void {
    const formatAuthors = (authors: string[]) => {
        if (!authors || authors.length === 0) return 'Unknown authors';
        if (authors.length <= 2) return authors.join(", ");
        return `${authors.slice(0, 2).join(", ")} et al.`;
    };

    const truncateText = (text: string, maxLength: number = 200) => {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + "...";
    };

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
}

// ==================== UTILITY FUNCTIONS ====================

function safeRemoveElement(element: Element | null): void {
    if (element && element.parentNode) {
        try {
            element.parentNode.removeChild(element);
        } catch (error) {
            try {
                (element as any).remove?.();
            } catch (fallbackError) {
                console.warn('Failed to remove element:', fallbackError);
            }
        }
    }
}

// ==================== GLOBAL STATE ACCESSORS ====================

let currentCitationClickHandler: ((citation: Citation, event: MouseEvent) => void) | undefined;

function setCurrentCitationClickHandler(handler?: (citation: Citation, event: MouseEvent) => void): void {
    currentCitationClickHandler = handler;
}

function getCurrentCitationClickHandler(): ((citation: Citation, event: MouseEvent) => void) | undefined {
    return currentCitationClickHandler;
}

// ==================== MAIN PLUGIN EXPORT ====================

export const useCitationPlugin = (props?: CitationPluginProps): Plugin => {
    const { onCitationClick, pdfUrl, extractedCitations = [] } = props || {};

    // Update module-level citations whenever prop changes
    moduleExtractedCitations = extractedCitations;
    setCurrentCitationClickHandler(onCitationClick);

    console.log('[CitationPlugin] Initialized/Updated with', extractedCitations.length, 'citations');

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

            console.log('[onAnnotationLayerRender] extractedCitations available:', moduleExtractedCitations.length);
            console.log('[onAnnotationLayerRender] citation groups available:', citationGroups.size);

            // Process citations in the annotation layer
            const validLinks = collectValidLinks(annotationLayer);
            const mergedGroups = createMergedGroups(validLinks);

            // Render merged citations and single citations
            mergedGroups.forEach(group => {
                if (group.links.length > 1) {
                    createMergedCitationGroup(group);
                } else {
                    setupSingleCitationLink(group.links[0].element, group.links[0].id);
                }
            });
        },

        onTextLayerRender: (e: PluginRenderEvent) => {
            const textLayer = e.container || e.ele;
            if (!textLayer) return;

            processTextLayer(textLayer);
        },
    };
};