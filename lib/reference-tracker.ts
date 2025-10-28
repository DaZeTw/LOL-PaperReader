import fs from 'fs';
import path from 'path';

export interface ReferenceMetadata {
  citationText: string;
  title: string | null;
  authors: string[];
  year: number | null;
  abstract: string | null;
  url: string | null;
  venue: string | null;
  citationCount: number;
  retrievedAt: string;
  source: 'google-scholar' | 'semantic-scholar' | 'fallback';
  hasAbstract: boolean;
  retryCount: number;
}

export interface PDFReferenceData {
  pdfId: string;
  pdfFilename: string;
  uploadedAt: string;
  references: ReferenceMetadata[];
  stats: {
    total: number;
    withAbstract: number;
    withoutAbstract: number;
    failedRetrievals: number;
  };
}

/**
 * Get the storage directory for PDF references
 */
function getStorageDir(): string {
  const storageDir = path.join(process.cwd(), '.references-data');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  return storageDir;
}

/**
 * Get the file path for a specific PDF's reference data
 */
function getPDFDataPath(pdfId: string): string {
  return path.join(getStorageDir(), `${pdfId}.json`);
}

/**
 * Initialize reference tracking for a new PDF upload
 */
export function initializePDFReferenceTracking(pdfId: string, pdfFilename: string): PDFReferenceData {
  const data: PDFReferenceData = {
    pdfId,
    pdfFilename,
    uploadedAt: new Date().toISOString(),
    references: [],
    stats: {
      total: 0,
      withAbstract: 0,
      withoutAbstract: 0,
      failedRetrievals: 0,
    },
  };

  try {
    fs.writeFileSync(getPDFDataPath(pdfId), JSON.stringify(data, null, 2));
    console.log(`[ReferenceTracker] Initialized tracking for PDF: ${pdfId}`);
  } catch (error) {
    console.error(`[ReferenceTracker] Failed to initialize tracking:`, error);
  }

  return data;
}

/**
 * Load reference data for a PDF
 */
export function loadPDFReferenceData(pdfId: string): PDFReferenceData | null {
  try {
    const filePath = getPDFDataPath(pdfId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`[ReferenceTracker] Failed to load data for ${pdfId}:`, error);
    return null;
  }
}

/**
 * Track a reference retrieval attempt
 */
export function trackReferenceRetrieval(
  pdfId: string,
  citationText: string,
  metadata: Partial<ReferenceMetadata>,
  source: 'google-scholar' | 'semantic-scholar' | 'fallback'
): void {
  try {
    let data = loadPDFReferenceData(pdfId);
    if (!data) {
      console.warn(`[ReferenceTracker] No tracking data found for ${pdfId}, creating new`);
      data = initializePDFReferenceTracking(pdfId, 'unknown');
    }

    const hasAbstract = !!metadata.abstract;
    const reference: ReferenceMetadata = {
      citationText,
      title: metadata.title || null,
      authors: metadata.authors || [],
      year: metadata.year || null,
      abstract: metadata.abstract || null,
      url: metadata.url || null,
      venue: metadata.venue || null,
      citationCount: metadata.citationCount || 0,
      retrievedAt: new Date().toISOString(),
      source,
      hasAbstract,
      retryCount: 0,
    };

    // Check if this reference already exists
    const existingIndex = data.references.findIndex(
      r => r.citationText === citationText || (r.title && r.title === metadata.title)
    );

    if (existingIndex >= 0) {
      // Update existing reference
      const existing = data.references[existingIndex];
      reference.retryCount = existing.retryCount + 1;

      // Only update if we got better data (e.g., now we have abstract)
      if (!existing.hasAbstract && hasAbstract) {
        data.references[existingIndex] = reference;
        console.log(`[ReferenceTracker] Updated reference with abstract: ${citationText.substring(0, 50)}...`);
      } else {
        data.references[existingIndex].retryCount++;
      }
    } else {
      // Add new reference
      data.references.push(reference);
    }

    // Update stats
    data.stats.total = data.references.length;
    data.stats.withAbstract = data.references.filter(r => r.hasAbstract).length;
    data.stats.withoutAbstract = data.references.filter(r => !r.hasAbstract).length;
    data.stats.failedRetrievals = data.references.filter(r => !r.title).length;

    // Save updated data
    fs.writeFileSync(getPDFDataPath(pdfId), JSON.stringify(data, null, 2));

    // Log warning if abstract is missing
    if (!hasAbstract) {
      console.warn(`[ReferenceTracker] Missing abstract for: ${citationText.substring(0, 80)}...`);
      console.warn(`[ReferenceTracker] Stats for ${pdfId}: ${data.stats.withAbstract}/${data.stats.total} have abstracts`);
    }
  } catch (error) {
    console.error(`[ReferenceTracker] Failed to track reference:`, error);
  }
}

/**
 * Get references that are missing abstracts for retry
 */
export function getReferencesNeedingRetry(pdfId: string): ReferenceMetadata[] {
  const data = loadPDFReferenceData(pdfId);
  if (!data) return [];

  return data.references.filter(r => !r.hasAbstract && r.retryCount < 3);
}

/**
 * Get statistics for a PDF's reference retrievals
 */
export function getReferenceStats(pdfId: string): PDFReferenceData['stats'] | null {
  const data = loadPDFReferenceData(pdfId);
  return data?.stats || null;
}

/**
 * Clean up old reference data (older than 30 days)
 */
export function cleanupOldReferenceData(daysToKeep: number = 30): void {
  try {
    const storageDir = getStorageDir();
    const files = fs.readdirSync(storageDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    let deletedCount = 0;
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(storageDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const data: PDFReferenceData = JSON.parse(content);

      if (new Date(data.uploadedAt) < cutoffDate) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    console.log(`[ReferenceTracker] Cleaned up ${deletedCount} old reference data files`);
  } catch (error) {
    console.error(`[ReferenceTracker] Cleanup failed:`, error);
  }
}
