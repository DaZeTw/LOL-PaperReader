import { Plugin, PluginOnTextLayerRender } from "@react-pdf-viewer/core"
import { createRoot, Root } from "react-dom/client"
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
  const roots = new Map<HTMLElement, Root>()

  const onTextLayerRender: PluginOnTextLayerRender = (e: any) => {
    const textLayerDiv = e.ele as HTMLElement
    const pageNumber = e.pageIndex + 1

    // Get page dimensions
    const pageElement = textLayerDiv.closest(".rpv-core__page-layer") as HTMLElement
    if (!pageElement) return

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
      overlayContainer.style.zIndex = "10"

      textLayerDiv.appendChild(overlayContainer)
    }

    // Get page dimensions from the rendered page
    const rect = pageElement.getBoundingClientRect()
    const pageWidth = rect.width
    const pageHeight = rect.height

    // Clean up old root if exists
    const existingRoot = roots.get(overlayContainer)
    if (existingRoot) {
      existingRoot.unmount()
      roots.delete(overlayContainer)
    }

    // Create new React root and render overlay
    const root = createRoot(overlayContainer)
    roots.set(overlayContainer, root)

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
  }

  return {
    onTextLayerRender,
    // Cleanup on unmount
    uninstall: () => {
      roots.forEach((root) => root.unmount())
      roots.clear()
    },
  }
}
