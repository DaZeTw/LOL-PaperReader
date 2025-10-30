# PaperReader API Setup Guide

## Starting the Server

```bash
cd .\backend\src
set OPENAI_API_KEY="sk-..."  
uvicorn paperreader.main:app --reload --host 0.0.0.0 --port 8000
```

## Query Image Directory

Place images in: `\backend\src\paperreader\img_query`

## API Call Examples

### API Call with Single Image

```json
{
  "question": "different of this image and method of this paper",
  "retriever": "hybrid",
  "generator": "openai",
  "image_policy": "auto",
  "top_k": 5,
  "max_tokens": 512,
  "user_images": [
    "./paperreader/img_query/a.png"
  ]
}
```

### API Call with Multiple Images

```json
{
  "question": "different of this image and method of this paper",
  "retriever": "hybrid",
  "generator": "openai", 
  "image_policy": "auto",
  "top_k": 5,
  "max_tokens": 512,
  "user_images": [
    "./paperreader/img_query/a.png",
    "./paperreader/img_query/b.png"
  ]
}
```

### API Call without Images

```json
{
  "question": "different of this image and method of this paper",
  "retriever": "hybrid",
  "generator": "openai", 
  "image_policy": "auto",
  "top_k": 5,
  "max_tokens": 512
}
```

## Visual Embedding Setup

To use visual embeddings:

1. Download the model file from: https://huggingface.co/BAAI/bge-visualized/resolve/main/Visualized_m3.pth?download=true
2. Place it in: `backend\src`

## Troubleshooting

If you encounter library errors, install additional libraries as specified in the instructions at: https://huggingface.co/BAAI/bge-visualized

```bash
pip install <required_library>
```
