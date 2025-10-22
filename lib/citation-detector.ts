export interface DetectedCitation {
  id: string
  type: "inline" | "reference" | "doi" | "url"
  text: string
  authors?: string[]
  title?: string
  journal?: string
  year?: number
  doi?: string
  url?: string
  page: number
  element?: HTMLElement
  confidence: number
  position?: { x: number; y: number }
}

export class CitationDetector {
  private citationPatterns = [
    // Author-year patterns: (Smith, 2020), (Smith et al., 2020)
    {
      pattern: /\(([A-Z][a-z]+(?:\s+et\s+al\.)?),?\s+(\d{4}[a-z]?)\)/g,
      type: "inline" as const,
      confidence: 0.9,
      extract: (match: RegExpMatchArray) => ({
        authors: [match[1]],
        year: parseInt(match[2])
      })
    },
    
    // Multiple authors: (Smith, Jones & Brown, 2020)
    {
      pattern: /\(([A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+)*(?:\s*&\s*[A-Z][a-z]+)?),?\s+(\d{4}[a-z]?)\)/g,
      type: "inline" as const,
      confidence: 0.85,
      extract: (match: RegExpMatchArray) => ({
        authors: match[1].split(/[,&]/).map(a => a.trim()),
        year: parseInt(match[2])
      })
    },
    
    // Numbered citations: [1], [2-5], [1,3,5]
    {
      pattern: /\[(\d+(?:[-,]\d+)*)\]/g,
      type: "reference" as const,
      confidence: 0.8,
      extract: (match: RegExpMatchArray) => ({})
    },
    
    // Superscript citations: ¹, ², etc.
    {
      pattern: /([¹²³⁴⁵⁶⁷⁸⁹⁰]+)/g,
      type: "reference" as const,
      confidence: 0.7,
      extract: (match: RegExpMatchArray) => ({})
    },
    
    // DOI patterns
    {
      pattern: /(10\.\d{4,}\/[^\s\)]+)/g,
      type: "doi" as const,
      confidence: 0.95,
      extract: (match: RegExpMatchArray) => ({
        doi: match[1],
        url: `https://doi.org/${match[1]}`
      })
    },
    
    // URL patterns for references
    {
      pattern: /(https?:\/\/[^\s\)]+)/g,
      type: "url" as const,
      confidence: 0.9,
      extract: (match: RegExpMatchArray) => ({
        url: match[1]
      })
    },

    // arXiv patterns
    {
      pattern: /(arXiv:\d{4}\.\d{4,5}(?:v\d+)?)/g,
      type: "reference" as const,
      confidence: 0.9,
      extract: (match: RegExpMatchArray) => ({
        url: `https://arxiv.org/abs/${match[1].replace('arXiv:', '')}`
      })
    }
  ]

  detectCitationsInElement(element: HTMLElement, pageNumber: number): DetectedCitation[] {
    const citations: DetectedCitation[] = []
    const textContent = element.textContent || ""
    
    this.citationPatterns.forEach((patternConfig, patternIndex) => {
      let match
      const regex = new RegExp(patternConfig.pattern.source, patternConfig.pattern.flags)
      
      while ((match = regex.exec(textContent)) !== null) {
        const citationText = match[0]
        const extractedData = patternConfig.extract(match)
        
        const citation: DetectedCitation = {
          id: `citation-${pageNumber}-${match.index}-${patternIndex}`,
          type: patternConfig.type,
          text: citationText,
          page: pageNumber,
          element: element,
          confidence: patternConfig.confidence,
          ...extractedData
        }

        // Avoid duplicate citations
        const isDuplicate = citations.some(c => 
          c.text === citation.text && 
          Math.abs(c.page - citation.page) <= 1
        )
        
        if (!isDuplicate) {
          citations.push(citation)
        }
      }
    })

    return this.rankCitations(citations)
  }

  private rankCitations(citations: DetectedCitation[]): DetectedCitation[] {
    // Sort by confidence and type priority
    const typePriority = { doi: 4, inline: 3, url: 2, reference: 1 }
    
    return citations.sort((a, b) => {
      const priorityDiff = (typePriority[b.type] || 0) - (typePriority[a.type] || 0)
      if (priorityDiff !== 0) return priorityDiff
      return b.confidence - a.confidence
    })
  }

  // Enhanced citation detection with DOM manipulation
  highlightCitationsInElement(
    element: HTMLElement, 
    pageNumber: number, 
    onClick: (citation: DetectedCitation, event: MouseEvent) => void
  ): DetectedCitation[] {
    const citations = this.detectCitationsInElement(element, pageNumber)
    
    // Process citations in reverse order to maintain text positions
    citations.reverse().forEach(citation => {
      const textNodes = this.findTextNodesWithContent(element, citation.text)
      textNodes.forEach(textNode => {
        this.wrapCitationInSpan(textNode, citation, onClick)
      })
    })

    return citations.reverse()
  }

  private findTextNodesWithContent(element: HTMLElement, searchText: string): Text[] {
    const textNodes: Text[] = []
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          return node.textContent?.includes(searchText) 
            ? NodeFilter.FILTER_ACCEPT 
            : NodeFilter.FILTER_REJECT
        }
      }
    )

    let node
    while (node = walker.nextNode()) {
      textNodes.push(node as Text)
    }
    return textNodes
  }

  private wrapCitationInSpan(
    textNode: Text, 
    citation: DetectedCitation, 
    onClick: (citation: DetectedCitation, event: MouseEvent) => void
  ) {
    const text = textNode.textContent || ""
    const index = text.indexOf(citation.text)
    
    if (index !== -1 && !this.isAlreadyWrapped(textNode)) {
      // Split the text node
      const beforeText = text.substring(0, index)
      const afterText = text.substring(index + citation.text.length)
      
      // Create citation span with enhanced styling
      const citationSpan = document.createElement("span")
      citationSpan.textContent = citation.text
      citationSpan.className = this.getCitationClassName(citation)
      citationSpan.setAttribute("data-citation-id", citation.id)
      citationSpan.setAttribute("data-citation-type", citation.type)
      citationSpan.setAttribute("title", `${citation.type} citation - Click for details`)
      
      // Add click handler
      citationSpan.addEventListener("click", (event) => {
        event.stopPropagation()
        onClick(citation, event)
      })
      
      // Add hover effects
      citationSpan.addEventListener("mouseenter", () => {
        citationSpan.style.transform = "scale(1.02)"
        citationSpan.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)"
      })
      
      citationSpan.addEventListener("mouseleave", () => {
        citationSpan.style.transform = "scale(1)"
        citationSpan.style.boxShadow = "none"
      })
      
      // Replace the text node with the new structure
      const parent = textNode.parentNode
      if (parent) {
        if (beforeText) {
          parent.insertBefore(document.createTextNode(beforeText), textNode)
        }
        parent.insertBefore(citationSpan, textNode)
        if (afterText) {
          parent.insertBefore(document.createTextNode(afterText), textNode)
        }
        parent.removeChild(textNode)
      }
    }
  }

  private getCitationClassName(citation: DetectedCitation): string {
    const baseClasses = "inline-citation cursor-pointer transition-all duration-200 px-1 py-0.5 rounded text-sm font-medium"
    
    switch (citation.type) {
      case "doi":
        return `${baseClasses} text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300`
      case "url":
        return `${baseClasses} text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 hover:border-green-300`
      case "inline":
        return `${baseClasses} text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 hover:border-orange-300`
      case "reference":
        return `${baseClasses} text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 hover:border-purple-300`
      default:
        return `${baseClasses} text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-gray-300`
    }
  }

  private isAlreadyWrapped(textNode: Text): boolean {
    const parent = textNode.parentElement
    return parent?.classList.contains("inline-citation") || false
  }

  // Clean up existing citation highlights
  cleanupCitationsInElement(element: HTMLElement) {
    const existingCitations = element.querySelectorAll(".inline-citation")
    existingCitations.forEach(span => {
      const parent = span.parentNode
      const textContent = span.textContent
      if (parent && textContent) {
        parent.insertBefore(document.createTextNode(textContent), span)
        parent.removeChild(span)
      }
    })
  }

  // Get citation statistics
  getCitationStats(citations: DetectedCitation[]) {
    const stats = {
      total: citations.length,
      byType: {} as Record<string, number>,
      avgConfidence: 0,
      highConfidence: 0
    }

    citations.forEach(citation => {
      stats.byType[citation.type] = (stats.byType[citation.type] || 0) + 1
      stats.avgConfidence += citation.confidence
      if (citation.confidence > 0.8) {
        stats.highConfidence++
      }
    })

    stats.avgConfidence = stats.avgConfidence / citations.length || 0

    return stats
  }
}

export const citationDetector = new CitationDetector()
