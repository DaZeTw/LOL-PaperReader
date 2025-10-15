# Image QA Feature Guide

## Overview

LOL-PaperReader now supports asking questions with attached images! This feature allows users to:
- Upload images along with their questions
- Get AI-powered answers that consider both the uploaded images and retrieved document context
- Use vision-capable models (GPT-4V) to analyze diagrams, charts, figures, and other visual content

## Features

### Two API Endpoints

#### 1. JSON Endpoint: `/api/qa/ask`
Accepts JSON payload with base64-encoded images.

**Use Case**: When you have images already in base64 format or want to send data programmatically.

**Request Example**:
```json
{
  "question": "What architecture is shown in this diagram?",
  "embedder": "bge-small",
  "retriever": "hybrid",
  "generator": "openai",
  "image_policy": "auto",
  "top_k": 5,
  "max_tokens": 512,
  "user_images": [
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgA..."
  ]
}
```

#### 2. Multipart Upload Endpoint: `/api/qa/ask-with-upload`
Accepts multipart/form-data for direct file uploads.

**Use Case**: When uploading files from a web form or using curl with local files.

**Form Fields**:
- `question` (required): The question text
- `embedder` (optional): `openai`, `bge-small`, or `bge-large` (default: `bge-small`)
- `retriever` (optional): `keyword`, `dense`, or `hybrid` (default: `hybrid`)
- `generator` (optional): `openai`, `ollama`, or `extractive` (default: `openai`)
- `image_policy` (optional): `none`, `auto`, or `all` (default: `auto`)
- `top_k` (optional): Number of contexts to retrieve (default: 5)
- `max_tokens` (optional): Maximum tokens in response (default: 512)
- `images` (optional): One or more image files

## Usage Examples

### Python with Requests

#### Example 1: JSON with Base64
```python
import requests
import base64

# Read and encode image
with open("diagram.png", "rb") as f:
    img_data = base64.b64encode(f.read()).decode("ascii")
    data_url = f"data:image/png;base64,{img_data}"

# Send request
response = requests.post(
    "http://localhost:8000/api/qa/ask",
    json={
        "question": "Explain the architecture shown in this diagram",
        "generator": "openai",
        "user_images": [data_url]
    }
)

result = response.json()
print(f"Answer: {result['answer']}")
```

#### Example 2: Multipart File Upload
```python
import requests

# Prepare files
files = [
    ("images", ("diagram.png", open("diagram.png", "rb"), "image/png")),
    ("images", ("chart.jpg", open("chart.jpg", "rb"), "image/jpeg"))
]

# Prepare form data
data = {
    "question": "Compare these two visualizations",
    "generator": "openai",
    "image_policy": "all",
    "top_k": 3
}

# Send request
response = requests.post(
    "http://localhost:8000/api/qa/ask-with-upload",
    data=data,
    files=files
)

result = response.json()
print(f"Answer: {result['answer']}")
```

### cURL Examples

#### Example 1: Multipart Upload
```bash
curl -X POST http://localhost:8000/api/qa/ask-with-upload \
  -F "question=What is shown in this architecture diagram?" \
  -F "generator=openai" \
  -F "image_policy=auto" \
  -F "images=@/path/to/diagram.png" \
  -F "images=@/path/to/chart.jpg"
```

#### Example 2: JSON with Base64
```bash
curl -X POST http://localhost:8000/api/qa/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Describe this figure",
    "generator": "openai",
    "user_images": ["data:image/png;base64,iVBORw0KG..."]
  }'
```

### JavaScript/TypeScript (Fetch API)

#### Example 1: Multipart Upload
```javascript
const formData = new FormData();
formData.append('question', 'What is shown in this diagram?');
formData.append('generator', 'openai');
formData.append('image_policy', 'auto');
formData.append('images', fileInput.files[0]);

const response = await fetch('http://localhost:8000/api/qa/ask-with-upload', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('Answer:', result.answer);
```

#### Example 2: JSON with Base64
```javascript
// Convert file to base64
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const dataUrl = await fileToBase64(fileInput.files[0]);

const response = await fetch('http://localhost:8000/api/qa/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: 'What is shown in this diagram?',
    generator: 'openai',
    user_images: [dataUrl]
  })
});

const result = await response.json();
console.log('Answer:', result.answer);
```

## Configuration Options

### Image Policy

The `image_policy` parameter controls how images are handled:

- **`none`**: Don't pass images to the generator (text-only)
- **`auto`**: Pass images and let the generator score/select relevant ones (default)
- **`all`**: Pass all images and force-include them in the answer

### Environment Variables

You can control image processing via environment variables:

```bash
# Maximum number of images to include (0 = unlimited)
export RAG_GEN_IMAGE_MAX=4

# Minimum relevance score for images (when image_policy=auto)
export RAG_GEN_IMAGE_MIN_SCORE=1.0

# Force include all images without scoring
export RAG_GEN_IMAGE_INCLUDE_ALL=false
```

## How It Works

1. **User uploads images** via either endpoint
2. **Images are converted** to base64 data URLs if needed
3. **RAG retrieval** runs normally to find relevant text contexts
4. **Generator receives**:
   - User-uploaded images (labeled as "User-Provided Images")
   - Retrieved text contexts
   - Retrieved images from PDFs (if available)
5. **Vision model** (GPT-4V) analyzes all content together
6. **Response** includes answer with citations

## Supported Image Formats

- PNG (`.png`)
- JPEG (`.jpg`, `.jpeg`)
- GIF (`.gif`)
- WebP (`.webp`)

## Response Format

```json
{
  "question": "What is shown in this diagram?",
  "answer": "The diagram shows a transformer architecture with...",
  "cited_sections": [
    {
      "doc_id": "paper_123",
      "title": "Attention Is All You Need",
      "page": 3,
      "excerpt": "The Transformer architecture consists of..."
    }
  ],
  "retriever_scores": [
    {"index": 0, "score": 0.92},
    {"index": 1, "score": 0.87}
  ]
}
```

## Limitations

- **Generator Support**: Only `openai` generator (GPT-4V) supports images
  - `ollama` and `extractive` generators ignore user images
- **API Key Required**: You need a valid `OPENAI_API_KEY` in your environment
- **Size Limits**: Large images are base64-encoded, which increases payload size
- **Cost**: Vision API calls are more expensive than text-only

## Best Practices

1. **Optimize image size**: Resize large images before uploading
2. **Use descriptive questions**: "What components are in this architecture?" vs "What is this?"
3. **Combine with retrieval**: The system works best when combining uploaded images with document retrieval
4. **Choose the right policy**:
   - Use `auto` for most cases (intelligent selection)
   - Use `all` when all images are critical
   - Use `none` for text-only analysis

## Troubleshooting

### "Generator doesn't support images"
- Make sure you're using `"generator": "openai"`
- Check that `OPENAI_API_KEY` is set

### "Failed to process user image"
- Verify image format is supported
- Check image file is not corrupted
- Ensure file size is reasonable (<10MB)

### "Answer doesn't reference my image"
- Try `"image_policy": "all"` to force inclusion
- Make your question more specific about the image
- Check that the image is clear and relevant

## Testing

Run the test suite:
```bash
cd backend
python test_image_qa.py
```

Or test manually with curl (see examples above).

## Future Enhancements

Potential improvements for future versions:
- Support for more vision models (Ollama with LLaVA, Claude 3 Vision, etc.)
- Image preprocessing and enhancement
- OCR for text extraction from images
- Image similarity search in retrieval
- Multi-modal embeddings

## Backward Compatibility

The feature is fully backward compatible:
- Existing `/api/qa/ask` requests without `user_images` work as before
- All other parameters remain unchanged
- No breaking changes to the API
