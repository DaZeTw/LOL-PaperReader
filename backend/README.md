# PDF RAG QA Service

## Quickstart

1. Install deps

```bash
pip install -r backend/requirements.txt
```

2. Set environment (required for OpenAI)

```bash
export OPENAI_API_KEY=sk-...
```

3. Run server

```bash
cd backend/src
uvicorn paperreader.main:app --reload --host 0.0.0.0 --port 8000
```

4. Ask a question

```bash
curl -X POST http://localhost:8000/api/qa/ask \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "What is the core idea of self-attention?",
    "embedder": "bge-small",
    "retriever": "hybrid",
    "generator": "openai",
    "top_k": 5
  }' | jq
```

5. Ask a question with images (NEW!)

```bash
curl -X POST http://localhost:8000/api/qa/ask-with-upload \
  -F "question=What architecture is shown in this diagram?" \
  -F "generator=openai" \
  -F "images=@/path/to/your/diagram.png"
```

- Parsed JSON is read from `$RAG_DATA_DIR/*.json` (default `/tmp_data/parsed_pdfs`). If empty, a fallback markdown sample is used.
- Results and benchmarks are stored in `$RAG_RUNS_DIR` (default `/tmp_data/runs`):
  - `last_run_retrieval.json`: latest retrieved contexts
  - `benchmark.json`: structured benchmark results

## Features

### Image QA Support (NEW!)
Ask questions with attached images! The system now supports:
- Upload images via multipart/form-data or base64 JSON
- Vision-capable AI (GPT-4V) analyzes images along with document context
- Two endpoints: `/api/qa/ask` (JSON) and `/api/qa/ask-with-upload` (multipart)
- See [IMAGE_QA_GUIDE.md](IMAGE_QA_GUIDE.md) for detailed usage examples

## Configuration

### Embedders
- `openai`: OpenAI's text-embedding-ada-002
- `bge-small`: BAAI/bge-small-en-v1.5 (default)
- `bge-large`: BAAI/bge-large-en-v1.5

### Retrievers
- `keyword`: BM25 keyword search
- `dense`: Dense vector search
- `hybrid`: Combines keyword + dense (default)

### Generators
- `openai`: GPT-4o-mini (supports images!)
- `ollama`: Local LLM via Ollama (text-only)
- `extractive`: Extractive QA (text-only)

### Image Policy
- `none`: Don't include images in generation
- `auto`: Intelligently select relevant images (default)
- `all`: Include all available images

### Rerankers (NEW!)
Improve retrieval quality by re-scoring documents after initial retrieval:
- `none`: No reranking (default)
- `cross-encoder`: Use cross-encoder transformer model for better relevance scoring
- `cohere`: Use Cohere's state-of-the-art rerank API

**Example with reranking:**
```bash
curl -X POST http://localhost:8000/api/qa/ask \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "What is the core idea of self-attention?",
    "retriever": "hybrid",
    "generator": "openai",
    "reranker": "cross-encoder",
    "top_k": 20,
    "reranker_top_k": 5
  }' | jq
```

See [RERANKING_GUIDE.md](RERANKING_GUIDE.md) for detailed documentation.

## Notes
- For local generation with Ollama, ensure Ollama is running
- Image QA requires `OPENAI_API_KEY` and `generator=openai`
- Supported image formats: PNG, JPEG, GIF, WebP
