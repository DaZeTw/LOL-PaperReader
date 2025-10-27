"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface CitationTooltipState {
  isVisible: boolean;
  citationId: string;
  citationText: string;
  position: { x: number; y: number };
}

export function useCitationTooltip() {
  const [tooltip, setTooltip] = useState<CitationTooltipState>({
    isVisible: false,
    citationId: "",
    citationText: "",
    position: { x: 0, y: 0 },
  });

  const tooltipRef = useRef<HTMLDivElement>(null);

  const showTooltip = useCallback((
    citationId: string,
    citationText: string,
    event: React.MouseEvent | MouseEvent
  ) => {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const position = {
      x: rect.left + rect.width / 2,
      y: rect.bottom + 10,
    };

    setTooltip({
      isVisible: true,
      citationId,
      citationText,
      position,
    });
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltip(prev => ({
      ...prev,
      isVisible: false,
    }));
  }, []);

  const updatePosition = useCallback((event: React.MouseEvent | MouseEvent) => {
    if (!tooltip.isVisible) return;

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const position = {
      x: rect.left + rect.width / 2,
      y: rect.bottom + 10,
    };

    setTooltip(prev => ({
      ...prev,
      position,
    }));
  }, [tooltip.isVisible]);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        hideTooltip();
      }
    };

    if (tooltip.isVisible) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [tooltip.isVisible, hideTooltip]);

  // Close tooltip on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && tooltip.isVisible) {
        hideTooltip();
      }
    };

    if (tooltip.isVisible) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [tooltip.isVisible, hideTooltip]);

  return {
    tooltip,
    showTooltip,
    hideTooltip,
    updatePosition,
    tooltipRef,
  };
}
