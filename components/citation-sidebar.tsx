"use client"

import { useState } from "react"
import { BookOpen, ExternalLink, X, ChevronDown, ChevronUp } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Citation {
  id: string
  number: number
  authors: string
  title: string
  journal: string
  year: string
  doi?: string
  citedBy?: number
  summary?: string
}

interface CitationSidebarProps {
  selectedCitation: Citation | null
  onCitationSelect: (citation: Citation | null) => void
}

const mockCitations: Citation[] = [
  {
    id: "1",
    number: 1,
    authors: "Gao, Y., Xiong, Y., Gao, X., et al.",
    title: "Retrieval-augmented generation for large language models: A survey",
    journal: "arXiv preprint arXiv:2312.10997",
    year: "2023",
    citedBy: 156,
    summary:
      "This survey provides a comprehensive overview of retrieval-augmented generation (RAG) techniques for large language models, covering various approaches to improve factuality and reduce hallucinations.",
  },
  {
    id: "2",
    number: 2,
    authors: "Shao, Y., Jiang, Y., Kanell, T. A., et al.",
    title: "Assisting in writing wikipedia-like articles from scratch with large language models",
    journal: "arXiv preprint arXiv:2402.14207",
    year: "2024",
    citedBy: 23,
    summary:
      "Explores methods for using LLMs to generate Wikipedia-style articles with proper citations and factual accuracy.",
  },
  {
    id: "3",
    number: 3,
    authors: "Lo, K., Chang, J. C., Head, A., et al.",
    title: "The semantic reader project: Augmenting scholarly documents through ai-powered interactive reading",
    journal: "ArXiv, abs/2303.14334",
    year: "2023",
    citedBy: 89,
    summary:
      "Presents the Semantic Reader project which augments scholarly documents with AI-powered features for improved comprehension and navigation.",
  },
  {
    id: "4",
    number: 4,
    authors: "Tonmoy, S. M., Zaman, S. M., Jain, V., et al.",
    title: "A comprehensive survey of hallucination mitigation techniques in large language models",
    journal: "arXiv preprint arXiv:2401.01313",
    year: "2024",
    citedBy: 201,
    summary:
      "Comprehensive survey of techniques to mitigate hallucinations in LLMs, including retrieval augmentation, fact-checking, and uncertainty quantification.",
  },
  {
    id: "5",
    number: 5,
    authors: "Dahl, M., Magesh, V., Suzgun, M., Ho, D. E.",
    title: "Large legal fictions: Profiling legal hallucinations in large language models",
    journal: "Journal of Legal Analysis, 16(1):64–93",
    year: "2024",
    citedBy: 45,
    summary: "Analyzes hallucination patterns in legal contexts and proposes methods for detection and mitigation.",
  },
]

export function CitationSidebar({ selectedCitation, onCitationSelect }: CitationSidebarProps) {
  const [expandedCitation, setExpandedCitation] = useState<string | null>(null)

  return (
    <aside className="flex w-96 flex-col border-l border-border bg-sidebar">
      {/* Header */}
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-mono text-sm font-medium text-foreground">References</h2>
          </div>
          <span className="font-mono text-xs text-muted-foreground">{mockCitations.length} citations</span>
        </div>
      </div>

      {selectedCitation && (
        <div className="border-b border-border bg-accent/50 p-4">
          <div className="mb-2 flex items-start justify-between">
            <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-xs text-primary-foreground">
              [{selectedCitation.number}]
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onCitationSelect(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>

          <h3 className="mb-2 text-sm font-medium leading-tight text-foreground">{selectedCitation.title}</h3>

          <p className="mb-2 text-xs text-muted-foreground">
            {selectedCitation.authors} • {selectedCitation.year}
          </p>

          {selectedCitation.summary && (
            <div className="mb-3 rounded-md bg-background/50 p-3">
              <h4 className="mb-1 font-mono text-xs font-medium text-foreground">Background</h4>
              <p className="text-xs leading-relaxed text-muted-foreground">{selectedCitation.summary}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            {selectedCitation.doi && (
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs bg-transparent">
                <ExternalLink className="h-3 w-3" />
                View Paper
              </Button>
            )}
            {selectedCitation.citedBy && (
              <span className="text-xs text-muted-foreground">Cited by {selectedCitation.citedBy}</span>
            )}
          </div>
        </div>
      )}

      {/* Citations List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {mockCitations.map((citation) => (
            <button
              key={citation.id}
              onClick={() => onCitationSelect(citation)}
              className={cn(
                "mb-2 w-full rounded-lg border p-3 text-left transition-all hover:border-primary/50 hover:bg-accent/50",
                selectedCitation?.id === citation.id ? "border-primary bg-accent" : "border-border bg-background/50",
              )}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground">
                  [{citation.number}]
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpandedCitation(expandedCitation === citation.id ? null : citation.id)
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {expandedCitation === citation.id ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              </div>

              <h3
                className={cn(
                  "mb-1 text-xs font-medium leading-tight text-foreground",
                  expandedCitation !== citation.id && "line-clamp-2",
                )}
              >
                {citation.title}
              </h3>

              <p className="mb-1 text-xs text-muted-foreground">
                {citation.authors.split(",")[0]} et al. • {citation.year}
              </p>

              <p className="text-xs italic text-muted-foreground">{citation.journal}</p>

              {expandedCitation === citation.id && citation.summary && (
                <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
                  {citation.summary}
                </p>
              )}

              {citation.citedBy && (
                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <BookOpen className="h-3 w-3" />
                  <span>Cited by {citation.citedBy}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}
