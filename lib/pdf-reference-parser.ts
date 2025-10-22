import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker for client-side
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
}

export interface Reference {
  id: string;
  number: number;
  text: string;
  authors?: string;
  title?: string;
  year?: string;
  journal?: string;
  doi?: string;
  url?: string;
  arxivId?: string;
  pageNum: number;
  yPosition: number;
}

interface TextLine {
  text: string;
  y: number;
  x: number;
}

/**
 * Extract references from the references section of a PDF
 */
export async function extractReferencesFromPDF(
  pdfBuffer: ArrayBuffer
): Promise<Reference[]> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
    const pdf = await loadingTask.promise;

    console.log('[Reference Parser] PDF loaded, pages:', pdf.numPages);

    const references: Reference[] = [];

    // Search for references section (usually in last 30% of pages)
    const startPage = Math.max(1, Math.floor(pdf.numPages * 0.7));
    let foundReferencesSection = false;

    for (let pageNum = startPage; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items as any[];

      // Group text items into lines
      const lines = groupTextIntoLines(items);

      // Look for "References" or "Bibliography" heading
      const refHeaderIndex = lines.findIndex(line =>
        /^(References|Bibliography|Works Cited|Literature Cited)$/i.test(line.text.trim())
      );

      if (refHeaderIndex !== -1) {
        foundReferencesSection = true;
        console.log('[Reference Parser] Found references section on page', pageNum);
      }

      // If we've found the references section or we're past page 70%, try to parse
      if (foundReferencesSection || pageNum >= startPage) {
        const startIndex = refHeaderIndex !== -1 ? refHeaderIndex + 1 : 0;
        const pageReferences = parseReferencesFromLines(
          lines.slice(startIndex),
          pageNum
        );

        references.push(...pageReferences);
      }
    }

    console.log('[Reference Parser] Extracted', references.length, 'references');

    // If no references found with standard patterns, try alternative parsing
    if (references.length === 0) {
      console.log('[Reference Parser] No standard references found, trying alternative parsing');
      // You could add alternative parsing logic here
    }

    return references;
  } catch (error) {
    console.error('[Reference Parser] Error extracting references:', error);
    return [];
  }
}

/**
 * Group text items into lines based on Y position
 */
function groupTextIntoLines(items: any[]): TextLine[] {
  const lines: TextLine[] = [];

  items.forEach(item => {
    if (!item.str || !item.str.trim()) return;

    const y = item.transform[5];
    const x = item.transform[4];

    // Find existing line at this Y position (within 3px tolerance)
    const existingLine = lines.find(l => Math.abs(l.y - y) < 3);

    if (existingLine) {
      // Add to existing line (maintaining X order)
      existingLine.text += item.str;
    } else {
      // Create new line
      lines.push({ text: item.str, y, x });
    }
  });

  // Sort lines top to bottom (descending Y in PDF coordinates)
  lines.sort((a, b) => b.y - a.y);

  return lines;
}

/**
 * Parse references from text lines
 */
function parseReferencesFromLines(
  lines: TextLine[],
  pageNum: number
): Reference[] {
  const references: Reference[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Try multiple reference patterns:
    // [1] Author. Title.
    // 1. Author. Title.
    // 1 Author. Title.
    const patterns = [
      /^\[(\d+)\]\s+(.+)/,           // [1] ...
      /^(\d+)\.\s+(.+)/,              // 1. ...
      /^(\d+)\s+([A-Z].+)/,           // 1 Author...
    ];

    let match: RegExpMatchArray | null = null;
    for (const pattern of patterns) {
      match = line.text.match(pattern);
      if (match) break;
    }

    if (match) {
      const number = parseInt(match[1]);
      let refText = match[2];

      // Collect continuation lines (multi-line references)
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];

        // Stop if next line starts a new reference
        if (/^\[?\d+\]?\.?\s/.test(nextLine.text)) break;

        // Stop if next line looks like a section heading (single capitalized word)
        if (/^[A-Z][a-z]+$/.test(nextLine.text.trim()) && nextLine.text.trim().length < 20) break;

        // Stop if line is mostly whitespace
        if (nextLine.text.trim().length < 3) break;

        // Add continuation line
        refText += ' ' + nextLine.text;
        j++;
      }

      // Clean up reference text
      refText = refText.trim().replace(/\s+/g, ' ');

      // Extract metadata from reference text
      const metadata = extractReferenceMetadata(refText);

      references.push({
        id: `ref${number}`,
        number,
        text: refText,
        ...metadata,
        pageNum,
        yPosition: line.y,
      });

      i = j; // Skip processed lines
    } else {
      i++;
    }
  }

  return references;
}

/**
 * Extract metadata (authors, title, year, DOI, etc.) from reference text
 */
function extractReferenceMetadata(text: string): {
  authors?: string;
  title?: string;
  year?: string;
  journal?: string;
  doi?: string;
  url?: string;
  arxivId?: string;
} {
  const metadata: any = {};

  // Extract year (look for 4-digit number in parentheses or standalone)
  const yearMatch = text.match(/\((\d{4})\)/) || text.match(/,\s*(\d{4})[.,]/);
  if (yearMatch) {
    metadata.year = yearMatch[1];
  }

  // Extract DOI
  const doiMatch = text.match(/(?:DOI:|doi:)?\s*(10\.\d{4,}\/[^\s]+)/i);
  if (doiMatch) {
    metadata.doi = doiMatch[1].replace(/[.,;]$/, ''); // Remove trailing punctuation
    metadata.url = `https://doi.org/${metadata.doi}`;
  }

  // Extract arXiv ID
  const arxivMatch = text.match(/arXiv:(\d{4}\.\d{4,5})/i);
  if (arxivMatch) {
    metadata.arxivId = arxivMatch[1];
    metadata.url = `https://arxiv.org/abs/${metadata.arxivId}`;
  }

  // Extract URL (if not already set from DOI/arXiv)
  if (!metadata.url) {
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      metadata.url = urlMatch[1].replace(/[.,;]$/, '');
    }
  }

  // Extract authors (text before first period, limited to reasonable length)
  const firstPeriodIndex = text.indexOf('.');
  if (firstPeriodIndex > 0 && firstPeriodIndex < 150) {
    const potentialAuthors = text.substring(0, firstPeriodIndex).trim();
    // Check if it looks like authors (contains commas or "and" or "&")
    if (/[,&]|and/.test(potentialAuthors)) {
      metadata.authors = potentialAuthors;
    }
  }

  // Extract title (heuristic: text between authors and year/journal)
  // This is tricky - we'll look for text after first period and before year
  if (metadata.authors && metadata.year) {
    const afterAuthors = text.substring(text.indexOf(metadata.authors) + metadata.authors.length);
    const beforeYear = afterAuthors.substring(0, afterAuthors.indexOf(metadata.year));

    // Find quoted title or text between periods
    const quotedTitle = beforeYear.match(/"([^"]+)"/);
    if (quotedTitle) {
      metadata.title = quotedTitle[1].trim();
    } else {
      // Look for title as text after first period and before venue/year
      const parts = beforeYear.split('.');
      if (parts.length >= 2) {
        const potentialTitle = parts[1].trim();
        if (potentialTitle.length > 10 && potentialTitle.length < 200) {
          metadata.title = potentialTitle;
        }
      }
    }
  }

  // Extract journal/venue (text after title and before year)
  if (metadata.title && metadata.year) {
    const afterTitle = text.substring(text.indexOf(metadata.title) + metadata.title.length);
    const beforeYear = afterTitle.substring(0, afterTitle.indexOf(metadata.year));
    const venue = beforeYear.replace(/[.,]\s*$/, '').trim();
    if (venue.length > 3 && venue.length < 150) {
      metadata.journal = venue;
    }
  }

  return metadata;
}

/**
 * Extract table of contents / sections from PDF
 */
export async function extractSectionsFromPDF(
  pdfBuffer: ArrayBuffer
): Promise<Array<{ id: string; title: string; content: string; page: number }>> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
    const pdf = await loadingTask.promise;

    const sections: Array<{ id: string; title: string; content: string; page: number }> = [];

    // Extract text from all pages and look for section headings
    for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 20); pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items as any[];

      items.forEach((item: any) => {
        const text = item.str.trim();

        // Look for common section headings (bold, larger font, capitalized)
        const fontSize = item.transform[0];
        const isLargeFont = fontSize > 12;

        const commonSections = [
          'Abstract',
          'Introduction',
          'Background',
          'Related Work',
          'Methodology',
          'Methods',
          'Approach',
          'Experiments',
          'Results',
          'Discussion',
          'Conclusion',
          'Conclusions',
          'Future Work',
          'Acknowledgments',
          'References',
        ];

        if (isLargeFont && commonSections.includes(text)) {
          sections.push({
            id: text.toLowerCase().replace(/\s+/g, '-'),
            title: text,
            content: `Section: ${text}`,
            page: pageNum,
          });
        }
      });
    }

    console.log('[Section Parser] Extracted', sections.length, 'sections');
    return sections;
  } catch (error) {
    console.error('[Section Parser] Error extracting sections:', error);
    return [];
  }
}
