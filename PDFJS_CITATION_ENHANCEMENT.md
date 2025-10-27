# Enhanced Citation Plugin with PDF.js Integration

## What was implemented

The `useCitationPlugin` has been enhanced with PDF.js native annotation filtering as requested. Here are the key improvements:

### 1. PDF.js Annotation Filtering
- **Core Filter Applied**: `ann.subtype === "Link" && typeof ann.dest === "string" && ann.dest.startsWith("cite.")`
- Directly accesses PDF.js annotations for more accurate citation detection
- Processes annotations at the document level using `onDocumentLoad` hook

### 2. Enhanced Interfaces
```typescript
interface PDFAnnotation {
    subtype: string;
    dest: string | any[];
    rect: number[];
    contents?: string;
    id?: string;
}

interface Citation {
    // ...existing properties...
    annotation?: PDFAnnotation; // NEW: Contains PDF.js annotation data
}
```

### 3. Hybrid Detection System
- **DOM-based detection**: Existing method using `querySelectorAll("a[data-annotation-link]")`
- **PDF.js detection**: Direct annotation processing with your specified filter
- **Hybrid matching**: Links DOM elements with corresponding PDF.js annotations

### 4. Enhanced Confidence Scoring
```typescript
function calculateCitationConfidence(
    domElement: HTMLElement | null, 
    pdfAnnotation: PDFAnnotation | null, 
    detectionMethod: "dom" | "pdfjs" | "hybrid"
): number
```

Confidence levels:
- **Hybrid detection** (DOM + PDF.js): 0.9-1.0
- **PDF.js only**: 0.85-0.95  
- **DOM only**: 0.7-0.9

### 5. Visual Citation Indicators
- PDF.js-only detected citations get visual overlays
- Enhanced styling for different citation types
- Position-aware popup placement using annotation rectangles

### 6. Improved Citation Type Detection
```typescript
function detectCitationType(href: string | null, pdfAnnotation?: PDFAnnotation): Citation["type"]
```

Enhanced detection using PDF.js annotation destinations:
- `dest.startsWith("cite.")` → "reference"
- `dest.includes("doi")` → "doi"  
- `dest.startsWith("http")` → "url"

## Key Benefits

1. **Higher Accuracy**: PDF.js filtering ensures only true citation links are processed
2. **Better Performance**: Pre-filtering reduces false positives
3. **Rich Metadata**: Access to PDF.js annotation properties (rect, contents, dest)
4. **Backward Compatibility**: Still works with DOM-only detection as fallback
5. **Confidence Metrics**: Helps prioritize high-quality citations

## Usage Example

```typescript
const citationPlugin = useCitationPlugin({
    onCitationClick: (citation, event) => {
        console.log('Citation confidence:', citation.confidence);
        
        if (citation.annotation) {
            // This citation was detected by PDF.js filtering
            console.log('PDF.js annotation:', citation.annotation.dest);
        }
    }
});
```

## Next Steps

The plugin now supports your PDF.js filtering requirement. You can:

1. **Test** with PDF documents containing citation links
2. **Customize** the `cite.` prefix filtering logic if needed
3. **Extend** the annotation processing for other link types
4. **Integrate** with your existing citation management system

The plugin maintains full backward compatibility while adding the requested PDF.js integration.
