# Changelog: Image QA Feature Implementation

## Summary

Added support for asking questions with user-uploaded images. The system now accepts images via two endpoints and uses GPT-4V to analyze both uploaded images and retrieved document context together.

## Changes Made

### 1. API Routes (`backend/src/paperreader/api/routes.py`)

**Added:**
- Import for `UploadFile`, `File`, and `Form` from FastAPI
- `user_images` field to `AskRequest` model (optional list of base64 strings)
- New endpoint `/api/qa/ask-with-upload` for multipart file uploads

**Modified:**
- `/api/qa/ask` endpoint now passes `user_images` to pipeline

**New Endpoint Details:**
```python
@router.post("/ask-with-upload")
async def ask_with_upload(
    question: str = Form(...),
    embedder: str = Form("bge-small"),
    retriever: str = Form("hybrid"),
    generator: str = Form("openai"),
    image_policy: str = Form("auto"),
    top_k: int = Form(5),
    max_tokens: int = Form(512),
    images: List[UploadFile] = File(None),
)
```

### 2. QA Pipeline (`backend/src/paperreader/services/qa/pipeline.py`)

**Modified:**
- `answer()` method signature: added `user_images: List[str] = None` parameter
- Generator call: now passes `user_images` to generator

**Changes:**
```python
# Before
async def answer(self, question: str) -> Dict[str, Any]:
    ...
    answer = self.generator.generate(question, contexts, max_tokens=...)

# After
async def answer(self, question: str, user_images: List[str] = None) -> Dict[str, Any]:
    ...
    answer = self.generator.generate(question, contexts, max_tokens=..., user_images=user_images)
```

### 3. Generators (`backend/src/paperreader/services/qa/generators.py`)

**Modified:**
- `Generator` abstract class: added `user_images` parameter to `generate()` method
- `OpenAIGenerator.generate()`:
  - Added `user_images` parameter
  - Updated text-only check to consider user images
  - Added logic to prepend user-uploaded images in multimodal messages
  - User images are labeled as "User-Provided Images" and displayed first
- `OllamaGenerator.generate()`: added `user_images` parameter (ignored, text-only)
- `ExtractiveGenerator.generate()`: added `user_images` parameter (ignored, text-only)

**Key Implementation:**
```python
# Add user-uploaded images first if provided
if user_images:
    user_content.append({"type": "text", "text": "\n[User-Provided Images]"})
    for idx, img_data in enumerate(user_images):
        user_content.append({"type": "text", "text": f"User Image {idx+1}:"})
        if img_data.startswith("data:"):
            user_content.append({"type": "image_url", "image_url": {"url": img_data}})
        else:
            try:
                data_url = to_data_url(img_data)
                user_content.append({"type": "image_url", "image_url": {"url": data_url}})
            except Exception as e:
                print(f"[WARNING] Failed to process user image {idx+1}: {e}")
```

### 4. Documentation

**Created:**
- `backend/IMAGE_QA_GUIDE.md`: Comprehensive guide with examples in Python, curl, and JavaScript
- `backend/test_image_qa.py`: Test script with multiple test cases and curl examples
- `backend/CHANGELOG_IMAGE_QA.md`: This file

**Updated:**
- `backend/README.md`: Added image QA feature to quickstart and configuration sections

## API Usage

### Option 1: JSON with Base64 (existing endpoint)
```bash
curl -X POST http://localhost:8000/api/qa/ask \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "What is shown in this diagram?",
    "generator": "openai",
    "user_images": ["data:image/png;base64,iVBORw0..."]
  }'
```

### Option 2: Multipart File Upload (new endpoint)
```bash
curl -X POST http://localhost:8000/api/qa/ask-with-upload \
  -F "question=What is shown in this diagram?" \
  -F "generator=openai" \
  -F "images=@diagram.png" \
  -F "images=@chart.jpg"
```

## How It Works

1. User uploads images via either endpoint
2. Images are converted to base64 data URLs (if not already)
3. RAG retrieval runs normally to get relevant text contexts
4. Generator receives:
   - User-uploaded images (first, labeled "User-Provided Images")
   - Retrieved text contexts
   - Retrieved images from PDFs (if available)
5. GPT-4V analyzes all content together
6. Response includes answer with citations

## Configuration

### Image Policy Options
- `none`: Text-only, ignore all images
- `auto`: Intelligent image selection based on relevance (default)
- `all`: Include all images without filtering

### Environment Variables
```bash
RAG_GEN_IMAGE_MAX=4              # Max images to include (0=unlimited)
RAG_GEN_IMAGE_MIN_SCORE=1.0      # Min relevance score (auto mode)
RAG_GEN_IMAGE_INCLUDE_ALL=false  # Force-include all images
```

## Requirements

- **Generator**: Must use `openai` generator (GPT-4V)
  - `ollama` and `extractive` generators ignore user images
- **API Key**: Valid `OPENAI_API_KEY` required
- **Image Formats**: PNG, JPEG, GIF, WebP

## Backward Compatibility

✅ **Fully backward compatible**
- Existing API calls without images work unchanged
- All parameters remain optional
- Default behavior is identical to previous version

## Testing

Run the test suite:
```bash
cd backend
python test_image_qa.py
```

Tests include:
1. JSON endpoint with base64 images
2. Multipart endpoint with file uploads
3. Backward compatibility (no images)
4. Curl command examples

## Files Modified

```
backend/
├── src/paperreader/
│   ├── api/
│   │   └── routes.py                    [MODIFIED]
│   └── services/qa/
│       ├── pipeline.py                   [MODIFIED]
│       └── generators.py                 [MODIFIED]
├── README.md                             [MODIFIED]
├── IMAGE_QA_GUIDE.md                     [NEW]
├── test_image_qa.py                      [NEW]
└── CHANGELOG_IMAGE_QA.md                 [NEW]
```

## Example Use Cases

1. **Diagram Analysis**: Upload architecture diagrams and ask about components
2. **Chart Interpretation**: Upload charts/graphs and ask for insights
3. **Figure Comparison**: Upload multiple figures and ask for comparisons
4. **Visual + Text QA**: Combine uploaded images with PDF retrieval for comprehensive answers
5. **Multimodal Research**: Ask questions about visual content in research papers

## Future Enhancements

Potential improvements:
- [ ] Support for more vision models (Claude 3, Ollama LLaVA)
- [ ] Image preprocessing and enhancement
- [ ] OCR integration for text extraction
- [ ] Image similarity search in retrieval
- [ ] Multi-modal embeddings
- [ ] Image resizing/optimization before upload
- [ ] Caching of processed images

## Notes

- Vision API calls are more expensive than text-only
- Large images increase payload size due to base64 encoding
- For optimal performance, resize images before uploading
- The system maintains a history of processed images for debugging

## Version

- **Feature**: Image QA Support
- **Date**: 2025-10-15
- **Status**: Production Ready
