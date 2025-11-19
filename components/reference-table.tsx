"use client"

import { useState } from "react"
import { FileText, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Reference {
  id: string
  title: string
  authors: string[]
  year: number
  source: string
  pdfFile?: File
}

interface ReferenceTableProps {
  searchQuery: string
  selectedCollection: string | null
  viewMode: 'table' | 'grid'
  onOpenPDF: (file: File, title: string) => void
}

export function ReferenceTable({ 
  searchQuery, 
  selectedCollection, 
  viewMode, 
  onOpenPDF 
}: ReferenceTableProps) {
  // Mock data - replace with actual data fetching
  const references: Reference[] = [
    {
      id: "1",
      title: "Attention Is All You Need",
      authors: ["Vaswani, A.", "Shazeer, N.", "Parmar, N."],
      year: 2017,
      source: "Neural Information Processing Systems",
    },
    {
      id: "2", 
      title: "BERT: Pre-training of Deep Bidirectional Transformers",
      authors: ["Devlin, J.", "Chang, M.", "Lee, K."],
      year: 2018,
      source: "arXiv preprint",
    }
  ]

  const handleOpenReference = (reference: Reference) => {
    if (reference.pdfFile) {
      onOpenPDF(reference.pdfFile, reference.title)
    }
  }

  if (viewMode === 'grid') {
    return (
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
        {references.map((ref) => (
          <div key={ref.id} className="border border-border rounded-lg p-4 hover:bg-muted/50">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-muted-foreground mt-1" />
              <div className="flex-1 space-y-2">
                <h4 className="font-medium text-sm line-clamp-2">{ref.title}</h4>
                <p className="text-xs text-muted-foreground">{ref.authors.join(", ")}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{ref.year}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenReference(ref)}
                    disabled={!ref.pdfFile}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="overflow-auto">
      <table className="w-full">
        <thead className="border-b border-border">
          <tr className="bg-muted/30">
            <th className="text-left p-3 text-sm font-medium">Title</th>
            <th className="text-left p-3 text-sm font-medium">Authors</th>
            <th className="text-left p-3 text-sm font-medium">Year</th>
            <th className="text-left p-3 text-sm font-medium">Source</th>
            <th className="w-16"></th>
          </tr>
        </thead>
        <tbody>
          {references.map((ref) => (
            <tr 
              key={ref.id} 
              className="border-b border-border hover:bg-muted/30 cursor-pointer"
              onClick={() => handleOpenReference(ref)}
            >
              <td className="p-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{ref.title}</span>
                </div>
              </td>
              <td className="p-3 text-sm text-muted-foreground">
                {ref.authors.join(", ")}
              </td>
              <td className="p-3 text-sm">{ref.year}</td>
              <td className="p-3 text-sm text-muted-foreground">{ref.source}</td>
              <td className="p-3">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!ref.pdfFile}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOpenReference(ref)
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}