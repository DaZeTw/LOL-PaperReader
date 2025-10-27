"use client";

import { useState, useEffect } from "react";
import CitationDebugger from "@/components/CitationDebugger";

interface ExtractedCitation {
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

export default function DebugCitationsPage() {
  const [citations, setCitations] = useState<ExtractedCitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load the most recent citation file
    const loadRecentCitations = async () => {
      try {
        const response = await fetch('/api/citations/list');
        if (!response.ok) {
          throw new Error('Failed to load citations');
        }
        
        const data = await response.json();
        if (data.files && data.files.length > 0) {
          // Load the most recent file
          const mostRecent = data.files[0];
          const citationResponse = await fetch(`/api/citations/load?file=${encodeURIComponent(mostRecent)}`);
          if (citationResponse.ok) {
            const citationData = await citationResponse.json();
            setCitations(citationData.citations || []);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadRecentCitations();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading citations...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Citations</h2>
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Citation Debug Page</h1>
          <p className="text-gray-600">
            This page shows detailed information about extracted citations for debugging purposes.
          </p>
        </div>
        
        {citations.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-yellow-800 mb-2">No Citations Found</h2>
            <p className="text-yellow-600">
              No citation data found. Please extract citations from a PDF first.
            </p>
          </div>
        ) : (
          <CitationDebugger citations={citations} />
        )}
      </div>
    </div>
  );
}
