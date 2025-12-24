"use client"

import { Plugin, PluginOnAnnotationLayerRender, AnnotationType } from '@react-pdf-viewer/core'

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
  annotationsRef: React.MutableRefObject<PageAnnotations[]>
  onAnnotationClick?: (annotation: Annotation, event: MouseEvent) => void  // Made optional
}

export const useCitationAnnotationPlugin = ({
  annotationsRef,
  onAnnotationClick,
}: UseCitationAnnotationPluginProps): Plugin => {
  
  console.log('[CitationAnnotationPlugin] Initialized', { interactive: !!onAnnotationClick })

  return {
    onAnnotationLayerRender: (e: PluginOnAnnotationLayerRender) => {
      const { pageIndex, container, annotations: pdfAnnotations } = e
      const currentPage = pageIndex + 1

      // ✅ Prevent default PDF link annotations from jumping (only if interactive)
      if (onAnnotationClick) {
        pdfAnnotations
          .filter((annotation) => annotation.annotationType === AnnotationType.Link)
          .forEach((annotation) => {
            // Find all link elements in the annotation layer
            const linkElements = container.querySelectorAll('.rpv-core__annotation--link')
            linkElements.forEach((linkEle) => {
              const anchorEle = linkEle.querySelector('a')
              if (anchorEle) {
                // ✅ Prevent default click behavior
                anchorEle.addEventListener('click', (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  console.log('[CitationPlugin] Prevented default link jump')
                }, { capture: true })
              }
            })
          })
      }

      // Get current annotations from ref
      const annotations = annotationsRef.current
      
      // Find our extracted citation data for this page
      const pageData = annotations.find((p) => p.page === currentPage)
      if (!pageData || pageData.annotations.length === 0) {
        return
      }

      console.log(`[CitationPlugin] Page ${currentPage}: ${pageData.annotations.length} citations to render`)

      // Wait for annotation layer to be ready
      setTimeout(() => {
        const annotationLayer = container as HTMLElement
        if (!annotationLayer) {
          console.log('[CitationPlugin] No annotation layer found')
          return
        }

        // Find the page container
        const pageContainer = annotationLayer.closest('.rpv-core__page-layer') as HTMLElement
        if (!pageContainer) {
          console.log('[CitationPlugin] No page container found')
          return
        }

        // Get the canvas to calculate dimensions
        const canvas = pageContainer.querySelector('canvas')
        if (!canvas) {
          console.log('[CitationPlugin] No canvas found')
          return
        }

        const pageWidth = canvas.clientWidth
        const pageHeight = canvas.clientHeight

        console.log(`[CitationPlugin] Page ${currentPage} dimensions: ${pageWidth}x${pageHeight}`)

        // Remove old citation boxes from this specific page
        pageContainer.querySelectorAll('.citation-annotation-box').forEach(el => el.remove())

        // Create overlays for each citation annotation
        pageData.annotations.forEach((annotation, idx) => {
          const { source, metadata } = annotation

          // Convert normalized coordinates to pixels
          const left = source.x1 * pageWidth
          const top = source.y1 * pageHeight
          const width = (source.x2 - source.x1) * pageWidth
          const height = (source.y2 - source.y1) * pageHeight

          console.log(`[Citation ${idx}] ${annotation.dest}: (${left.toFixed(1)}, ${top.toFixed(1)}) ${width.toFixed(1)}x${height.toFixed(1)}`)

          // Create the citation box
          const citationBox = document.createElement('div')
          citationBox.className = 'citation-annotation-box'
          citationBox.setAttribute('data-dest', annotation.dest)
          citationBox.setAttribute('data-page', String(currentPage))

          // Color based on metadata availability
          const hasMetadata = !!metadata
          const color = hasMetadata ? '59, 130, 246' : '156, 163, 175'

          // Apply styles - conditional interactivity
          Object.assign(citationBox.style, {
            position: 'absolute',
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
            backgroundColor: `rgba(${color}, 0.15)`,
            border: `1.5px solid rgba(${color}, 0.5)`,
            borderRadius: '3px',
            cursor: onAnnotationClick ? 'pointer' : 'default',  // Conditional cursor
            zIndex: '100',
            transition: 'all 0.15s ease',
            pointerEvents: onAnnotationClick ? 'auto' : 'none',  // Conditional interaction
            boxSizing: 'border-box',
          })

          // Hover effects (only if interactive)
          if (onAnnotationClick) {
            citationBox.addEventListener('mouseenter', () => {
              citationBox.style.backgroundColor = `rgba(${color}, 0.3)`
              citationBox.style.borderColor = `rgba(${color}, 0.7)`
              citationBox.style.borderWidth = '2px'
              citationBox.style.boxShadow = `0 2px 8px rgba(${color}, 0.3)`
            })

            citationBox.addEventListener('mouseleave', () => {
              citationBox.style.backgroundColor = `rgba(${color}, 0.15)`
              citationBox.style.borderColor = `rgba(${color}, 0.5)`
              citationBox.style.borderWidth = '1.5px'
              citationBox.style.boxShadow = 'none'
            })

            // ✅ Handle click with preventDefault (only if handler provided)
            citationBox.addEventListener('click', (event: Event) => {
              const mouseEvent = event as MouseEvent
              mouseEvent.preventDefault()
              mouseEvent.stopPropagation()
              console.log(`[CitationPlugin] Clicked: ${annotation.dest}`, metadata)
              onAnnotationClick(annotation, mouseEvent)
            }, { capture: true }) // ✅ Use capture phase to intercept before other handlers
          }

          // Tooltip (always show, but different text based on mode)
          citationBox.title = onAnnotationClick
            ? (metadata?.title 
                ? `${metadata.title}\nClick for details` 
                : `Citation: ${annotation.dest}\nClick for info`)
            : (metadata?.title 
                ? `${metadata.title}` 
                : `Citation: ${annotation.dest}`)

          // Append to page container
          pageContainer.appendChild(citationBox)
        })

        console.log(`✅ [CitationPlugin] Rendered ${pageData.annotations.length} citation boxes on page ${currentPage}`)
      }, 150)
    },
  }
}