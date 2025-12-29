"use client"

import { useContext } from 'react'
import { 
  Plugin, 
  PluginOnAnnotationLayerRender, 
  AnnotationType, 
  PluginRenderPageLayer
} from '@react-pdf-viewer/core'
import { CitationContext } from '@/components/pdf-viewer'

// --- Types (Preserved) ---
interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Target {
  page: number
  x: number
  y: number
}

interface AnnotationMetadata {
  id: string
  ref_id: string
  title?: string
  authors?: string[]
  year?: number
  venue?: string
  doi?: string
  arxiv_id?: string
  bib_box?: {
    page: number
    left: number
    top: number
    width: number
    height: number
  }
}

export interface Annotation {
  dest: string
  source: BoundingBox
  target: Target | null
  metadata?: AnnotationMetadata
}

interface PageAnnotations {
  page: number
  annotations: Annotation[]
}

interface UseCitationAnnotationPluginProps {
  // We keep this prop for API compatibility, but the rendering now 
  // primarily uses the Context to avoid stale ref issues.
  annotationsRef?: React.MutableRefObject<PageAnnotations[]>
  onAnnotationClick?: (annotation: Annotation, event: React.MouseEvent) => void
}

// --- 1. The React Component Layer ---
// This component renders ON TOP of the PDF canvas.
// It automatically re-renders when CitationContext updates.
const CitationPageLayer = ({ 
  renderProps, 
  onAnnotationClick 
}: { 
  renderProps: PluginRenderPageLayer, 
  onAnnotationClick?: (annotation: Annotation, event: React.MouseEvent) => void 
}) => {
  const { annotations } = useContext(CitationContext)
  const currentPage = renderProps.pageIndex + 1

  // Find data for this specific page
  const pageData = annotations.find((p) => p.page === currentPage)

  if (!pageData || pageData.annotations.length === 0) {
    return null
  }

  return (
    <>
      {pageData.annotations.map((annotation, idx) => {
        const { source, metadata } = annotation
        const hasMetadata = !!metadata
        const baseColor = hasMetadata ? '59, 130, 246' : '156, 163, 175'

        return (
          <div
            key={`${currentPage}-${idx}-${annotation.dest}`}
            className="citation-annotation-box"
            title={
              onAnnotationClick
                ? (metadata?.title ? `${metadata.title}\nClick for details` : `Citation: ${annotation.dest}\nClick for info`)
                : (metadata?.title ? `${metadata.title}` : `Citation: ${annotation.dest}`)
            }
            onClick={(e) => {
              if (onAnnotationClick) {
                e.preventDefault()
                e.stopPropagation()
                onAnnotationClick(annotation, e)
              }
            }}
            style={{
              position: 'absolute',
              // Use Percentages for responsive positioning
              left: `${source.x1 * 100}%`,
              top: `${source.y1 * 100}%`,
              width: `${(source.x2 - source.x1) * 100}%`,
              height: `${(source.y2 - source.y1) * 100}%`,
              
              // Styles
              backgroundColor: `rgba(${baseColor}, 0.15)`,
              border: `1.5px solid rgba(${baseColor}, 0.5)`,
              borderRadius: '3px',
              cursor: onAnnotationClick ? 'pointer' : 'default',
              zIndex: 100, // Sit on top of native links
              pointerEvents: onAnnotationClick ? 'auto' : 'none',
              transition: 'all 0.15s ease',
            }}
            // Hover effects via React events
            onMouseEnter={(e) => {
              if (!onAnnotationClick) return
              const target = e.currentTarget
              target.style.backgroundColor = `rgba(${baseColor}, 0.3)`
              target.style.borderColor = `rgba(${baseColor}, 0.7)`
              target.style.borderWidth = '2px'
              target.style.boxShadow = `0 2px 8px rgba(${baseColor}, 0.3)`
            }}
            onMouseLeave={(e) => {
              if (!onAnnotationClick) return
              const target = e.currentTarget
              target.style.backgroundColor = `rgba(${baseColor}, 0.15)`
              target.style.borderColor = `rgba(${baseColor}, 0.5)`
              target.style.borderWidth = '1.5px'
              target.style.boxShadow = 'none'
            }}
          />
        )
      })}
    </>
  )
}

// --- 2. The Plugin Factory ---
export const useCitationAnnotationPlugin = ({
  annotationsRef,
  onAnnotationClick,
}: UseCitationAnnotationPluginProps): Plugin => {
  
  return {
    // A. Render Custom Layer (The colored boxes)
    // This is the new "Reactive" way using our Component
    renderPageLayer: (renderProps: PluginRenderPageLayer) => (
      <CitationPageLayer 
        renderProps={renderProps} 
        onAnnotationClick={onAnnotationClick} 
      />
    ),

    // B. Native Link Handling (The "Hack")
    // We keep this to disable the native invisible links so they don't hijack clicks
    onAnnotationLayerRender: (e: PluginOnAnnotationLayerRender) => {
      // Only run this if we are in interactive mode
      if (!onAnnotationClick) return

      const { annotations: pdfAnnotations, container } = e

      // Find all native link annotations
      const linkAnnotations = pdfAnnotations.filter(
        (annotation) => annotation.annotationType === AnnotationType.Link
      )

      if (linkAnnotations.length > 0) {
        // We need to wait slightly for the DOM elements to be created by the core library
        setTimeout(() => {
          const linkElements = container.querySelectorAll('.rpv-core__annotation--link')
          
          linkElements.forEach((linkEle) => {
            const anchorEle = linkEle.querySelector('a')
            if (anchorEle) {
              // Clone the node to strip existing event listeners or capture click
              anchorEle.addEventListener('click', (event) => {
                event.preventDefault()
                event.stopPropagation()
                console.log('[CitationPlugin] Prevented default link jump')
              }, { capture: true })
            }
          })
        }, 0)
      }
    },
  }
}