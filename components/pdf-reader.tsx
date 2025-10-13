"use client"

import { useState } from "react"
import { FileText } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { PDFUpload } from "@/components/pdf-upload"
import { PDFViewer } from "@/components/pdf-viewer"
import { ParsedSidebar } from "@/components/parsed-sidebar"
import { CitationSidebar } from "@/components/citation-sidebar"
import { AnnotationToolbar } from "@/components/annotation-toolbar"
import { Button } from "@/components/ui/button"

export function PDFReader() {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<any>(null)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [selectedCitation, setSelectedCitation] = useState<any>(null)
  const [highlightColor, setHighlightColor] = useState("#fef08a")
  const [annotationMode, setAnnotationMode] = useState<"highlight" | "erase" | null>(null)

  const handleNewFile = () => {
    setPdfFile(null)
    setParsedData(null)
    setSelectedSection(null)
    setSelectedCitation(null)
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <FileText className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="font-mono text-lg font-medium text-foreground">Scholar Reader</h1>
          {pdfFile && (
            <span className="ml-2 max-w-xs truncate border-l border-border pl-4 font-mono text-sm text-muted-foreground">
              {pdfFile.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {pdfFile && (
            <Button variant="ghost" size="sm" onClick={handleNewFile}>
              Upload New
            </Button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {!pdfFile ? (
          <PDFUpload onFileSelect={setPdfFile} onParsedData={setParsedData} />
        ) : (
          <>
            {/* Left Sidebar - Navigation/Sections */}
            <ParsedSidebar
              parsedData={parsedData}
              selectedSection={selectedSection}
              onSectionSelect={setSelectedSection}
            />

            {/* Center - PDF Viewer with Annotation Toolbar */}
            <div className="relative flex flex-1 flex-col">
              <PDFViewer
                file={pdfFile}
                selectedSection={selectedSection}
                highlightColor={highlightColor}
                annotationMode={annotationMode}
                onCitationClick={setSelectedCitation}
              />

              <AnnotationToolbar
                highlightColor={highlightColor}
                onColorChange={setHighlightColor}
                annotationMode={annotationMode}
                onModeChange={setAnnotationMode}
              />
            </div>

            {/* Right Sidebar - Citations/References */}
            <CitationSidebar selectedCitation={selectedCitation} onCitationSelect={setSelectedCitation} />
          </>
        )}
      </div>
    </div>
  )
}
