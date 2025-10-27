# PDF.js Server-Side Setup and Troubleshooting

## Issue

When using `pdfjs-dist` in Next.js API routes (server-side), you may encounter this error:

```
Error: Setting up fake worker failed: "Cannot find module './pdf.worker.js'
```

This happens because PDF.js tries to load a web worker file that doesn't exist or isn't properly configured for server-side rendering.

## Solution

### 1. API Route Configuration (`app/api/citations/extract/route.ts`)

Use dynamic import and disable workers:

```typescript
// Dynamic import to avoid worker issues
let getDocument: any;
let GlobalWorkerOptions: any;

async function initPdfJs() {
  if (!getDocument) {
    const pdfjs = await import("pdfjs-dist");
    getDocument = pdfjs.getDocument;
    GlobalWorkerOptions = pdfjs.GlobalWorkerOptions;
    // Disable workers for server-side
    GlobalWorkerOptions.workerSrc = "";
  }
}

export async function POST(request: NextRequest) {
  // Initialize PDF.js
  await initPdfJs();

  // Load PDF with buffer instead of file path
  const buffer = Buffer.from(await file.arrayBuffer());
  const loadingTask = getDocument({
    data: buffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
}
```

### 2. Next.js Webpack Configuration (`next.config.mjs`)

Add server-side PDF.js configuration:

```javascript
webpack: (config, { isServer }) => {
  config.resolve.alias = {
    ...config.resolve.alias,
    canvas: false,
    'pdfjs-dist/build/pdf.mjs': 'pdfjs-dist/build/pdf.js',
  }

  if (isServer) {
    // Disable pdfjs worker loading on server-side
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      'pdfjs-dist/build/pdf.worker.js': false,
      'pdfjs-dist/build/pdf.worker.mjs': false,
    }
  }

  return config
}
```

## Key Points

### ✅ What Works

1. **Dynamic Import**: Use `await import("pdfjs-dist")` instead of static import
2. **Disable Worker**: Set `GlobalWorkerOptions.workerSrc = ""` (empty string)
3. **Use Buffer**: Pass `data: buffer` instead of `url: filePath`
4. **Webpack Config**: Add fallback configuration for server-side
5. **Disable Worker Fetch**: Set `useWorkerFetch: false` in options

### ❌ What Doesn't Work

1. **Static Import**: `import { getDocument } from "pdfjs-dist"` - causes bundling issues
2. **Worker Src Null**: `workerSrc = null` - still tries to load worker
3. **File Path**: `url: "./file.pdf"` - may have path resolution issues on server
4. **Without Init**: Using getDocument without proper initialization

## Testing

After implementing these changes:

1. Start the dev server: `npm run dev`
2. Upload a PDF through the UI
3. Check server logs for extraction success:
   ```
   [extractCitations] Loaded PDF with X pages
   [extractCitations] Extracted Y citations
   ```

## Common Errors and Solutions

### Error: "Cannot find module './pdf.worker.js'"

**Cause**: PDF.js is trying to load a web worker for server-side code.

**Solution**:
- Use dynamic import
- Set `GlobalWorkerOptions.workerSrc = ""`
- Add webpack fallback config

### Error: "Module not found: Can't resolve 'pdfjs-dist/legacy/build/pdf.mjs'"

**Cause**: Import path doesn't exist in the installed package.

**Solution**:
```typescript
// Don't use:
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Use instead:
const pdfjs = await import("pdfjs-dist");
const { getDocument } = pdfjs;
```

### Error: "Failed to load PDF"

**Cause**: File path or buffer issues.

**Solution**: Use buffer instead of file path:
```typescript
const buffer = Buffer.from(await file.arrayBuffer());
const pdf = await getDocument({ data: buffer }).promise;
```

## Environment Differences

### Client-Side (Browser)
- PDF.js uses Web Workers for performance
- Worker file needs to be served via CDN or bundled
- Uses `workerSrc` pointing to worker file URL

### Server-Side (Node.js)
- No Web Workers available
- Worker must be disabled
- Direct PDF processing in main thread
- Set `workerSrc = ""` to disable

## Performance Considerations

### Server-Side Processing
- **Pros**: Secure, no client-side exposure, consistent environment
- **Cons**: Slower for large PDFs, blocks server thread
- **Best for**: Citation extraction, metadata parsing, small-medium PDFs

### Client-Side Processing
- **Pros**: Fast with workers, doesn't block server
- **Cons**: Exposes processing logic, inconsistent browsers
- **Best for**: PDF viewing, rendering, interactive features

## Current Implementation

Our setup uses **server-side processing** for citation extraction:

```
Upload PDF → Server API → PDF.js (no worker) → Extract citations → Return JSON
```

Benefits:
- Secure extraction logic
- Consistent results across all clients
- Can save extraction data to disk for debugging
- No client-side dependencies

## Troubleshooting Checklist

If extraction fails:

- [ ] Check server logs for specific error message
- [ ] Verify PDF file uploads successfully
- [ ] Confirm webpack config includes server-side fallbacks
- [ ] Test with a simple PDF (few pages, clear citations)
- [ ] Check that `GlobalWorkerOptions.workerSrc = ""` is set
- [ ] Verify dynamic import is used, not static
- [ ] Ensure `data: buffer` is passed, not file path
- [ ] Restart dev server after config changes

## Alternative Approaches

If the worker issue persists, consider:

### Option 1: Use a Different PDF Library
```typescript
import * as pdfParse from 'pdf-parse';
// Simpler but less featured
```

### Option 2: External PDF Processing Service
```typescript
// Call external API for PDF processing
await fetch('https://pdf-service.com/extract', { pdf: buffer });
```

### Option 3: Client-Side Extraction
```typescript
// Process PDF in browser, send results to server
// Pros: No server worker issues
// Cons: Slower, exposes logic
```

## Current Status

✅ **Working**: Server starts without errors
✅ **Configuration**: Webpack properly configured
✅ **Worker**: Disabled for server-side
⏳ **Testing**: Upload a PDF to verify extraction works

## Next Steps

1. Upload a test PDF at http://localhost:3000
2. Check `data/citations/` for extracted data
3. Verify no worker errors in console
4. Review extraction quality in JSON files

## Resources

- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
- [Next.js Webpack Config](https://nextjs.org/docs/app/api-reference/next-config-js/webpack)
- [PDF.js GitHub Issues](https://github.com/mozilla/pdf.js/issues)

---

**Last Updated**: 2025-10-27
**Status**: Configured and ready for testing
**Server**: Running on http://localhost:3000
