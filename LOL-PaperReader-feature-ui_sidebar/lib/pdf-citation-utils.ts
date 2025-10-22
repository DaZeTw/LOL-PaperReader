import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export interface CitationLink {
  rect: number[]; // [x1, y1, x2, y2] in PDF coordinates
  dest: string | any[]; // Destination reference
  pageNum: number;
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface ReferencePreview {
  text: string;
  pageNum: number;
}

/**
 * Convert PDF rectangle coordinates to viewport coordinates
 */
export function convertPDFRectToViewport(
  rect: number[],
  viewport: pdfjsLib.PageViewport
): { left: number; top: number; width: number; height: number } {
  // PDF rect format: [x1, y1, x2, y2]
  const [x1, y1, x2, y2] = rect;

  // Convert to viewport coordinates
  const topLeft = viewport.convertToViewportPoint(x1, y2);
  const bottomRight = viewport.convertToViewportPoint(x2, y1);

  return {
    left: topLeft[0],
    top: topLeft[1],
    width: bottomRight[0] - topLeft[0],
    height: bottomRight[1] - topLeft[1],
  };
}

/**
 * Extract citation links from a PDF page
 */
export async function extractCitationLinks(
  page: pdfjsLib.PDFPageProxy,
  pageNum: number
): Promise<CitationLink[]> {
  const annotations = await page.getAnnotations();
  const viewport = page.getViewport({ scale: 1.0 });

  const citationLinks = annotations
    .filter(annotation => {
      // Filter for Link annotations with internal destinations
      return (
        annotation.subtype === 'Link' &&
        annotation.dest && // Has internal destination
        !annotation.url    // Not an external URL
      );
    })
    .map(link => ({
      rect: link.rect,
      dest: link.dest,
      pageNum,
      bounds: convertPDFRectToViewport(link.rect, viewport),
    }));

  return citationLinks;
}

/**
 * Extract all citation links from a PDF document
 */
export async function extractAllCitationLinks(
  pdf: pdfjsLib.PDFDocumentProxy
): Promise<CitationLink[]> {
  const allLinks: CitationLink[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const links = await extractCitationLinks(page, i);
    allLinks.push(...links);
  }

  return allLinks;
}

/**
 * Get reference text at a specific destination
 */
export async function getReferenceAtDestination(
  pdf: pdfjsLib.PDFDocumentProxy,
  dest: string | any[]
): Promise<ReferencePreview | null> {
  try {
    // Resolve destination to page number
    const destArray = typeof dest === 'string'
      ? await pdf.getDestination(dest)
      : dest;

    if (!destArray || destArray.length === 0) {
      return null;
    }

    // Get page index from destination reference
    const pageIndex = await pdf.getPageIndex(destArray[0]);
    const page = await pdf.getPage(pageIndex + 1);

    // Extract text content
    const textContent = await page.getTextContent();

    // Get the Y-coordinate of the destination
    const targetY = destArray[3] || 0;
    const viewport = page.getViewport({ scale: 1.0 });

    // Find text items near the destination Y-coordinate
    // Group text items by vertical position to reconstruct lines
    const textItems = textContent.items as any[];

    // Convert target Y from PDF to viewport coordinates
    const viewportPoint = viewport.convertToViewportPoint(0, targetY);
    const targetViewportY = viewportPoint[1];

    // Find text within ~50px of the target Y position
    const nearbyItems = textItems.filter(item => {
      const itemY = item.transform[5];
      return Math.abs(itemY - targetViewportY) < 50;
    });

    // Sort by Y position (top to bottom) then X position (left to right)
    nearbyItems.sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5]; // Reverse Y (PDF coords)
      if (Math.abs(yDiff) > 5) return yDiff;
      return a.transform[4] - b.transform[4]; // X position
    });

    // Extract text and clean it up
    const referenceText = nearbyItems
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      text: referenceText.slice(0, 500), // Limit to 500 chars
      pageNum: pageIndex + 1,
    };
  } catch (error) {
    console.error('Error getting reference at destination:', error);
    return null;
  }
}

/**
 * Get page number from destination
 */
export async function getPageNumberFromDestination(
  pdf: pdfjsLib.PDFDocumentProxy,
  dest: string | any[]
): Promise<number | null> {
  try {
    const destArray = typeof dest === 'string'
      ? await pdf.getDestination(dest)
      : dest;

    if (!destArray || destArray.length === 0) {
      return null;
    }

    const pageIndex = await pdf.getPageIndex(destArray[0]);
    return pageIndex + 1;
  } catch (error) {
    console.error('Error getting page number from destination:', error);
    return null;
  }
}
