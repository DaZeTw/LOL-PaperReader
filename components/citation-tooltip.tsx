"use client"

import { useEffect, useRef, useState } from 'react';
import { ReferencePreview } from '@/lib/pdf-citation-utils';

interface CitationTooltipProps {
  reference: ReferencePreview | null;
  position: { x: number; y: number } | null;
  isVisible: boolean;
}

export function CitationTooltip({
  reference,
  position,
  isVisible,
}: CitationTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    if (!position || !tooltipRef.current || !isVisible) {
      setAdjustedPosition(position);
      return;
    }

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let { x, y } = position;

    // Adjust horizontal position if tooltip goes off-screen
    if (x + tooltipRect.width > viewportWidth - 20) {
      x = viewportWidth - tooltipRect.width - 20;
    }
    if (x < 20) {
      x = 20;
    }

    // Adjust vertical position if tooltip goes off-screen
    // Position tooltip above the cursor if it goes below viewport
    if (y + tooltipRect.height > viewportHeight - 20) {
      y = y - tooltipRect.height - 20;
    }
    if (y < 20) {
      y = 20;
    }

    setAdjustedPosition({ x, y });
  }, [position, isVisible]);

  if (!isVisible || !reference || !adjustedPosition) {
    return null;
  }

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 pointer-events-none"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y + 10}px`,
      }}
    >
      <div className="bg-white border-2 border-gray-200 rounded-lg shadow-2xl p-4 max-w-md animate-in fade-in-0 zoom-in-95 duration-200">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-600 mb-1 font-mono">
              Reference • Page {reference.pageNum}
            </div>
            <div className="text-sm text-gray-800 leading-relaxed line-clamp-6">
              {reference.text}
            </div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-600 font-mono">
            Click to jump to reference
          </div>
        </div>
      </div>
    </div>
  );
}
