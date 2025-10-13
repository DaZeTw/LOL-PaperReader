# PDF RAG QA Service

## Quickstart

1. Install deps

```bash
pip install -r backend/rag_app/requirements.txt
```

2. Set environment (optional)

```bash
export OPENAI_API_KEY=sk-...
```

3. Run server

```bash
uvicorn backend.rag_app.main:app --reload --host 0.0.0.0 --port 8000
```

4. Ask a question

```bash
curl -X POST http://localhost:8000/api/qa/ask \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "What is the core idea of self-attention?",
    "embedder": "bge-small",
    "retriever": "hybrid",
    "generator": "extractive",
    "top_k": 5
  }' | jq
```

- Parsed JSON is read from `$RAG_DATA_DIR/*.json` (default `/tmp_data/parsed_pdfs`). If empty, a fallback markdown sample is used.
- Results and benchmarks are stored in `$RAG_RUNS_DIR` (default `/tmp_data/runs`):
  - `last_run_retrieval.json`: latest retrieved contexts
  - `benchmark.json`: structured benchmark results

## Notes
- Embedders: `openai`, `bge-small`, `bge-large`
- Retrievers: `keyword`, `dense`, `hybrid`
- Generators: `openai`, `ollama`, `extractive`
- For local generation, ensure Ollama is running for the chosen model.
