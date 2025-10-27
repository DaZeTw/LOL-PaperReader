"use client";

import { useState } from "react";
import { PDFViewer } from "@/components/pdf-viewer";

export default function TestCitationsPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [citationData, setCitationData] = useState<any>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
      setCitationData(null);
    }
  };

  const handleCitationClick = (citation: any, event: MouseEvent) => {
    console.log("Citation clicked:", citation);
    setCitationData(citation);
    
    // Show a simple alert for testing
    alert(`Citation clicked: ${citation.id}\nText: ${citation.text}\nType: ${citation.type}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Citation Click Test</h1>
          <p className="text-gray-600 mb-4">
            Upload a PDF and click on citations to test the popup functionality.
          </p>
          
          <div className="mb-4">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {citationData && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Last Clicked Citation</h3>
              <div className="text-sm text-blue-800">
                <p><strong>ID:</strong> {citationData.id}</p>
                <p><strong>Text:</strong> {citationData.text}</p>
                <p><strong>Type:</strong> {citationData.type}</p>
                <p><strong>Confidence:</strong> {citationData.confidence}</p>
              </div>
            </div>
          )}
        </div>

        {selectedFile && (
          <div className="h-screen border border-gray-300 rounded-lg overflow-hidden">
            <PDFViewer
              file={selectedFile}
              onCitationClick={handleCitationClick}
              extractedCitations={[]} // Empty for now, but you can load from API
            />
          </div>
        )}
      </div>
    </div>
  );
}
