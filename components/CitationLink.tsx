"use client";

import React from "react";
import { useCitationTooltip } from "@/hooks/useCitationTooltip";
import CitationTooltip from "./CitationTooltip";

interface CitationLinkProps {
  citationId: string;
  citationText: string;
  children: React.ReactNode;
  className?: string;
  onMetadataLoad?: (metadata: any) => void;
}

export default function CitationLink({
  citationId,
  citationText,
  children,
  className = "",
  onMetadataLoad,
}: CitationLinkProps) {
  const { tooltip, showTooltip, hideTooltip, updatePosition, tooltipRef } = useCitationTooltip();

  const handleMouseEnter = (event: React.MouseEvent) => {
    showTooltip(citationId, citationText, event);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    updatePosition(event);
  };

  const handleMouseLeave = () => {
    // Small delay to allow moving to tooltip
    setTimeout(() => {
      hideTooltip();
    }, 100);
  };

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    showTooltip(citationId, citationText, event);
  };

  return (
    <>
      <span
        className={`cursor-pointer text-blue-600 hover:text-blue-800 underline decoration-dotted underline-offset-2 transition-colors ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            showTooltip(citationId, citationText, e as any);
          }
        }}
        aria-label={`View details for citation ${citationId}`}
      >
        {children}
      </span>

      {tooltip.isVisible && (
        <div ref={tooltipRef}>
          <CitationTooltip
            citationId={tooltip.citationId}
            citationText={tooltip.citationText}
            position={tooltip.position}
            onClose={hideTooltip}
            onMetadataLoad={onMetadataLoad}
          />
        </div>
      )}
    </>
  );
}
