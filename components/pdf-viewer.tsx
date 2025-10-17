"use client";

import { useState, useEffect, useRef } from "react";
import { Viewer, Worker } from "@react-pdf-viewer/core";
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation";
import { zoomPlugin } from "@react-pdf-viewer/zoom";
import { searchPlugin } from "@react-pdf-viewer/search";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ExternalLink,
  Search,
  X,
  Link as LinkIcon,
  Loader2,
  Monitor,
  ArrowRightToLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/page-navigation/lib/styles/index.css";
import "@react-pdf-viewer/zoom/lib/styles/index.css";
import "@react-pdf-viewer/search/lib/styles/index.css";

interface PDFViewerProps {
  file: File;
  selectedSection?: string | null;
  highlightColor?: string;
  annotationMode?: "highlight" | "erase" | null;
  onCitationClick?: (citation: any) => void;
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

interface CitationPopup {
  citation: any;
  position: { x: number; y: number };
  paperUrl?: string | null;
  loadingUrl?: boolean;
  urlFallback?: boolean;
}

export function PDFViewer({
  file,
  selectedSection,
  highlightColor = "#fef08a",
  annotationMode,
  onCitationClick,
  parsedData,
}: PDFViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [citationPopup, setCitationPopup] = useState<CitationPopup | null>(
    null
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [jumpToPageInput, setJumpToPageInput] = useState("");
  const viewerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const pageNavigationPluginInstance = pageNavigationPlugin();
  const { jumpToPage, jumpToNextPage, jumpToPreviousPage } =
    pageNavigationPluginInstance;

  const zoomPluginInstance = zoomPlugin();
  const { zoomTo } = zoomPluginInstance;

  const searchPluginInstance = searchPlugin();
  const { highlight } = searchPluginInstance;

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  useEffect(() => {
    setCurrentPage(1);
    setNumPages(0);
  }, [file]);

  useEffect(() => {
    if (!viewerRef.current || !parsedData?.references) {
      console.log("[v0] Citation detection skipped:", {
        hasViewerRef: !!viewerRef.current,
        hasReferences: !!parsedData?.references,
        referencesCount: parsedData?.references?.length || 0,
      });
      return;
    }

    console.log(
      "[v0] Setting up citation detection with",
      parsedData.references.length,
      "references"
    );

    const handleTextLayerRendered = () => {
      const textLayers = viewerRef.current?.querySelectorAll(
        ".rpv-core__text-layer"
      );
      console.log("[v0] Found", textLayers?.length || 0, "text layers");

      textLayers?.forEach((layer, layerIndex) => {
        const textSpans = layer.querySelectorAll("span");
        console.log(
          "[v0] Layer",
          layerIndex,
          "has",
          textSpans.length,
          "text spans"
        );

        textSpans.forEach((span, spanIndex) => {
          const text = span.textContent || "";
          const trimmedText = text.trim();

          // Check if this is a styled superscript, hyperlink, or PDF link annotation (common for citations)
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
            span.hasAttribute("data-annotation-type") || // PDF annotation/link
            span.getAttribute("role") === "link"; // PDF link role

          // Check parent elements too (for link styles and font sizing)
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

          // Position-based superscript detection using bounding box analysis
          const isPositionBasedSuperscript = (() => {
            // Only check if the span contains just numbers (potential citation)
            if (!/^\d+$/.test(trimmedText)) return false;

            const rect = span.getBoundingClientRect();
            const spanHeight = rect.height;
            const spanTop = rect.top;

            // Look for adjacent/nearby text spans on the same line to compare vertical position
            const allSpansInLayer = Array.from(textSpans);
            const nearbySpans = allSpansInLayer.filter((otherSpan, otherIndex) => {
              if (otherSpan === span || otherIndex === spanIndex) return false;

              const otherRect = otherSpan.getBoundingClientRect();
              const otherText = (otherSpan.textContent || "").trim();

              // Ignore empty or very short spans
              if (!otherText || otherText.length < 2) return false;

              // Check if on the same horizontal line (within reasonable tolerance)
              const verticalDistance = Math.abs(otherRect.top - spanTop);
              const horizontalDistance = Math.abs(otherRect.left - rect.left);

              // Consider "nearby" if within 50px horizontally and on similar vertical line
              return horizontalDistance < 50 && verticalDistance < spanHeight * 2;
            });

            if (nearbySpans.length === 0) return false;

            // Calculate average baseline of nearby text
            let totalBaseline = 0;
            let validCount = 0;

            nearbySpans.forEach((nearbySpan) => {
              const nearbyRect = nearbySpan.getBoundingClientRect();
              const nearbyFontSize = parseFloat(window.getComputedStyle(nearbySpan).fontSize);

              // Estimate baseline (bottom of text, accounting for descenders)
              const baseline = nearbyRect.bottom;

              // Only count spans with normal-sized text (not other superscripts)
              if (nearbyFontSize >= 10) {
                totalBaseline += baseline;
                validCount++;
              }
            });

            if (validCount === 0) return false;

            const avgBaseline = totalBaseline / validCount;
            const currentBaseline = rect.bottom;

            // If this span's baseline is significantly higher (smaller Y value) than nearby text,
            // it's likely positioned as superscript
            const baselineOffset = avgBaseline - currentBaseline;

            // Consider it superscript if raised by at least 3px (or 25% of its own height)
            const isSuperscript = baselineOffset > Math.max(3, spanHeight * 0.25);

            if (isSuperscript) {
              console.log(
                "[v0] Position-based superscript detected:",
                trimmedText,
                "baselineOffset:",
                baselineOffset,
                "spanHeight:",
                spanHeight
              );
            }

            return isSuperscript;
          })();

          // Consider elements that look like citations: superscript OR links with numeric content
          const isStyledSuperscript =
            verticalAlign === "super" ||
            verticalAlign === "sup" ||
            parentVerticalAlign === "super" ||
            parentVerticalAlign === "sup" ||
            span.closest("sup") !== null ||
            // PDF-specific styling checks
            (fontSize > 0 &&
              (!isNaN(parentFontSize)
                ? fontSize < parentFontSize * 0.8 // More aggressive size comparison for PDFs
                : fontSize < 10)) || // Fallback size check
            // Consider links as potential citations if they contain only numbers
            (isHyperlink && /^\d+$/.test(trimmedText)) ||
            (parentIsLink && /^\d+$/.test(trimmedText)) ||
            // Position-based detection
            isPositionBasedSuperscript;

          // Extract citation numbers from various formats
          const bracketMatch = text.match(/\[(\d+(?:-\d+)?)\]/);
          const superscriptMatch = text.match(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/);
          // For links/superscripts, be more lenient about surrounding text
          const digitSeqMatch = text.match(/\d+/);

          // Consider it a plain number citation if:
          // 1. It's only digits and styled as superscript, or
          // 2. It's a link/annotation that contains digits
          // 3. It's digits with optional comma/punctuation when styled as superscript
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
              "[v0] Found bracket citation:",
              bracketMatch[0],
              "->",
              citationNums[0]
            );
          } else if (superscriptMatch) {
            // Convert superscript Unicode to regular numbers
            const superscriptMap: { [key: string]: string } = {
              "⁰": "0",
              "¹": "1",
              "²": "2",
              "³": "3",
              "⁴": "4",
              "⁵": "5",
              "⁶": "6",
              "⁷": "7",
              "⁸": "8",
              "⁹": "9",
            };
            const normalNum = superscriptMatch[0]
              .split("")
              .map((c) => superscriptMap[c] || c)
              .join("");
            citationNums = [Number.parseInt(normalNum)];
            matchType = "superscript";
            console.log(
              "[v0] Found superscript citation:",
              superscriptMatch[0],
              "->",
              citationNums[0]
            );
          } else if (plainNumberMatch) {
            // Handle regular numbers that are styled as superscripts (e.g., <sup>1</sup> or CSS styled)
            // Check if this contains multiple comma-separated citations like "1,2,3"
            if (/^[\d,\s]+$/.test(trimmedText) && trimmedText.includes(",")) {
              // Parse comma-separated citations
              citationNums = trimmedText
                .split(",")
                .map((n) => n.trim())
                .filter((n) => /^\d+$/.test(n))
                .map((n) => Number.parseInt(n));
              matchType = "superscript";
              console.log(
                "[v0] Found comma-separated superscript citations:",
                trimmedText,
                "->",
                citationNums
              );
            } else {
              citationNums = [Number.parseInt(trimmedText)];
              matchType = "superscript";
              console.log(
                "[v0] Found styled superscript citation:",
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
            // Fallback: span contains normal digits but isn't captured by the other matches
            citationNums = [Number.parseInt(digitSeqMatch[0])];
            matchType = "superscript";
            console.log(
              "[v0] Fallback styled superscript citation:",
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
            // For now, handle the first citation in a comma-separated list
            // In the future, we could create multi-reference popups
            const citationNum = citationNums[0];
            const citation = parsedData.references?.find(
              (ref) => ref.number === citationNum
            );

            if (citation) {
              console.log(
                "[v0] Matched citation",
                citationNum,
                "to reference:",
                citation.title
              );
              span.style.cursor = "pointer";
              span.style.color = "rgb(59, 130, 246)"; // blue-500
              span.style.textDecoration = "underline";
              span.style.textDecorationStyle = "dotted";
              span.style.textDecorationColor = "rgb(147, 197, 253)"; // blue-300
              span.style.transition = "all 0.2s ease";

              // Store all citation numbers for potential future multi-citation support
              span.setAttribute("data-citation-nums", citationNums.join(","));

              span.onmouseenter = async (e) => {
                console.log("[v0] Mouse entered citation", citationNum);
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                }

                hoverTimeoutRef.current = setTimeout(async () => {
                  console.log("[v0] Showing citation popup for", citationNum);
                  const rect = span.getBoundingClientRect();
                  const viewerRect = viewerRef.current?.getBoundingClientRect();

                  // Determine paper URL (with fallback to API search)
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

                  // If no URL found, search via API
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
                      console.error("[v0] Error fetching paper URL:", error);
                      setCitationPopup((prev) =>
                        prev?.citation === citation
                          ? { ...prev, loadingUrl: false }
                          : prev
                      );
                    }
                  }
                }, 500); // 500ms delay before showing popup
              };

              span.onmouseleave = (e) => {
                console.log("[v0] Mouse left citation", citationNum);
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                  hoverTimeoutRef.current = null;
                }

                // Delay hiding to allow moving to popup
                setTimeout(() => {
                  if (!popupRef.current?.matches(":hover")) {
                    setCitationPopup(null);
                  }
                }, 200);
              };

              span.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("[v0] Citation clicked:", citationNum);

                const rect = span.getBoundingClientRect();

                // Determine paper URL (with fallback to API search)
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

                // If no URL found, search via API
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
                    console.error("[v0] Error fetching paper URL:", error);
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

  // Handle search
  useEffect(() => {
    if (searchKeyword) {
      highlight(searchKeyword);
    }
  }, [searchKeyword, highlight]);

  const handlePrevPage = () => {
    jumpToPreviousPage();
  };

  const handleNextPage = () => {
    jumpToNextPage();
  };

  const handleZoomIn = () => {
    const newScale = Math.min(2, scale + 0.1);
    setScale(newScale);
    zoomTo(newScale);
  };

  const handleZoomOut = () => {
    const newScale = Math.max(0.5, scale - 0.1);
    setScale(newScale);
    zoomTo(newScale);
  };

  const handleFitToWidth = () => {
    const newScale = 1.5; // Adjusted for typical fit-to-width
    setScale(newScale);
    zoomTo(newScale);
  };

  const handleFitToPage = () => {
    const newScale = 1.0; // Full page view
    setScale(newScale);
    zoomTo(newScale);
  };

  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPageInput, 10);
    if (pageNum >= 1 && pageNum <= numPages) {
      jumpToPage(pageNum - 1); // Plugin uses 0-based index
      setJumpToPageInput("");
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-muted/30">
      {/* Reading Progress Bar */}
      <div className="h-1 bg-muted/50 relative">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${numPages > 0 ? (currentPage / numPages) * 100 : 0}%` }}
        />
      </div>

      <div className="flex items-center justify-between border-b border-border bg-background px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="h-8 w-8 hover:bg-accent transition-colors"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-foreground">
              {currentPage}
            </span>
            <span className="text-muted-foreground text-sm">/</span>
            <span className="font-mono text-sm text-muted-foreground">
              {numPages || "?"}
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextPage}
            disabled={currentPage === numPages}
            className="h-8 w-8 hover:bg-accent transition-colors"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-border mx-1" />

          {/* Jump to Page Input */}
          <div className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-1.5">
            <Input
              type="number"
              placeholder="Page"
              value={jumpToPageInput}
              onChange={(e) => setJumpToPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleJumpToPage();
                }
              }}
              min={1}
              max={numPages}
              className="h-7 w-16 border-none bg-transparent text-sm font-mono focus-visible:ring-0 focus-visible:ring-offset-0 text-center"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleJumpToPage}
              disabled={!jumpToPageInput || numPages === 0}
              className="h-7 px-2 text-xs"
              title="Jump to page"
            >
              Go
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {searchOpen ? (
            <div className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-1.5 shadow-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search in PDF..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="h-7 w-48 border-none bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchKeyword("");
                }}
                className="h-6 w-6 hover:bg-accent/50 transition-colors"
                title="Close search"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              className="h-8 w-8 hover:bg-accent transition-colors"
              title="Search in PDF"
            >
              <Search className="h-4 w-4" />
            </Button>
          )}

          <div className="h-6 w-px bg-border mx-1" />

          {/* Zoom Controls */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="h-8 w-8 hover:bg-accent transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>

          <span className="min-w-[3.5rem] text-center font-mono text-sm font-medium text-foreground">
            {Math.round(scale * 100)}%
          </span>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            disabled={scale >= 2}
            className="h-8 w-8 hover:bg-accent transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-border mx-1" />

          {/* Zoom Presets */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFitToWidth}
            className="h-8 w-8 hover:bg-accent transition-colors"
            title="Fit to width"
          >
            <ArrowRightToLine className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleFitToPage}
            className="h-8 w-8 hover:bg-accent transition-colors"
            title="Fit to page"
          >
            <Monitor className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-border mx-1" />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-accent transition-colors"
            title="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 bg-muted/30" ref={viewerRef}>
        {pdfUrl && (
          <div className="mx-auto max-w-4xl">
            <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
              <div
                className="bg-white shadow-lg rounded-lg overflow-hidden"
                style={{ height: "calc(100vh - 200px)" }}
              >
                <Viewer
                  fileUrl={pdfUrl}
                  plugins={[
                    pageNavigationPluginInstance,
                    zoomPluginInstance,
                    searchPluginInstance,
                  ]}
                  onDocumentLoad={(e) => {
                    console.log("Document loaded:", e.doc.numPages, "pages");
                    setNumPages(e.doc.numPages);
                    setCurrentPage(1);
                  }}
                  onPageChange={(e) => {
                    console.log("Page changed to:", e.currentPage + 1);
                    setCurrentPage(e.currentPage + 1);
                  }}
                />
              </div>
            </Worker>
          </div>
        )}
      </div>

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
                  ×
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
                        "[v0] Validating DOI link:",
                        citationPopup.paperUrl
                      );

                      try {
                        // Check if DOI resolves (HEAD request to avoid downloading)
                        const response = await fetch(citationPopup.paperUrl, {
                          method: "HEAD",
                          redirect: "follow",
                        });

                        if (!response.ok) {
                          console.log(
                            "[v0] DOI link returned",
                            response.status,
                            "- falling back to search"
                          );

                          // DOI failed, trigger search API
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

                            // Open the fallback URL
                            if (data.url) {
                              window.open(data.url, "_blank");
                            }
                            return;
                          }
                        }
                      } catch (error) {
                        console.error("[v0] Error validating DOI:", error);
                        // Proceed to open anyway on network error
                      }
                    }

                    // Open the URL
                    window.open(citationPopup.paperUrl, "_blank");
                    onCitationClick?.(citationPopup.citation);
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
    </div>
  );
}
