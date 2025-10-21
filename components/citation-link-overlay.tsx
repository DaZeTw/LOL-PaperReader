"use client"

import { useState } from 'react';
import { CitationLink } from '@/lib/pdf-citation-utils';

interface CitationLinkOverlayProps {
  links: CitationLink[];
  currentPage: number;
  scale: number;
  onHover: (link: CitationLink) => void;
  onHoverEnd: () => void;
  onClick: (link: CitationLink) => void;
}

export function CitationLinkOverlay({
  links,
  currentPage,
  scale,
  onHover,
  onHoverEnd,
  onClick,
}: CitationLinkOverlayProps) {
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null);

  // Filter links for current page only
  const pageLinks = links.filter(link => link.pageNum === currentPage);

  const handleMouseEnter = (link: CitationLink, index: number) => {
    setHoveredLinkIndex(index);
    onHover(link);
  };

  const handleMouseLeave = () => {
    setHoveredLinkIndex(null);
    onHoverEnd();
  };

  const handleClick = (link: CitationLink) => {
    onClick(link);
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {pageLinks.map((link, index) => (
        <div
          key={`citation-${currentPage}-${index}`}
          className={`
            absolute pointer-events-auto cursor-pointer
            transition-all duration-150 ease-in-out
            border-2 rounded-sm
            ${hoveredLinkIndex === index
              ? 'border-blue-500 bg-blue-500/10 shadow-lg'
              : 'border-transparent hover:border-blue-400 hover:bg-blue-400/5'
            }
          `}
          style={{
            left: `${link.bounds.left * scale}px`,
            top: `${link.bounds.top * scale}px`,
            width: `${link.bounds.width * scale}px`,
            height: `${link.bounds.height * scale}px`,
          }}
          onMouseEnter={() => handleMouseEnter(link, index)}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleClick(link)}
          title="Click to jump to reference"
        />
      ))}
    </div>
  );
}
