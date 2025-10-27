"use client";

import React, { useState } from "react";
import { FileText, Eye, EyeOff, Download } from "lucide-react";

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

interface CitationDebuggerProps {
  citations: Citation[];
  className?: string;
}

export default function CitationDebugger({ citations, className = "" }: CitationDebuggerProps) {
  const [showRawData, setShowRawData] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  const downloadDebugData = () => {
    const debugData = {
      totalCitations: citations.length,
      citations: citations.map((citation, index) => ({
        index: index + 1,
        id: citation.id,
        text: citation.text,
        textLength: citation.text.length,
        confidence: citation.confidence,
        method: citation.method,
        spansPages: citation.spansPages,
        destPage: citation.destPage,
        sourcePage: citation.sourcePage,
        xPosition: citation.xPosition,
        yPosition: citation.yPosition,
        linesProcessed: citation.linesProcessed,
        candidatesFound: citation.candidatesFound,
        xFilteredFound: citation.xFilteredFound,
        thresholds: citation.thresholds,
        timestamp: citation.timestamp,
      })),
      summary: {
        byMethod: citations.reduce((acc, c) => {
          acc[c.method] = (acc[c.method] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        averageConfidence: citations.reduce((sum, c) => sum + c.confidence, 0) / citations.length,
        highConfidence: citations.filter(c => c.confidence > 0.7).length,
        multiPage: citations.filter(c => c.spansPages).length,
      }
    };

    const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `citation-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <FileText className="w-5 h-5 mr-2" />
          Citation Debugger ({citations.length} citations)
        </h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowRawData(!showRawData)}
            className="flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            {showRawData ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
            {showRawData ? 'Hide' : 'Show'} Raw Data
          </button>
          <button
            onClick={downloadDebugData}
            className="flex items-center px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
          >
            <Download className="w-4 h-4 mr-1" />
            Download Debug Data
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white p-3 rounded border">
          <div className="text-sm text-gray-500">Total Citations</div>
          <div className="text-xl font-bold text-gray-900">{citations.length}</div>
        </div>
        <div className="bg-white p-3 rounded border">
          <div className="text-sm text-gray-500">High Confidence</div>
          <div className="text-xl font-bold text-green-600">
            {citations.filter(c => c.confidence > 0.7).length}
          </div>
        </div>
        <div className="bg-white p-3 rounded border">
          <div className="text-sm text-gray-500">Multi-page</div>
          <div className="text-xl font-bold text-blue-600">
            {citations.filter(c => c.spansPages).length}
          </div>
        </div>
        <div className="bg-white p-3 rounded border">
          <div className="text-sm text-gray-500">Avg Confidence</div>
          <div className="text-xl font-bold text-purple-600">
            {Math.round((citations.reduce((sum, c) => sum + c.confidence, 0) / citations.length) * 100)}%
          </div>
        </div>
      </div>

      {/* Method Breakdown */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Extraction Methods</h4>
        <div className="flex flex-wrap gap-2">
          {Object.entries(
            citations.reduce((acc, c) => {
              acc[c.method] = (acc[c.method] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          ).map(([method, count]) => (
            <span
              key={method}
              className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-sm"
            >
              {method}: {count}
            </span>
          ))}
        </div>
      </div>

      {/* Citation List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {citations.map((citation, index) => (
          <div
            key={citation.id}
            className={`border rounded-lg p-3 cursor-pointer transition-colors ${
              selectedCitation?.id === citation.id
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
            onClick={() => setSelectedCitation(citation)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-600">#{index + 1}</span>
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                  {Math.round(citation.confidence * 100)}%
                </span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                  {citation.method}
                </span>
                {citation.spansPages && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                    Multi-page
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500">Page {citation.destPage}</div>
            </div>

            {/* Citation Text Preview */}
            <div className="mb-2">
              <div className="text-sm text-gray-800 leading-relaxed">
                {citation.text.length > 200 
                  ? citation.text.substring(0, 200) + "..."
                  : citation.text
                }
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Length: {citation.text.length} characters
              </div>
            </div>

            {/* Raw Data (if enabled) */}
            {showRawData && (
              <div className="mt-3 p-2 bg-gray-100 rounded text-xs">
                <pre className="whitespace-pre-wrap overflow-x-auto">
                  {JSON.stringify({
                    id: citation.id,
                    confidence: citation.confidence,
                    method: citation.method,
                    spansPages: citation.spansPages,
                    destPage: citation.destPage,
                    sourcePage: citation.sourcePage,
                    xPosition: citation.xPosition,
                    yPosition: citation.yPosition,
                    linesProcessed: citation.linesProcessed,
                    candidatesFound: citation.candidatesFound,
                    xFilteredFound: citation.xFilteredFound,
                    thresholds: citation.thresholds,
                    timestamp: citation.timestamp,
                  }, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Selected Citation Details */}
      {selectedCitation && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Selected Citation Details</h4>
          <div className="text-sm text-blue-800">
            <div className="mb-2">
              <strong>ID:</strong> {selectedCitation.id}
            </div>
            <div className="mb-2">
              <strong>Text:</strong> {selectedCitation.text}
            </div>
            <div className="mb-2">
              <strong>Confidence:</strong> {Math.round(selectedCitation.confidence * 100)}%
            </div>
            <div className="mb-2">
              <strong>Method:</strong> {selectedCitation.method}
            </div>
            <div className="mb-2">
              <strong>Pages:</strong> {selectedCitation.sourcePage} → {selectedCitation.destPage}
            </div>
            {selectedCitation.linesProcessed && (
              <div className="mb-2">
                <strong>Lines Processed:</strong> {selectedCitation.linesProcessed}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
