"use client";

import React, { useState } from "react";
import CitationLink from "./CitationLink";
import { FileText, Calendar, Users, BookOpen, ExternalLink } from "lucide-react";

interface Citation {
  id: string;
  text: string;
  confidence: number;
  method: string;
  spansPages: boolean;
  destPage: number;
  sourcePage?: number;
  xPosition?: number;
  yPosition?: number;
  linesProcessed?: number;
  candidatesFound?: number;
  xFilteredFound?: number;
  thresholds?: any;
  timestamp?: string;
}

interface CitationListProps {
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
  showMetadata?: boolean;
  className?: string;
}

export default function CitationList({
  citations,
  onCitationClick,
  showMetadata = true,
  className = "",
}: CitationListProps) {
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  // Deduplicate citations by ID, keeping the one with highest confidence
  const deduplicatedCitations = React.useMemo(() => {
    const citationMap = new Map<string, Citation>();
    
    citations.forEach((citation) => {
      const existing = citationMap.get(citation.id);
      if (!existing || citation.confidence > existing.confidence) {
        citationMap.set(citation.id, citation);
      }
    });
    
    const deduplicated = Array.from(citationMap.values());
    
    // Log deduplication info in development
    if (process.env.NODE_ENV === 'development' && citations.length !== deduplicated.length) {
      console.log(`[CitationList] Deduplicated ${citations.length} citations to ${deduplicated.length} unique citations`);
    }
    
    // Debug: Log first citation to see structure
    if (deduplicated.length > 0) {
      console.log('[CitationList] First citation:', deduplicated[0]);
    }
    
    return deduplicated;
  }, [citations]);

  const handleCitationClick = (citation: Citation) => {
    console.log('Citation clicked:', citation.id, citation.text.substring(0, 100) + '...');
    setSelectedCitation(citation);
    onCitationClick?.(citation);
  };

  const handleMetadataLoad = (citation: Citation, metadata: any) => {
    console.log(`Metadata loaded for citation ${citation.id}:`, metadata);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-green-600 bg-green-100";
    if (confidence >= 0.6) return "text-yellow-600 bg-yellow-100";
    return "text-red-600 bg-red-100";
  };

  const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      numbered: "text-blue-600 bg-blue-100",
      "author-year": "text-purple-600 bg-purple-100",
      doi: "text-green-600 bg-green-100",
      url: "text-orange-600 bg-orange-100",
      arxiv: "text-red-600 bg-red-100",
      proximity: "text-gray-600 bg-gray-100",
      annotation: "text-indigo-600 bg-indigo-100",
    };
    return colors[method] || "text-gray-600 bg-gray-100";
  };

  if (deduplicatedCitations.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p>No citations found</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Extracted Citations ({deduplicatedCitations.length})
        </h3>
        <div className="text-sm text-gray-500">
          {deduplicatedCitations.filter(c => c.confidence > 0.7).length} high confidence
        </div>
      </div>

      {/* Citations List */}
      <div className="space-y-3">
        {deduplicatedCitations.map((citation, index) => (
          <div
            key={`${citation.id}-${index}`}
            className={`border rounded-lg p-4 transition-colors cursor-pointer ${
              selectedCitation?.id === citation.id
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
            onClick={() => handleCitationClick(citation)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-600">
                  #{index + 1}
                </span>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(
                    citation.confidence
                  )}`}
                >
                  {Math.round(citation.confidence * 100)}% confidence
                </span>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${getMethodColor(
                    citation.method
                  )}`}
                >
                  {citation.method}
                </span>
                {citation.spansPages && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium text-blue-600 bg-blue-100">
                    Multi-page
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                Page {citation.destPage}
              </div>
            </div>

            {/* Citation Text */}
            <div className="mb-3">
              <div className="text-sm text-gray-800 leading-relaxed">
                {citation.text}
              </div>
              {showMetadata && (
                <div className="mt-2">
                  <CitationLink
                    citationId={citation.id}
                    citationText={citation.text}
                    onMetadataLoad={(metadata) => handleMetadataLoad(citation, metadata)}
                  >
                    <span className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer underline">
                      View detailed metadata →
                    </span>
                  </CitationLink>
                </div>
              )}
            </div>

            {/* Metadata */}
            {showMetadata && (
              <div className="flex items-center space-x-4 text-xs text-gray-500">
                <div className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3" />
                  <span>Page {citation.destPage}</span>
                </div>
                {citation.sourcePage && citation.sourcePage !== citation.destPage && (
                  <div className="flex items-center space-x-1">
                    <ExternalLink className="w-3 h-3" />
                    <span>From page {citation.sourcePage}</span>
                  </div>
                )}
                {citation.linesProcessed && (
                  <div className="flex items-center space-x-1">
                    <FileText className="w-3 h-3" />
                    <span>{citation.linesProcessed} lines</span>
                  </div>
                )}
                {citation.candidatesFound && (
                  <div className="flex items-center space-x-1">
                    <Users className="w-3 h-3" />
                    <span>{citation.candidatesFound} candidates</span>
                  </div>
                )}
              </div>
            )}

            {/* Debug Info (if available) */}
            {citation.thresholds && (
              <details className="mt-2">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                  Debug Info
                </summary>
                <div className="mt-1 text-xs text-gray-500 space-y-1">
                  <div>Search Range: {citation.thresholds.searchRange}</div>
                  <div>X Tolerance: {citation.thresholds.xTolerance}</div>
                  <div>Candidates Found: {citation.candidatesFound}</div>
                  <div>X Filtered: {citation.xFilteredFound}</div>
                </div>
              </details>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Extraction Summary</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-gray-500">Total Citations</div>
            <div className="font-medium">{deduplicatedCitations.length}</div>
          </div>
          <div>
            <div className="text-gray-500">High Confidence</div>
            <div className="font-medium text-green-600">
              {deduplicatedCitations.filter(c => c.confidence > 0.7).length}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Multi-page</div>
            <div className="font-medium text-blue-600">
              {deduplicatedCitations.filter(c => c.spansPages).length}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Avg Confidence</div>
            <div className="font-medium">
              {Math.round(
                (deduplicatedCitations.reduce((sum, c) => sum + c.confidence, 0) / deduplicatedCitations.length) * 100
              )}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
