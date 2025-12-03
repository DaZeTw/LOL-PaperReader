"use client";

import { useState, useRef, useEffect } from "react"
import { highlightPlugin, RenderHighlightTargetProps, HighlightArea } from "@react-pdf-viewer/highlight"
import { MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface Annotation {
  id: number;
  content: string;
  highlightAreas: HighlightArea[];
  quote: string;
  pageIndex: number;
  createdAt: Date;
  color?: string;
}

export function useAnnotation() {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [annotationIdCounter, setAnnotationIdCounter] = useState(1)
  const [renderKey, setRenderKey] = useState(0)
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<number | null>(null) // Add hover state
  
  // Store state in refs for stable access
  const annotationsRef = useRef<Annotation[]>([])
  const annotationIdCounterRef = useRef(1)

  // Update refs when state changes
  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  useEffect(() => {
    annotationIdCounterRef.current = annotationIdCounter
  }, [annotationIdCounter])

  // Force re-render helper
  const forceRerender = () => {
    setRenderKey(prev => prev + 1)
  }

  // Handle deletion for all areas of the same annotation
  const handleDeleteAnnotation = (annotationId: number, currentElement: HTMLElement) => {
    console.log('[useAnnotation] Double-click delete annotation:', annotationId);
    
    // Find all areas of this annotation and fade them out
    const allAreas = document.querySelectorAll(`[data-annotation-id="${annotationId}"]`);
    allAreas.forEach(area => {
      (area as HTMLElement).style.opacity = '0';
    });
    
    // Remove from state after brief delay
    setTimeout(() => {
      setAnnotations(prev => prev.filter(a => a.id !== annotationId));
      setHoveredAnnotationId(null);
      forceRerender();
    }, 150);
  };

  // Handle hover for all areas of the same annotation
  const handleHover = (annotationId: number, isEntering: boolean) => {
    setHoveredAnnotationId(isEntering ? annotationId : null);
    
    // Apply hover effect to all areas of this annotation
    const allAreas = document.querySelectorAll(`[data-annotation-id="${annotationId}"]`);
    allAreas.forEach(area => {
      const element = area as HTMLElement;
      if (isEntering) {
        element.style.background = 'rgba(255, 200, 0, 0.6)';
        element.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      } else {
        element.style.background = 'rgba(255, 255, 0, 0.4)';
        element.style.boxShadow = 'none';
      }
    });
  };

  // Create plugin instance ONCE and never recreate it
  const annotationPluginInstance = useRef(
    highlightPlugin({
      renderHighlightTarget: (props: RenderHighlightTargetProps) => (
        <div
          style={{
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            display: 'flex',
            position: 'absolute',
            left: `${props.selectionRegion.left}%`,
            top: `${props.selectionRegion.top + props.selectionRegion.height}%`,
            transform: 'translate(0, 8px)',
            zIndex: 1000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            padding: '4px',
          }}
        >
          <Button
            size="sm"
            onClick={() => {
              const newAnnotation: Annotation = {
                id: annotationIdCounterRef.current,
                content: `Note for: "${props.selectedText.substring(0, 50)}${props.selectedText.length > 50 ? '...' : ''}"`,
                highlightAreas: props.highlightAreas,
                quote: props.selectedText,
                pageIndex: props.highlightAreas[0]?.pageIndex || 0,
                createdAt: new Date(),
                color: '#ffff00',
              };
              
              // Update state immediately
              setAnnotations(prev => [...prev, newAnnotation]);
              setAnnotationIdCounter(prev => prev + 1);
              
              // Close selection popup
              props.toggle();
              
              // Force re-render to show new annotation
              setTimeout(forceRerender, 0);
              
              console.log('[useAnnotation] Added annotation:', newAnnotation);
            }}
            className="h-7 px-2 text-xs"
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Add Note
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={props.cancel}
            className="h-7 px-2 text-xs ml-1"
          >
            Cancel
          </Button>
        </div>
      ),
      renderHighlights: (props: any) => (
        <div>
          {annotationsRef.current.flatMap(annotation =>
            annotation.highlightAreas
              .filter(area => area.pageIndex === props.pageIndex)
              .map((area, idx) => (
                <div
                  key={`${annotation.id}-${idx}-${renderKey}`}
                  data-annotation-id={annotation.id} // Add data attribute for grouping
                  style={{
                    position: 'absolute',
                    left: `${area.left}%`,
                    top: `${area.top}%`,
                    width: `${area.width}%`,
                    height: `${area.height}%`,
                    background: hoveredAnnotationId === annotation.id 
                      ? 'rgba(255, 200, 0, 0.6)' 
                      : 'rgba(255, 255, 0, 0.4)',
                    borderRadius: 2,
                    pointerEvents: 'auto',
                    zIndex: 9,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: hoveredAnnotationId === annotation.id 
                      ? '0 2px 4px rgba(0,0,0,0.2)' 
                      : 'none',
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    handleDeleteAnnotation(annotation.id, e.currentTarget);
                  }}
                  onMouseEnter={() => {
                    handleHover(annotation.id, true);
                  }}
                  onMouseLeave={() => {
                    handleHover(annotation.id, false);
                  }}
                  title={`Double-click to delete: "${annotation.content}" ${annotation.highlightAreas.length > 1 ? `(${annotation.highlightAreas.length} areas)` : ''}`}
                />
              ))
          )}
        </div>
      ),
    })
  ).current;

  // Simple API functions
  const addAnnotation = (highlightAreas: HighlightArea[], selectedText: string, color = '#ffff00') => {
    const newAnnotation: Annotation = {
      id: annotationIdCounter,
      content: `Note for: "${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}"`,
      highlightAreas,
      quote: selectedText,
      pageIndex: highlightAreas[0]?.pageIndex || 0,
      createdAt: new Date(),
      color,
    };
    
    setAnnotations(prev => [...prev, newAnnotation]);
    setAnnotationIdCounter(prev => prev + 1);
    forceRerender();
    
    return newAnnotation;
  };

  const deleteAnnotation = (annotationId: number) => {
    setAnnotations(prev => prev.filter(a => a.id !== annotationId));
    setHoveredAnnotationId(null);
    forceRerender();
  };

  const clearAllAnnotations = () => {
    setAnnotations([]);
    setAnnotationIdCounter(1);
    setHoveredAnnotationId(null);
    forceRerender();
  };

  const updateAnnotationContent = (annotationId: number, newContent: string) => {
    setAnnotations(prev => prev.map(a => 
      a.id === annotationId ? { ...a, content: newContent } : a
    ));
  };

  const getAnnotationsByPage = (pageIndex: number) => {
    return annotations.filter(annotation => annotation.pageIndex === pageIndex);
  };

  return {
    annotations,
    annotationCount: annotations.length,
    annotationPluginInstance,
    addAnnotation,
    deleteAnnotation,
    updateAnnotationContent,
    clearAllAnnotations,
    getAnnotationsByPage,
  };
}