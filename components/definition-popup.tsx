"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Loader2, ExternalLink, BookOpen } from "lucide-react";

interface DefinitionPopupProps {
  term: string;
  position: { x: number; y: number };
  onClose: () => void;
}

interface DefinitionData {
  term: string;
  definition: string;
  source?: string;
  relatedTerms?: string[];
  loading?: boolean;
}

export function DefinitionPopup({ term, position, onClose }: DefinitionPopupProps) {
  const [definition, setDefinition] = useState<DefinitionData>({
    term,
    definition: "",
    loading: true,
  });
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch definition from API
    const fetchDefinition = async () => {
      try {
        const response = await fetch("/api/definitions/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ term }),
        });

        if (response.ok) {
          const data = await response.json();
          setDefinition({
            term,
            definition: data.definition,
            source: data.source,
            relatedTerms: data.relatedTerms,
            loading: false,
          });
        } else {
          setDefinition({
            term,
            definition: "Definition not found. This term may be domain-specific or a technical jargon.",
            loading: false,
          });
        }
      } catch (error) {
        console.error("[DefinitionPopup] Error fetching definition:", error);
        setDefinition({
          term,
          definition: "Unable to fetch definition at this time.",
          loading: false,
        });
      }
    };

    fetchDefinition();
  }, [term]);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Add small delay to prevent immediate closing from the same click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Adjust popup position to stay within viewport
  const adjustedPosition = { ...position };

  useEffect(() => {
    if (popupRef.current) {
      const rect = popupRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Adjust horizontal position
      if (rect.right > viewportWidth) {
        adjustedPosition.x = viewportWidth - rect.width - 20;
      }
      if (rect.left < 0) {
        adjustedPosition.x = 20;
      }

      // Adjust vertical position
      if (rect.bottom > viewportHeight) {
        adjustedPosition.y = viewportHeight - rect.height - 20;
      }
      if (rect.top < 0) {
        adjustedPosition.y = 20;
      }
    }
  }, []);

  return (
    <div
      ref={popupRef}
      className="definition-popup fixed z-50 animate-in fade-in slide-in-from-top-2 duration-200"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
        maxWidth: "420px",
      }}
    >
      <Card className="border-2 border-primary/20 bg-background shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">
              {term}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {definition.loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Looking up definition...</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-foreground leading-relaxed">
                {definition.definition}
              </p>

              {definition.source && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Source:</span> {definition.source}
                </div>
              )}

              {definition.relatedTerms && definition.relatedTerms.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Related terms:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {definition.relatedTerms.map((relatedTerm) => (
                      <button
                        key={relatedTerm}
                        className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded-md transition-colors"
                      >
                        {relatedTerm}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-border">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs w-full"
                  onClick={() => {
                    const searchUrl = `https://www.google.com/search?q=define+${encodeURIComponent(term)}`;
                    window.open(searchUrl, "_blank");
                  }}
                >
                  <ExternalLink className="mr-1.5 h-3 w-3" />
                  Search more definitions
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
