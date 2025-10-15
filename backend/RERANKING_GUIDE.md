# QA Pipeline Reranking Guide

This guide explains how to use the reranking feature in the QA pipeline to improve retrieval quality.

## Overview

Reranking is a technique that improves search quality by re-scoring and re-ordering retrieved documents using more sophisticated models. The QA pipeline now supports reranking as an optional post-retrieval step.

### Why Use Reranking?

- **Better Relevance**: Cross-encoder models directly compare query-document pairs for more accurate relevance scoring
- **Improved Accuracy**: Reranking can significantly improve answer quality by ensuring the most relevant context is used
- **Flexible Configuration**: Choose between different reranking strategies based on your needs

## Architecture

The reranking flow works as follows:

```
Question → Retriever → [Initial Top-K Results] → Reranker → [Reranked Top-N Results] → Generator → Answer
```

1. **Initial Retrieval**: The retriever fetches `top_k` documents (e.g., 20)
2. **Reranking**: The reranker re-scores these documents and returns the top `reranker_top_k` (e.g., 5)
3. **Generation**: The generator uses only the reranked results to produce the answer

## Available Rerankers

### 1. No Reranking (Default)

Pass-through reranker that returns results unchanged.

```python
from src.paperreader.services.qa.config import PipelineConfig
from src.paperreader.services.qa.pipeline import QAPipeline

config = PipelineConfig(
    reranker_name="none",
    top_k=5
)
pipeline = QAPipeline(config)
```

### 2. Cross-Encoder Reranker

Uses a cross-encoder transformer model to re-score query-document pairs. More accurate than bi-encoder similarity.

**Features:**
- Offline (no API calls required)
- Runs on GPU if available
- Default model: `cross-encoder/ms-marco-MiniLM-L-6-v2`

**Installation:**
```bash
pip install sentence-transformers
```

**Usage:**
```python
config = PipelineConfig(
    reranker_name="cross-encoder",
    reranker_top_k=5,  # Return top 5 after reranking
    top_k=20,           # Retrieve 20 initially
)
pipeline = QAPipeline(config)
```

**Performance:**
- Fast inference (~10-50ms per document on GPU)
- Good balance between quality and speed
- Recommended for production use

### 3. Cohere Reranker

Uses Cohere's rerank API for state-of-the-art reranking quality.

**Features:**
- Highest quality reranking
- Requires API key
- Cloud-based (requires internet connection)

**Installation:**
```bash
pip install cohere
```

**Setup:**
```bash
export COHERE_API_KEY="your-api-key"
```

**Usage:**
```python
config = PipelineConfig(
    reranker_name="cohere",
    reranker_top_k=5,
    top_k=20,
)
pipeline = QAPipeline(config)
```

## Configuration Parameters

### PipelineConfig Reranking Options

```python
@dataclass
class PipelineConfig:
    # Reranker type: "none", "cross-encoder", "cohere"
    reranker_name: Literal["none", "cross-encoder", "cohere"] = "none"

    # Number of results to return after reranking
    reranker_top_k: int = 5

    # Initial retrieval size (retrieve more, then rerank to fewer)
    top_k: int = 10
```

### Key Parameters Explained

- **`reranker_name`**: Which reranker to use
  - `"none"`: No reranking (default)
  - `"cross-encoder"`: Use cross-encoder model
  - `"cohere"`: Use Cohere API

- **`top_k`**: How many documents to retrieve initially
  - Increase this when using reranking (e.g., 20-50)
  - The reranker will see more candidates to choose from

- **`reranker_top_k`**: How many documents to keep after reranking
  - Typically smaller than `top_k` (e.g., 5-10)
  - These are passed to the generator

## Usage Examples

### Basic Usage

```python
import asyncio
from src.paperreader.services.qa.config import PipelineConfig
from src.paperreader.services.qa.pipeline import QAPipeline

async def main():
    # Configure pipeline with reranking
    config = PipelineConfig(
        retriever_name="hybrid",
        generator_name="openai",
        reranker_name="cross-encoder",
        reranker_top_k=5,
        top_k=20
    )

    pipeline = QAPipeline(config)

    # Ask a question
    result = await pipeline.answer("What are the main contributions?")

    print(f"Answer: {result['answer']}")
    print(f"Citations: {len(result['cited_sections'])}")

asyncio.run(main())
```

### Comparing Rerankers

```python
async def compare_rerankers(question: str):
    configs = {
        "No Reranking": PipelineConfig(reranker_name="none", top_k=5),
        "Cross-Encoder": PipelineConfig(
            reranker_name="cross-encoder",
            reranker_top_k=5,
            top_k=20
        ),
    }

    for name, config in configs.items():
        pipeline = QAPipeline(config)
        result = await pipeline.answer(question)

        print(f"\n--- {name} ---")
        print(f"Answer: {result['answer'][:200]}...")
        print(f"Top score: {result['retriever_scores'][0]['score']:.4f}")
```

### Environment Variables

You can override reranker settings via environment variables:

```bash
# For Cohere
export COHERE_API_KEY="your-api-key"
```

## Performance Considerations

### Retrieval Size Trade-offs

| Scenario | top_k | reranker_top_k | Notes |
|----------|-------|----------------|-------|
| No reranking | 5 | N/A | Fast, baseline quality |
| Light reranking | 10 | 5 | Slight quality boost |
| Standard reranking | 20 | 5 | Good balance |
| Heavy reranking | 50 | 10 | Best quality, slower |

### Latency Impact

- **No reranking**: ~100-200ms (retrieval only)
- **Cross-encoder**: +50-200ms (depends on GPU and top_k)
- **Cohere**: +200-500ms (API call latency)

### Recommendations

1. **Development/Testing**: Use `cross-encoder` for fast iteration
2. **Production (Quality-focused)**: Use `cross-encoder` with top_k=20-30
3. **Production (Speed-focused)**: Use `none` or light reranking (top_k=10)
4. **Best Quality**: Use `cohere` if budget allows

## API Integration

### Using in Routes

The reranking is automatically applied when configured. Update your route handler:

```python
# In routes.py
@qa_router.post("/ask")
async def ask_question(request: QuestionRequest):
    # Pipeline already configured with reranking
    result = await qa_pipeline.answer(request.question)
    return result
```

### Response Format

The response includes reranking information:

```json
{
  "question": "What are the main contributions?",
  "answer": "The main contributions are...",
  "cited_sections": [...],
  "retriever_scores": [
    {
      "index": 42,
      "score": 8.234,  // Reranked score if reranking is enabled
      "original_score": 0.856  // Original retrieval score (if reranked)
    }
  ]
}
```

## Troubleshooting

### Cross-Encoder Issues

**Problem**: "sentence-transformers not found"
```bash
pip install sentence-transformers torch
```

**Problem**: Slow inference
- Check if CUDA is available: `torch.cuda.is_available()`
- Install GPU version of PyTorch if needed

### Cohere Issues

**Problem**: "COHERE_API_KEY not set"
```bash
export COHERE_API_KEY="your-key"
```

**Problem**: Rate limiting
- Reduce request frequency
- Consider upgrading Cohere plan
- Use cross-encoder as fallback

### General Issues

**Problem**: No quality improvement
- Increase `top_k` (retrieve more candidates)
- Try different reranker models
- Check if retrieved documents contain relevant information

**Problem**: Out of memory
- Reduce `top_k`
- Use smaller cross-encoder model
- Enable batch processing (future enhancement)

## Advanced Usage

### Custom Cross-Encoder Models

You can use different cross-encoder models by modifying `rerankers.py`:

```python
# Available models:
# - cross-encoder/ms-marco-MiniLM-L-6-v2 (default, fast)
# - cross-encoder/ms-marco-MiniLM-L-12-v2 (better quality)
# - cross-encoder/ms-marco-TinyBERT-L-2-v2 (fastest)

from src.paperreader.services.qa.rerankers import CrossEncoderReranker

reranker = CrossEncoderReranker(
    model_name="cross-encoder/ms-marco-MiniLM-L-12-v2"
)
```

### Hybrid Approach

Combine multiple reranking strategies:

```python
# First pass: Fast cross-encoder
config1 = PipelineConfig(
    reranker_name="cross-encoder",
    top_k=50,
    reranker_top_k=10
)

# Second pass: High-quality Cohere
# (requires custom implementation)
```

## References

- [Sentence Transformers Cross-Encoders](https://www.sbert.net/examples/applications/cross-encoder/README.html)
- [Cohere Rerank API](https://docs.cohere.com/reference/rerank)
- [MS MARCO Models](https://github.com/microsoft/MSMARCO-Passage-Ranking)

## Next Steps

- Check out `example_rerank_qa.py` for working examples
- Experiment with different `top_k` and `reranker_top_k` values
- Monitor quality improvements in your specific use case
- Consider A/B testing different configurations
