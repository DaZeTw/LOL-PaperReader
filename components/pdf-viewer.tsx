"use client";

import { useState, useEffect, useRef } from "react"
import { Viewer, Worker } from "@react-pdf-viewer/core"
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation"
import { zoomPlugin } from "@react-pdf-viewer/zoom"
import { thumbnailPlugin } from "@react-pdf-viewer/thumbnail"
import { bookmarkPlugin } from "@react-pdf-viewer/bookmark"
import { useCitationPlugin } from "@/hooks/useCitatioPlugin";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Sidebar, ExternalLink, Loader2, X, Link as LinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { PDFSidebar } from "./pdf-sidebar"
import { PDFCitationLinkDetector } from "@/components/pdf-citation-link-detector"

import "@react-pdf-viewer/core/lib/styles/index.css"
import "@react-pdf-viewer/page-navigation/lib/styles/index.css"
import "@react-pdf-viewer/zoom/lib/styles/index.css"
import "@react-pdf-viewer/thumbnail/lib/styles/index.css"
import "@react-pdf-viewer/bookmark/lib/styles/index.css"
import "@/styles/pdf-components.css"

interface CitationPopup {
  citation: any;
  position: { x: number; y: number };
  paperUrl?: string | null;
  loadingUrl?: boolean;
  urlFallback?: boolean;
}

interface PDFViewerProps {
  file: File
  selectedSection?: string | null
  navigationTarget?: { page: number; yPosition: number } | undefined
  onPageChange?: (page: number) => void
  onSectionSelect?: (bookmark: any) => void
  onCitationClick?: (citation: any, event: MouseEvent) => void
  onHandlersReady?: (handlers: any) => void
  parsedData?: {
    references?: Array<{
      id: string;
      number: number;
      text: string;
      authors?: string;
      title?: string;
      year?: string;
      journal?: string;
      doi?: string;
      url?: string;
      arxivId?: string;
    }>;
  } | null;
}

export function PDFViewer({
  file,
  selectedSection,
  navigationTarget,
  onPageChange,
  onSectionSelect,
  onCitationClick,
  onHandlersReady,
  parsedData,
}: PDFViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string>("")
  const [numPages, setNumPages] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [citationPopup, setCitationPopup] = useState<CitationPopup | null>(null)

  const currentPageRef = useRef(1)
  const pageLabelRef = useRef<HTMLSpanElement>(null)
  const zoomRef = useRef(1)
  const zoomLabelRef = useRef<HTMLSpanElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const viewerContainerRef = useRef<HTMLDivElement>(null!)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const pageNavigationPluginInstance = pageNavigationPlugin()
  const zoomPluginInstance = zoomPlugin()
  const thumbnailPluginInstance = thumbnailPlugin()
  const bookmarkPluginInstance = bookmarkPlugin()
  const citationPluginInstance = useCitationPlugin({
    onCitationClick: onCitationClick
  });

  const { jumpToNextPage, jumpToPreviousPage } = pageNavigationPluginInstance
  const { zoomTo } = zoomPluginInstance

  // Convert file to blob URL
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file])

  // 🔍 Zoom controls without re-render
  const handleZoomIn = () => {
    const newScale = Math.min(2, zoomRef.current + 0.1)
    zoomRef.current = newScale
    zoomTo(newScale)
    requestAnimationFrame(() => {
      if (zoomLabelRef.current)
        zoomLabelRef.current.textContent = `${Math.round(newScale * 100)}%`
    })
  }

  const handleZoomOut = () => {
    const newScale = Math.max(0.5, zoomRef.current - 0.1)
    zoomRef.current = newScale
    zoomTo(newScale)
    requestAnimationFrame(() => {
      if (zoomLabelRef.current)
        zoomLabelRef.current.textContent = `${Math.round(newScale * 100)}%`
    })
  }

  // Citation detection logic
  useEffect(() => {
    if (!viewerRef.current || !parsedData?.references) {
      console.log("[PDFViewer] Citation detection skipped:", {
        hasViewerRef: !!viewerRef.current,
        hasReferences: !!parsedData?.references,
        referencesCount: parsedData?.references?.length || 0,
      });
      return;
    }

    console.log(
      "[PDFViewer] Setting up citation detection with",
      parsedData.references.length,
      "references"
    );

    const handleTextLayerRendered = () => {
      const textLayers = viewerRef.current?.querySelectorAll(
        ".rpv-core__text-layer"
      );
      console.log("[PDFViewer] Found", textLayers?.length || 0, "text layers");

      textLayers?.forEach((layer, layerIndex) => {
        const textSpans = layer.querySelectorAll("span");
        console.log(
          "[PDFViewer] Layer",
          layerIndex,
          "has",
          textSpans.length,
          "text spans"
        );

        textSpans.forEach((span, spanIndex) => {
          const text = span.textContent || "";
          const trimmedText = text.trim();

          // Check if this is a styled superscript, hyperlink, or PDF link annotation
          const computedStyle = window.getComputedStyle(span);
          const fontSize = parseFloat(computedStyle.fontSize);
          const verticalAlign = computedStyle.verticalAlign;
          const color = computedStyle.color;
          const textDecoration = computedStyle.textDecoration;

          // Check if this span is a hyperlink or inside one
          const isHyperlink =
            span.closest("a") !== null ||
            (textDecoration.includes("underline") &&
              color !== "rgb(0, 0, 0)") ||
            span.hasAttribute("data-annotation-type") ||
            span.getAttribute("role") === "link";

          // Check parent elements
          let parentElement = span.parentElement;
          let parentVerticalAlign = "";
          let parentFontSize = NaN;
          let parentIsLink = false;

          if (parentElement) {
            const parentStyle = window.getComputedStyle(parentElement);
            parentVerticalAlign = parentStyle.verticalAlign;
            parentFontSize = parseFloat(parentStyle.fontSize);
            parentIsLink =
              parentElement.tagName.toLowerCase() === "a" ||
              (parentStyle.textDecoration.includes("underline") &&
                parentStyle.color !== "rgb(0, 0, 0)") ||
              parentElement.getAttribute("role") === "link";
          }

          // Position-based superscript detection
          const isPositionBasedSuperscript = (() => {
            if (!/^\d+$/.test(trimmedText)) return false;

            const rect = span.getBoundingClientRect();
            const spanHeight = rect.height;
            const spanTop = rect.top;

            const allSpansInLayer = Array.from(textSpans);
            const nearbySpans = allSpansInLayer.filter((otherSpan, otherIndex) => {
              if (otherSpan === span || otherIndex === spanIndex) return false;

              const otherRect = otherSpan.getBoundingClientRect();
              const otherText = (otherSpan.textContent || "").trim();

              if (!otherText || otherText.length < 2) return false;

              const verticalDistance = Math.abs(otherRect.top - spanTop);
              const horizontalDistance = Math.abs(otherRect.left - rect.left);

              return horizontalDistance < 50 && verticalDistance < spanHeight * 2;
            });

            if (nearbySpans.length === 0) return false;

            let totalBaseline = 0;
            let validCount = 0;

            nearbySpans.forEach((nearbySpan) => {
              const nearbyRect = nearbySpan.getBoundingClientRect();
              const nearbyFontSize = parseFloat(window.getComputedStyle(nearbySpan).fontSize);

              const baseline = nearbyRect.bottom;

              if (nearbyFontSize >= 10) {
                totalBaseline += baseline;
                validCount++;
              }
            });

            if (validCount === 0) return false;

            const avgBaseline = totalBaseline / validCount;
            const currentBaseline = rect.bottom;

            const baselineOffset = avgBaseline - currentBaseline;

            const isSuperscript = baselineOffset > Math.max(3, spanHeight * 0.25);

            if (isSuperscript) {
              console.log(
                "[PDFViewer] Position-based superscript detected:",
                trimmedText,
                "baselineOffset:",
                baselineOffset,
                "spanHeight:",
                spanHeight
              );
            }

            return isSuperscript;
          })();

          // Consider elements that look like citations
          const isStyledSuperscript =
            verticalAlign === "super" ||
            verticalAlign === "sup" ||
            parentVerticalAlign === "super" ||
            parentVerticalAlign === "sup" ||
            span.closest("sup") !== null ||
            (fontSize > 0 &&
              (!isNaN(parentFontSize)
                ? fontSize < parentFontSize * 0.8
                : fontSize < 10)) ||
            (isHyperlink && /^\d+$/.test(trimmedText)) ||
            (parentIsLink && /^\d+$/.test(trimmedText)) ||
            isPositionBasedSuperscript;

          // Extract citation numbers
          const bracketMatch = text.match(/\[(\d+(?:-\d+)?)\]/);
          const superscriptMatch = text.match(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/);
          const digitSeqMatch = text.match(/\d+/);

          const plainNumberMatch =
            digitSeqMatch &&
            ((/^\d+$/.test(trimmedText) && isStyledSuperscript) ||
              ((isHyperlink || parentIsLink) && /\d+/.test(trimmedText)) ||
              (/^[\d,\s]+$/.test(trimmedText) && isStyledSuperscript));

          let citationNums: number[] = [];
          let matchType: "bracket" | "superscript" | null = null;

          if (bracketMatch) {
            citationNums = [Number.parseInt(bracketMatch[1])];
            matchType = "bracket";
            console.log(
              "[PDFViewer] Found bracket citation:",
              bracketMatch[0],
              "->",
              citationNums[0]
            );
          } else if (superscriptMatch) {
            const superscriptMap: { [key: string]: string } = {
              "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
              "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
            };
            const normalNum = superscriptMatch[0]
              .split("")
              .map((c) => superscriptMap[c] || c)
              .join("");
            citationNums = [Number.parseInt(normalNum)];
            matchType = "superscript";
            console.log(
              "[PDFViewer] Found superscript citation:",
              superscriptMatch[0],
              "->",
              citationNums[0]
            );
          } else if (plainNumberMatch) {
            if (/^[\d,\s]+$/.test(trimmedText) && trimmedText.includes(",")) {
              citationNums = trimmedText
                .split(",")
                .map((n) => n.trim())
                .filter((n) => /^\d+$/.test(n))
                .map((n) => Number.parseInt(n));
              matchType = "superscript";
              console.log(
                "[PDFViewer] Found comma-separated superscript citations:",
                trimmedText,
                "->",
                citationNums
              );
            } else {
              citationNums = [Number.parseInt(trimmedText)];
              matchType = "superscript";
              console.log(
                "[PDFViewer] Found styled superscript citation:",
                trimmedText,
                "->",
                citationNums[0],
                "fontSize:",
                fontSize,
                "verticalAlign:",
                verticalAlign
              );
            }
          } else if (
            !bracketMatch &&
            !superscriptMatch &&
            isStyledSuperscript &&
            digitSeqMatch
          ) {
            citationNums = [Number.parseInt(digitSeqMatch[0])];
            matchType = "superscript";
            console.log(
              "[PDFViewer] Fallback styled superscript citation:",
              digitSeqMatch[0],
              "->",
              citationNums[0],
              "fontSize:",
              fontSize,
              "parentFontSize:",
              parentFontSize
            );
          }

          if (citationNums.length > 0 && matchType) {
            const citationNum = citationNums[0];
            const citation = parsedData.references?.find(
              (ref) => ref.number === citationNum
            );

            if (citation) {
              console.log(
                "[PDFViewer] Matched citation",
                citationNum,
                "to reference:",
                citation.title
              );
              span.style.cursor = "pointer";
              span.style.color = "rgb(59, 130, 246)";
              span.style.textDecoration = "underline";
              span.style.textDecorationStyle = "dotted";
              span.style.textDecorationColor = "rgb(147, 197, 253)";
              span.style.transition = "all 0.2s ease";

              span.setAttribute("data-citation-nums", citationNums.join(","));

              span.onmouseenter = async (e) => {
                console.log("[PDFViewer] Mouse entered citation", citationNum);
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                }

                hoverTimeoutRef.current = setTimeout(async () => {
                  console.log("[PDFViewer] Showing citation popup for", citationNum);
                  const rect = span.getBoundingClientRect();

                  let paperUrl = citation.url || null;
                  let loadingUrl = false;
                  let urlFallback = false;

                  if (!paperUrl && citation.doi) {
                    paperUrl = `https://doi.org/${citation.doi}`;
                  } else if (!paperUrl && citation.arxivId) {
                    paperUrl = `https://arxiv.org/abs/${citation.arxivId}`;
                  }

                  setCitationPopup({
                    citation,
                    position: {
                      x: rect.left + rect.width / 2,
                      y: rect.top - 10,
                    },
                    paperUrl,
                    loadingUrl: !paperUrl,
                    urlFallback: false,
                  });

                  if (!paperUrl) {
                    try {
                      const response = await fetch("/api/references/search", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: citation.title,
                          authors: citation.authors,
                          year: citation.year,
                        }),
                      });

                      if (response.ok) {
                        const data = await response.json();
                        setCitationPopup((prev) =>
                          prev?.citation === citation
                            ? {
                                ...prev,
                                paperUrl: data.url,
                                loadingUrl: false,
                                urlFallback: data.fallback || false,
                              }
                            : prev
                        );
                      } else {
                        setCitationPopup((prev) =>
                          prev?.citation === citation
                            ? { ...prev, loadingUrl: false }
                            : prev
                        );
                      }
                    } catch (error) {
                      console.error("[PDFViewer] Error fetching paper URL:", error);
                      setCitationPopup((prev) =>
                        prev?.citation === citation
                          ? { ...prev, loadingUrl: false }
                          : prev
                      );
                    }
                  }
                }, 500);
              };

              span.onmouseleave = (e) => {
                console.log("[PDFViewer] Mouse left citation", citationNum);
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                  hoverTimeoutRef.current = null;
                }

                setTimeout(() => {
                  if (!popupRef.current?.matches(":hover")) {
                    setCitationPopup(null);
                  }
                }, 200);
              };

              span.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("[PDFViewer] Citation clicked:", citationNum);

                const rect = span.getBoundingClientRect();

                let paperUrl = citation.url || null;

                if (!paperUrl && citation.doi) {
                  paperUrl = `https://doi.org/${citation.doi}`;
                } else if (!paperUrl && citation.arxivId) {
                  paperUrl = `https://arxiv.org/abs/${citation.arxivId}`;
                }

                setCitationPopup({
                  citation,
                  position: {
                    x: rect.left + rect.width / 2,
                    y: rect.top - 10,
                  },
                  paperUrl,
                  loadingUrl: !paperUrl,
                  urlFallback: false,
                });

                if (!paperUrl) {
                  try {
                    const response = await fetch("/api/references/search", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title: citation.title,
                        authors: citation.authors,
                        year: citation.year,
                      }),
                    });

                    if (response.ok) {
                      const data = await response.json();
                      setCitationPopup((prev) =>
                        prev?.citation === citation
                          ? {
                              ...prev,
                              paperUrl: data.url,
                              loadingUrl: false,
                              urlFallback: data.fallback || false,
                            }
                          : prev
                      );
                    } else {
                      setCitationPopup((prev) =>
                        prev?.citation === citation
                          ? { ...prev, loadingUrl: false }
                          : prev
                      );
                    }
                  } catch (error) {
                    console.error("[PDFViewer] Error fetching paper URL:", error);
                    setCitationPopup((prev) =>
                      prev?.citation === citation
                        ? { ...prev, loadingUrl: false }
                        : prev
                    );
                  }
                }
              };
            }
          }
        });
      });
    };

    const observer = new MutationObserver(() => {
      handleTextLayerRendered();
    });

    observer.observe(viewerRef.current, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [parsedData]);

  // Handle click outside citation popup
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (
        citationPopup &&
        !target.closest(".citation-popup") &&
        !target.closest("span[style*='cursor: pointer']")
      ) {
        setCitationPopup(null);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [citationPopup]);

  // Handle citation link clicks from PDF annotations
  const handleCitationLinkClick = (pageNumber: number) => {
    console.log('[PDFViewer] Citation link clicked, jumping to page:', pageNumber);
    const { jumpToPage } = pageNavigationPluginInstance;

    if (pageNumber >= 1 && pageNumber <= numPages) {
      jumpToPage(pageNumber - 1); // Plugin uses 0-based index
    }

    // Scroll smoothly to the page
    if (viewerContainerRef.current) {
      const pageElement = viewerContainerRef.current.querySelector(
        `[data-page-number="${pageNumber}"]`
      ) as HTMLElement;

      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Flash highlight effect after scrolling
        setTimeout(() => {
          pageElement.style.transition = 'background-color 0.3s ease';
          pageElement.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';

          setTimeout(() => {
            pageElement.style.backgroundColor = 'transparent';
          }, 1000);
        }, 500);
      }
    }
  };

  const handleJumpToPageDirect = (page: number) => {
    const { jumpToPage } = pageNavigationPluginInstance;
    if (page >= 1 && page <= numPages) {
      jumpToPage(page - 1); // Plugin uses 0-based index
    }
  };

  // Expose handlers to parent
  useEffect(() => {
    if (onHandlersReady) {
      onHandlersReady({
        handleNextPage: () => {
          const { jumpToNextPage } = pageNavigationPluginInstance;
          if (currentPageRef.current < numPages) jumpToNextPage();
        },
        handlePrevPage: () => {
          const { jumpToPreviousPage } = pageNavigationPluginInstance;
          if (currentPageRef.current > 1) jumpToPreviousPage();
        },
        handleZoomIn,
        handleZoomOut,
        handleResetZoom: () => {
          zoomRef.current = 1;
          zoomTo(1);
          if (zoomLabelRef.current) zoomLabelRef.current.textContent = "100%";
        },
        handleFitWidth: () => {
          const newScale = 1.5;
          zoomRef.current = newScale;
          zoomTo(newScale);
          if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(newScale * 100)}%`;
        },
        handleOpenSearch: () => {
          // Search functionality to be implemented
        },
        jumpToPage: handleJumpToPageDirect,
        focusPageInput: () => {
          // Focus page input to be implemented
        },
      });
    }
  }, [onHandlersReady, numPages]);

  return (
    <div className="pdf-viewer-container flex flex-1 h-full bg-muted/30 min-h-0">
      {/* Sidebar */}
      <div
        className={cn(
          "pdf-sidebar-container relative bg-background border-r border-border transition-all duration-300 ease-in-out flex-shrink-0",
          sidebarOpen ? "w-80" : "w-0 overflow-hidden"
        )}
      >
        {sidebarOpen && (
          <PDFSidebar
            pdfUrl={pdfUrl}
            numPages={numPages}
            bookmarkPluginInstance={bookmarkPluginInstance}
            thumbnailPluginInstance={thumbnailPluginInstance}
            onClose={() => setSidebarOpen(false)}
            onSectionSelect={onSectionSelect}
          />
        )}
      </div>

      {/* Main viewer area */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
          {/* Page + Section Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-7 w-7"
            >
              <Sidebar className="h-4 w-4" />
            </Button>

            <div className="w-px h-4 bg-border mx-1" />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (currentPageRef.current > 1) jumpToPreviousPage()
              }}
              className="h-7 w-7"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span className="font-mono text-sm text-foreground">
              <span ref={pageLabelRef}>1</span>{" "}
              <span className="text-muted-foreground">/ {numPages || "?"}</span>
            </span>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (currentPageRef.current < numPages) jumpToNextPage()
              }}
              className="h-7 w-7"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {selectedSection && (
              <>
                <div className="w-px h-4 bg-border mx-2" />
                <div className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-md">
                  {selectedSection}
                </div>
              </>
            )}
          </div>

          {/* Zoom Controls (no state) */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoomRef.current <= 0.5}
              className="h-7 w-7"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>

            <span
              ref={zoomLabelRef}
              className="min-w-[3rem] text-center font-mono text-sm text-muted-foreground"
            >
              100%
            </span>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoomRef.current >= 2}
              className="h-7 w-7"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>

            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 overflow-hidden p-4 bg-muted/30" ref={viewerRef}>
          {pdfUrl && (
            <div className="h-full mx-auto max-w-4xl" ref={viewerContainerRef}>
              <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                <div className="bg-white shadow-lg rounded-lg overflow-hidden h-full">
                  <Viewer
                    fileUrl={pdfUrl}
                    plugins={[
                      pageNavigationPluginInstance,
                      zoomPluginInstance,
                      thumbnailPluginInstance,
                      bookmarkPluginInstance,
                      citationPluginInstance
                    ]}
                    onDocumentLoad={(e) => {
                      setNumPages(e.doc.numPages)
                      currentPageRef.current = 1
                      zoomRef.current = 1
                      if (pageLabelRef.current) pageLabelRef.current.textContent = "1"
                      if (zoomLabelRef.current) zoomLabelRef.current.textContent = "100%"
                    }}
                    onPageChange={(e) => {
                      const newPage = e.currentPage + 1
                      currentPageRef.current = newPage
                      requestAnimationFrame(() => {
                        if (pageLabelRef.current)
                          pageLabelRef.current.textContent = String(newPage)
                      })
                      if (onPageChange) onPageChange(newPage)
                    }}
                  />
                </div>
              </Worker>
            </div>
          )}
        </div>
      </div>

      {/* Citation Popup */}
      {citationPopup && (
        <div
          ref={popupRef}
          className="citation-popup fixed z-50"
          style={{
            left: `${citationPopup.position.x}px`,
            top: `${citationPopup.position.y}px`,
            transform: "translate(-50%, calc(-100% - 8px))",
          }}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
            }
          }}
          onMouseLeave={() => {
            setTimeout(() => {
              setCitationPopup(null);
            }, 100);
          }}
        >
          <Card className="w-96 border-2 border-primary/20 bg-background p-4 shadow-xl">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {citationPopup.citation.number}
                  </span>
                  <h4 className="text-xs font-semibold text-muted-foreground">
                    Reference
                  </h4>
                </div>
                <button
                  onClick={() => setCitationPopup(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {citationPopup.citation.title && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground leading-snug">
                    {citationPopup.citation.title}
                  </h3>
                </div>
              )}

              {citationPopup.citation.authors && (
                <p className="text-xs text-muted-foreground">
                  {citationPopup.citation.authors}
                </p>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {citationPopup.citation.journal && (
                  <span className="italic">
                    {citationPopup.citation.journal}
                  </span>
                )}
                {citationPopup.citation.year && (
                  <span>({citationPopup.citation.year})</span>
                )}
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                {citationPopup.citation.text}
              </p>

              {/* Link status indicator */}
              {citationPopup.loadingUrl && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Searching for paper link...</span>
                </div>
              )}
              {!citationPopup.loadingUrl && citationPopup.paperUrl && !citationPopup.urlFallback && (
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <LinkIcon className="h-3 w-3" />
                  <span>Direct link available</span>
                </div>
              )}
              {!citationPopup.loadingUrl && citationPopup.paperUrl && citationPopup.urlFallback && (
                <div className="flex items-center gap-2 text-xs text-amber-600">
                  <LinkIcon className="h-3 w-3" />
                  <span>Search link available</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs bg-transparent"
                  onClick={async () => {
                    if (!citationPopup.paperUrl) return;

                    // Validate DOI link before opening
                    if (
                      citationPopup.paperUrl.includes("doi.org") &&
                      !citationPopup.urlFallback
                    ) {
                      console.log(
                        "[PDFViewer] Validating DOI link:",
                        citationPopup.paperUrl
                      );

                      try {
                        const response = await fetch(citationPopup.paperUrl, {
                          method: "HEAD",
                          redirect: "follow",
                        });

                        if (!response.ok) {
                          console.log(
                            "[PDFViewer] DOI link returned",
                            response.status,
                            "- falling back to search"
                          );

                          setCitationPopup((prev) =>
                            prev
                              ? { ...prev, loadingUrl: true, paperUrl: null }
                              : prev
                          );

                          const searchResponse = await fetch(
                            "/api/references/search",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                title: citationPopup.citation.title,
                                authors: citationPopup.citation.authors,
                                year: citationPopup.citation.year,
                              }),
                            }
                          );

                          if (searchResponse.ok) {
                            const data = await searchResponse.json();
                            setCitationPopup((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    paperUrl: data.url,
                                    loadingUrl: false,
                                    urlFallback: data.fallback || false,
                                  }
                                : prev
                            );

                            if (data.url) {
                              window.open(data.url, "_blank");
                            }
                            return;
                          }
                        }
                      } catch (error) {
                        console.error("[PDFViewer] Error validating DOI:", error);
                      }
                    }

                    window.open(citationPopup.paperUrl, "_blank");
                    onCitationClick?.(citationPopup.citation, new MouseEvent('click'));
                    setCitationPopup(null);
                  }}
                  disabled={!citationPopup.paperUrl && !citationPopup.loadingUrl}
                >
                  {citationPopup.loadingUrl ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="mr-1 h-3 w-3" />
                      {citationPopup.urlFallback ? "Search Paper" : "View Full Paper"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* PDF Citation Link Detector - detects internal links in PDF annotations */}
      <PDFCitationLinkDetector
        pdfFile={file}
        viewerContainerRef={viewerContainerRef}
        onCitationClick={handleCitationLinkClick}
      />
    </div>
  );
}
