"use client"

import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { CitationTooltip } from './citation-tooltip';
import {
  CitationLink,
  ReferencePreview,
  getReferenceAtDestination,
  getPageNumberFromDestination,
} from '@/lib/pdf-citation-utils';

interface PDFCitationLinkDetectorProps {
  pdfFile: File | null;
  viewerContainerRef: React.RefObject<HTMLDivElement>;
  onCitationClick?: (pageNumber: number) => void;
}

/**
 * Component that detects citation links in the PDF annotation layer
 * and shows hover tooltips with reference previews
 */
export function PDFCitationLinkDetector({
  pdfFile,
  viewerContainerRef,
  onCitationClick,
}: PDFCitationLinkDetectorProps) {
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [hoveredReference, setHoveredReference] = useState<ReferencePreview | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupFunctionsRef = useRef<Array<() => void>>([]);

  // Load PDF document
  useEffect(() => {
    if (!pdfFile) {
      setPdfDocument(null);
      return;
    }

    const loadPDF = async () => {
      try {
        const url = URL.createObjectURL(pdfFile);
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        setPdfDocument(pdf);

        // Clean up blob URL
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('[PDFCitationLinkDetector] Error loading PDF:', error);
      }
    };

    loadPDF();
  }, [pdfFile]);

  // Set up citation link detection
  useEffect(() => {
    if (!pdfDocument || !viewerContainerRef.current) {
      return;
    }

    console.log('[PDFCitationLinkDetector] Setting up citation link detection');

    const setupLinkDetection = () => {
      // Clean up previous event listeners
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];

      // Find all annotation layer links in the react-pdf-viewer
      const annotationLayers = viewerContainerRef.current?.querySelectorAll(
        '.rpv-core__annotation-layer'
      );

      if (!annotationLayers || annotationLayers.length === 0) {
        console.log('[PDFCitationLinkDetector] No annotation layers found yet, will retry');
        return;
      }

      console.log('[PDFCitationLinkDetector] Found', annotationLayers.length, 'annotation layers');

      annotationLayers.forEach((layer, layerIndex) => {
        const links = layer.querySelectorAll('a[data-internal-link]');

        console.log('[PDFCitationLinkDetector] Layer', layerIndex, 'has', links.length, 'internal links');

        links.forEach((link) => {
          const anchor = link as HTMLAnchorElement;

          // Extract destination from the link's href or data attribute
          const href = anchor.getAttribute('href') || '';
          const dest = anchor.getAttribute('data-destination');

          // Only process internal links (those that point to destinations within the PDF)
          if (!dest && !href.startsWith('#')) {
            return;
          }

          // Style the link to indicate it's interactive
          anchor.style.cursor = 'pointer';
          anchor.style.transition = 'all 0.2s ease';

          // Add hover handlers
          const handleMouseEnter = async (e: MouseEvent) => {
            const target = e.currentTarget as HTMLElement;
            const rect = target.getBoundingClientRect();

            // Clear any existing timeout
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
            }

            // Set tooltip position
            setTooltipPosition({
              x: rect.left + rect.width / 2,
              y: rect.top,
            });

            // Delay showing tooltip
            hoverTimeoutRef.current = setTimeout(async () => {
              try {
                // Get the destination from the link
                const destination = dest || href.substring(1); // Remove '#' from href

                // Fetch reference preview
                const reference = await getReferenceAtDestination(
                  pdfDocument,
                  destination
                );

                if (reference) {
                  setHoveredReference(reference);
                  setIsTooltipVisible(true);
                }
              } catch (error) {
                console.error('[PDFCitationLinkDetector] Error getting reference:', error);
              }
            }, 300);
          };

          const handleMouseLeave = () => {
            // Clear timeout if hovering stopped before tooltip appears
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = null;
            }

            // Hide tooltip with a small delay to allow moving to tooltip
            setTimeout(() => {
              setIsTooltipVisible(false);
              setHoveredReference(null);
              setTooltipPosition(null);
            }, 200);
          };

          const handleClick = async (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            try {
              const destination = dest || href.substring(1);

              // Get page number from destination
              const pageNumber = await getPageNumberFromDestination(
                pdfDocument,
                destination
              );

              if (pageNumber && onCitationClick) {
                onCitationClick(pageNumber);
              }

              // Hide tooltip
              setIsTooltipVisible(false);
              setHoveredReference(null);
              setTooltipPosition(null);
            } catch (error) {
              console.error('[PDFCitationLinkDetector] Error handling click:', error);
            }
          };

          // Add event listeners
          anchor.addEventListener('mouseenter', handleMouseEnter);
          anchor.addEventListener('mouseleave', handleMouseLeave);
          anchor.addEventListener('click', handleClick);

          // Store cleanup function
          cleanupFunctionsRef.current.push(() => {
            anchor.removeEventListener('mouseenter', handleMouseEnter);
            anchor.removeEventListener('mouseleave', handleMouseLeave);
            anchor.removeEventListener('click', handleClick);
          });
        });
      });
    };

    // Run setup initially
    setupLinkDetection();

    // Watch for DOM changes (new pages loading)
    const observer = new MutationObserver(() => {
      setupLinkDetection();
    });

    observer.observe(viewerContainerRef.current, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();

      // Clean up all event listeners
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];

      // Clear timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [pdfDocument, viewerContainerRef, onCitationClick]);

  return (
    <CitationTooltip
      reference={hoveredReference}
      position={tooltipPosition}
      isVisible={isTooltipVisible}
    />
  );
}
