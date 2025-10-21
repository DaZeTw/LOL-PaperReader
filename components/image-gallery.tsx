"use client"

import { useState } from "react"
import { Image as ImageIcon, ChevronLeft, Search, X, Download, ZoomIn, Maximize2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface ImageItem {
  id: string
  pageNumber: number
  caption?: string
  altText?: string
  width: number
  height: number
  thumbnailUrl: string
  fullUrl: string
  type: "figure" | "chart" | "diagram" | "photo" | "equation"
}

interface ImageGalleryProps {
  images: ImageItem[]
  isOpen: boolean
  onToggle: () => void
  onJumpToPage?: (page: number) => void
}

// Mock image data for demonstration
export const mockImages: ImageItem[] = [
  {
    id: "img-1",
    pageNumber: 2,
    caption: "Figure 1: PaperQA2 system architecture showing the multi-agent workflow",
    altText: "System architecture diagram",
    width: 800,
    height: 600,
    thumbnailUrl: "https://picsum.photos/seed/fig1/400/300",
    fullUrl: "https://picsum.photos/seed/fig1/800/600",
    type: "diagram",
  },
  {
    id: "img-2",
    pageNumber: 3,
    caption: "Figure 2: Performance comparison across different benchmarks",
    altText: "Bar chart comparing performance metrics",
    width: 800,
    height: 500,
    thumbnailUrl: "https://picsum.photos/seed/fig2/400/250",
    fullUrl: "https://picsum.photos/seed/fig2/800/500",
    type: "chart",
  },
  {
    id: "img-3",
    pageNumber: 4,
    caption: "Figure 3: Retrieval-augmented generation pipeline",
    altText: "RAG pipeline flowchart",
    width: 800,
    height: 400,
    thumbnailUrl: "https://picsum.photos/seed/fig3/400/200",
    fullUrl: "https://picsum.photos/seed/fig3/800/400",
    type: "diagram",
  },
  {
    id: "img-4",
    pageNumber: 5,
    caption: "Figure 4: Accuracy improvements over baseline models",
    altText: "Line graph showing accuracy trends",
    width: 800,
    height: 600,
    thumbnailUrl: "https://picsum.photos/seed/fig4/400/300",
    fullUrl: "https://picsum.photos/seed/fig4/800/600",
    type: "chart",
  },
  {
    id: "img-5",
    pageNumber: 6,
    caption: "Figure 5: Agent decision-making process",
    altText: "Flowchart of agent decisions",
    width: 800,
    height: 700,
    thumbnailUrl: "https://picsum.photos/seed/fig5/400/350",
    fullUrl: "https://picsum.photos/seed/fig5/800/700",
    type: "diagram",
  },
  {
    id: "img-6",
    pageNumber: 7,
    caption: "Figure 6: Hallucination rates across different configurations",
    altText: "Comparison chart of hallucination rates",
    width: 800,
    height: 500,
    thumbnailUrl: "https://picsum.photos/seed/fig6/400/250",
    fullUrl: "https://picsum.photos/seed/fig6/800/500",
    type: "chart",
  },
  {
    id: "img-7",
    pageNumber: 9,
    caption: "Figure 7: Citation network visualization",
    altText: "Network graph of paper citations",
    width: 800,
    height: 800,
    thumbnailUrl: "https://picsum.photos/seed/fig7/400/400",
    fullUrl: "https://picsum.photos/seed/fig7/800/800",
    type: "diagram",
  },
  {
    id: "img-8",
    pageNumber: 10,
    caption: "Figure 8: Response time comparison",
    altText: "Bar chart showing response times",
    width: 800,
    height: 450,
    thumbnailUrl: "https://picsum.photos/seed/fig8/400/225",
    fullUrl: "https://picsum.photos/seed/fig8/800/450",
    type: "chart",
  },
]

const typeColors = {
  figure: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  chart: "bg-green-500/10 text-green-700 dark:text-green-400",
  diagram: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  photo: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  equation: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
}

export function ImageGallery({ images, isOpen, onToggle, onJumpToPage }: ImageGalleryProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [hoveredImage, setHoveredImage] = useState<ImageItem | null>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null)

  const filteredImages = images.filter(
    (img) =>
      img.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      img.altText?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      img.pageNumber.toString().includes(searchQuery)
  )

  const handleImageHover = (image: ImageItem | null, e?: React.MouseEvent) => {
    setHoveredImage(image)
    if (e && image) {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }
  }

  const handleImageClick = (image: ImageItem) => {
    if (onJumpToPage) {
      onJumpToPage(image.pageNumber)
    }
  }

  const handleDownloadImage = (image: ImageItem, e: React.MouseEvent) => {
    e.stopPropagation()
    // In a real implementation, this would download the image
    console.log("[v0] Downloading image:", image.id)
    window.open(image.fullUrl, "_blank")
  }

  const handleViewFullSize = (image: ImageItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedImage(image)
  }

  return (
    <>
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed right-4 top-1/3 z-10 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border-2 border-border bg-background shadow-lg transition-all hover:scale-110 hover:bg-accent hover:shadow-xl"
          title="Image Gallery (I)"
        >
          <ImageIcon className="h-5 w-5 text-foreground" />
          <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {images.length}
          </span>
        </button>
      )}

      <aside
        className={cn(
          "fixed right-0 top-0 z-40 flex h-screen flex-col border-l border-border bg-background shadow-2xl transition-all duration-300",
          isOpen ? "w-96" : "w-0 overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/5 to-accent/5 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ImageIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-mono text-lg font-semibold text-foreground">Image Gallery</h2>
              <p className="font-mono text-xs text-muted-foreground">{images.length} images found</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="border-b border-border p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search images..."
              className="h-10 pl-10 pr-10 font-mono text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Image List */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {filteredImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ImageIcon className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="font-mono text-sm text-muted-foreground">
                  {searchQuery ? "No images match your search" : "No images found in document"}
                </p>
              </div>
            ) : (
              filteredImages.map((image) => (
                <Card
                  key={image.id}
                  className="group relative cursor-pointer overflow-hidden border-2 transition-all hover:border-primary/50 hover:shadow-lg"
                  onClick={() => handleImageClick(image)}
                  onMouseEnter={(e) => handleImageHover(image, e)}
                  onMouseMove={(e) => setMousePosition({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => handleImageHover(null)}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video w-full overflow-hidden bg-muted">
                    <img
                      src={image.thumbnailUrl}
                      alt={image.altText || image.caption || "Figure"}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                    {/* Hover Actions */}
                    <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 gap-1 shadow-lg"
                        onClick={(e) => handleViewFullSize(image, e)}
                      >
                        <ZoomIn className="h-3 w-3" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 gap-1 shadow-lg"
                        onClick={(e) => handleDownloadImage(image, e)}
                      >
                        <Download className="h-3 w-3" />
                        Save
                      </Button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-mono text-xs font-medium capitalize",
                          typeColors[image.type]
                        )}
                      >
                        {image.type}
                      </span>
                      <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                        <span>Page</span>
                        <span className="font-semibold">{image.pageNumber}</span>
                      </span>
                    </div>

                    {image.caption && (
                      <p className="font-mono text-xs leading-relaxed text-foreground line-clamp-2" title={image.caption}>
                        {image.caption}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {image.width} × {image.height}
                      </span>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border bg-muted/30 px-4 py-3">
          <p className="font-mono text-xs text-muted-foreground">
            {filteredImages.length} of {images.length} images
            {searchQuery && " (filtered)"}
          </p>
        </div>
      </aside>

      {/* Hover Preview Popup */}
      {hoveredImage && (
        <div
          className="pointer-events-none fixed z-50 transition-opacity duration-200"
          style={{
            left: `${mousePosition.x + 20}px`,
            top: `${mousePosition.y - 100}px`,
          }}
        >
          <Card className="w-80 border-2 border-primary/30 bg-background/95 p-3 shadow-2xl backdrop-blur-sm">
            <div className="space-y-2">
              <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                <img
                  src={hoveredImage.fullUrl}
                  alt={hoveredImage.altText || hoveredImage.caption || "Preview"}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-mono text-xs font-medium capitalize",
                      typeColors[hoveredImage.type]
                    )}
                  >
                    {hoveredImage.type}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">Page {hoveredImage.pageNumber}</span>
                </div>
                {hoveredImage.caption && (
                  <p className="font-mono text-xs leading-relaxed text-foreground line-clamp-3">
                    {hoveredImage.caption}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Full Size Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-0 h-10 w-10 bg-background/80"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-5 w-5" />
            </Button>
            <Card className="overflow-hidden border-2 border-border">
              <img
                src={selectedImage.fullUrl}
                alt={selectedImage.altText || selectedImage.caption || "Full size"}
                className="max-h-[80vh] max-w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="border-t border-border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-mono text-xs font-medium capitalize",
                          typeColors[selectedImage.type]
                        )}
                      >
                        {selectedImage.type}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">Page {selectedImage.pageNumber}</span>
                    </div>
                    {selectedImage.caption && (
                      <p className="font-mono text-sm text-foreground">{selectedImage.caption}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDownloadImage(selectedImage, e)
                      }}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleImageClick(selectedImage)
                        setSelectedImage(null)
                      }}
                    >
                      <Maximize2 className="h-4 w-4" />
                      Go to Page
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
