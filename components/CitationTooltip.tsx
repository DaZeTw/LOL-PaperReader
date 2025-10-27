"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, ExternalLink, Calendar, Users, BookOpen, FileText } from "lucide-react";

interface CitationMetadata {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue: string;
  abstract: string;
  url: string;
  doi?: string;
  arxivId?: string;
  cachedAt: string;
}

interface CitationTooltipProps {
  citationId: string;
  citationText: string;
  position: { x: number; y: number };
  onClose: () => void;
  onMetadataLoad?: (metadata: CitationMetadata) => void;
}

export default function CitationTooltip({
  citationId,
  citationText,
  position,
  onClose,
  onMetadataLoad,
}: CitationTooltipProps) {
  const [metadata, setMetadata] = useState<CitationMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMetadata();
  }, [citationId, citationText]);

  useEffect(() => {
    // Position tooltip
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      // Adjust if tooltip would go off screen
      if (x + rect.width > viewportWidth) {
        x = viewportWidth - rect.width - 10;
      }
      if (y + rect.height > viewportHeight) {
        y = viewportHeight - rect.height - 10;
      }

      tooltipRef.current.style.left = `${Math.max(10, x)}px`;
      tooltipRef.current.style.top = `${Math.max(10, y)}px`;
    }
  }, [position, metadata]);

  const fetchMetadata = async () => {
    try {
      setLoading(true);
      setError(null);

      // Parse citation text to extract title, authors, year
      const parseCitation = (text: string) => {
        const cleanText = text.replace(/^\[\d+\]\s*/, '');
        const yearMatch = cleanText.match(/\b(19\d{2}|20\d{2})\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
        
        // Extract authors (first part)
        const parts = cleanText.split('.');
        const authorsText = parts[0]?.trim() || '';
        const authors = authorsText ? authorsText.split(/,\s*(?:and\s+)?|(?:\s+and\s+)/i).map(a => a.trim()) : [];
        
        // Extract title (after year, before venue)
        let title = '';
        if (year) {
          const afterYear = cleanText.substring(cleanText.indexOf(year.toString()) + 4).trim();
          const segments = afterYear.split('.').filter(s => s.trim().length > 0);
          // Title is segments before the last 1-2 segments (venue info)
          if (segments.length >= 2) {
            title = segments.slice(0, -2).join('. ').trim();
          }
        }
        
        if (!title || title.length < 10) {
          title = parts.slice(2, -2).join('. ').trim();
        }
        
        return { title, authors, year };
      };

      const parsed = parseCitation(citationText);
      
      console.log("[CitationTooltip] Parsed citation:", parsed);
      
      // Use the new API route
      const response = await fetch("/api/references/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: parsed.title || citationText.replace(/^\[\d+\]\s*/, '').substring(0, 100),
          authors: parsed.authors?.join(", "),
          year: parsed.year?.toString(),
          fullCitation: citationText,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Convert API response to CitationMetadata format
      const metadata: CitationMetadata = {
        id: citationId,
        title: data.title || citationText,
        authors: data.authors || parsed.authors,
        year: data.year || parsed.year || new Date().getFullYear(),
        venue: data.venue || data.searchQuery || '',
        abstract: data.abstract || '',
        url: data.url || '',
        doi: data.doi,
        arxivId: data.arxivId,
        cachedAt: new Date().toISOString(),
      };
      
      setMetadata(metadata);
      onMetadataLoad?.(metadata);
    } catch (err) {
      console.error("Failed to fetch citation metadata:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch metadata");
    } finally {
      setLoading(false);
    }
  };

  const formatAuthors = (authors: string[]) => {
    if (authors.length <= 2) {
      return authors.join(", ");
    }
    return `${authors.slice(0, 2).join(", ")} et al.`;
  };

  const truncateAbstract = (abstract: string, maxLength: number = 200) => {
    if (abstract.length <= maxLength) return abstract;
    return abstract.substring(0, maxLength).trim() + "...";
  };

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 w-96 bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-h-96 overflow-y-auto"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <FileText className="w-4 h-4" />
          <span>Citation Details</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-sm text-gray-600">Loading metadata...</span>
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <div className="text-red-500 text-sm mb-2">Failed to load metadata</div>
          <div className="text-xs text-gray-500">{error}</div>
          <button
            onClick={fetchMetadata}
            className="mt-2 px-3 py-1 bg-blue-100 text-blue-600 rounded text-xs hover:bg-blue-200 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {metadata && !loading && (
        <div className="space-y-3">
          {/* Title */}
          <div>
            <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-1">
              {metadata.title}
            </h3>
            {metadata.url && (
              <a
                href={metadata.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                View on Google Scholar
              </a>
            )}
          </div>

          {/* Authors */}
          <div className="flex items-center space-x-2">
            <Users className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-700">
              {formatAuthors(metadata.authors)}
            </span>
          </div>

          {/* Year and Venue */}
          <div className="flex items-center space-x-4 text-xs text-gray-600">
            <div className="flex items-center space-x-1">
              <Calendar className="w-3 h-3" />
              <span>{metadata.year}</span>
            </div>
            <div className="flex items-center space-x-1">
              <BookOpen className="w-3 h-3" />
              <span className="truncate">{metadata.venue}</span>
            </div>
          </div>

          {/* Abstract */}
          {metadata.abstract && (
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1">Abstract</div>
              <p className="text-xs text-gray-600 leading-relaxed">
                {truncateAbstract(metadata.abstract)}
              </p>
            </div>
          )}

          {/* Identifiers */}
          {(metadata.doi || metadata.arxivId) && (
            <div className="pt-2 border-t border-gray-100">
              <div className="flex flex-wrap gap-2 text-xs">
                {metadata.doi && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                    DOI: {metadata.doi}
                  </span>
                )}
                {metadata.arxivId && (
                  <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded">
                    arXiv: {metadata.arxivId}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Cache indicator */}
          <div className="text-xs text-gray-400 text-center">
            {metadata.cachedAt && (
              <span>
                Cached {new Date(metadata.cachedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Fallback for when no metadata is available */}
      {!metadata && !loading && !error && (
        <div className="text-center py-4">
          <div className="text-sm text-gray-600 mb-2">No metadata available</div>
          <div className="text-xs text-gray-500 mb-3">
            {truncateAbstract(citationText, 150)}
          </div>
          <button
            onClick={fetchMetadata}
            className="px-3 py-1 bg-blue-100 text-blue-600 rounded text-xs hover:bg-blue-200 transition-colors"
          >
            Search for metadata
          </button>
        </div>
      )}
    </div>
  );
}
