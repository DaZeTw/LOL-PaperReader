import { Plugin, PluginOnTextLayerRender } from "@react-pdf-viewer/core"
import { createRoot, Root } from "react-dom/client"
import { useEffect, useRef } from "react"
import { PDFHighlightOverlay, SkimmingHighlight } from "@/components/pdf-highlight-overlay"

interface UsePDFHighlightPluginProps {
  highlights: SkimmingHighlight[]
  visibleCategories: Set<string>
  onHighlightClick?: (highlight: SkimmingHighlight) => void
}

export function usePDFHighlightPlugin({
  highlights,
  visibleCategories,
  onHighlightClick,
}: UsePDFHighlightPluginProps): Plugin {
  const roots = useRef(new Map<HTMLElement, Root>())
  const highlightsRef = useRef(highlights)
  const categoriesRef = useRef(visibleCategories)
  
  // Store page numbers for each container
  const pageNumbers = useRef(new Map<HTMLElement, number>())
  
  // Update refs when props change
  useEffect(() => {
    highlightsRef.current = highlights
    categoriesRef.current = visibleCategories
    
    // Force re-render of all existing overlays when highlights change
    roots.current.forEach((root, container) => {
      const pageElement = container.closest(".rpv-core__page-layer") as HTMLElement
      if (!pageElement) return
      
      const canvasLayer = pageElement.querySelector(".rpv-core__canvas-layer canvas") as HTMLCanvasElement
      if (!canvasLayer) return
      
      const pageNumber = pageNumbers.current.get(container) || 1
      const pageWidth = canvasLayer.offsetWidth
      const pageHeight = canvasLayer.offsetHeight
      
      root.render(
        <PDFHighlightOverlay
          pageNumber={pageNumber}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          highlights={highlights}
          visibleCategories={visibleCategories}
          onHighlightClick={onHighlightClick}
        />
      )
    })
  }, [highlights, visibleCategories, onHighlightClick])

  const onTextLayerRender: PluginOnTextLayerRender = (e: any) => {
    const textLayerDiv = e.ele as HTMLElement
    const pageNumber = e.pageIndex + 1

    // Get page dimensions - use the canvas layer for accurate dimensions
    const pageElement = textLayerDiv.closest(".rpv-core__page-layer") as HTMLElement
    if (!pageElement) {
      console.warn(`[usePDFHighlightPlugin] Could not find page layer for page ${pageNumber}`)
      return
    }

    // Find the canvas element to get exact page dimensions
    const canvasLayer = pageElement.querySelector(".rpv-core__canvas-layer canvas") as HTMLCanvasElement
    if (!canvasLayer) {
      console.warn(`[usePDFHighlightPlugin] Could not find canvas for page ${pageNumber}`)
      return
    }

    // Create or find overlay container
    let overlayContainer = textLayerDiv.querySelector(
      ".pdf-highlight-overlay-container"
    ) as HTMLElement

    if (!overlayContainer) {
      overlayContainer = document.createElement("div")
      overlayContainer.className = "pdf-highlight-overlay-container"
      overlayContainer.style.position = "absolute"
      overlayContainer.style.top = "0"
      overlayContainer.style.left = "0"
      overlayContainer.style.width = "100%"
      overlayContainer.style.height = "100%"
      overlayContainer.style.pointerEvents = "none"
      overlayContainer.style.zIndex = "2"  // Above text layer (z-index: 1)
      // Removed mixBlendMode for more vibrant colors

      textLayerDiv.appendChild(overlayContainer)
    }

    // Get page dimensions from canvas (most accurate)
    const pageWidth = canvasLayer.offsetWidth
    const pageHeight = canvasLayer.offsetHeight

    console.log(`[usePDFHighlightPlugin] Page ${pageNumber}: ${pageWidth}x${pageHeight}px, ${highlightsRef.current.length} total highlights`)

    // Store page number for this container
    pageNumbers.current.set(overlayContainer, pageNumber)
    
    // Reuse existing root or create new one
    let root = roots.current.get(overlayContainer)
    if (!root) {
      root = createRoot(overlayContainer)
      roots.current.set(overlayContainer, root)
    }

    // Render or update overlay with current highlights
    root.render(
      <PDFHighlightOverlay
        pageNumber={pageNumber}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        highlights={highlightsRef.current}
        visibleCategories={categoriesRef.current}
        onHighlightClick={onHighlightClick}
      />
    )
  }

  return {
    onTextLayerRender,
    // Cleanup on unmount
    uninstall: () => {
      roots.current.forEach((root) => root.unmount())
      roots.current.clear()
      pageNumbers.current.clear()
    },
  }
}
