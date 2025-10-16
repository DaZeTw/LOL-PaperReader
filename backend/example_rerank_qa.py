"""
Example script demonstrating the reranking feature in the QA pipeline.

This script shows how to:
1. Use the default reranker (none)
2. Use cross-encoder reranker for improved retrieval
3. Use Cohere reranker (requires COHERE_API_KEY)
"""

import asyncio
from src.paperreader.services.qa.config import PipelineConfig
from src.paperreader.services.qa.pipeline import QAPipeline


async def example_no_rerank():
    """Example without reranking (baseline)."""
    print("\n" + "="*80)
    print("Example 1: No Reranking (Baseline)")
    print("="*80)

    config = PipelineConfig(
        retriever_name="hybrid",
        generator_name="openai",
        reranker_name="none",  # No reranking
        top_k=10,
        max_tokens=512
    )

    pipeline = QAPipeline(config)

    question = "What are the main contributions of this paper?"
    result = await pipeline.answer(question)

    print(f"\nQuestion: {question}")
    print(f"Answer: {result['answer']}\n")
    print(f"Number of citations: {len(result['cited_sections'])}")
    print("\nTop 3 retrieval scores:")
    for i, score_info in enumerate(result['retriever_scores'][:3], 1):
        print(f"  {i}. Score: {score_info['score']:.4f}")


async def example_cross_encoder_rerank():
    """Example with cross-encoder reranking."""
    print("\n" + "="*80)
    print("Example 2: Cross-Encoder Reranking")
    print("="*80)

    config = PipelineConfig(
        retriever_name="hybrid",
        generator_name="openai",
        reranker_name="cross-encoder",  # Use cross-encoder reranking
        reranker_top_k=5,  # Return top 5 after reranking
        top_k=20,  # Retrieve 20 initially, then rerank to 5
        max_tokens=512
    )

    pipeline = QAPipeline(config)

    question = "What are the main contributions of this paper?"
    result = await pipeline.answer(question)

    print(f"\nQuestion: {question}")
    print(f"Answer: {result['answer']}\n")
    print(f"Number of citations: {len(result['cited_sections'])}")
    print("\nTop 3 retrieval scores after reranking:")
    for i, score_info in enumerate(result['retriever_scores'][:3], 1):
        print(f"  {i}. Rerank Score: {score_info['score']:.4f}")


async def example_cohere_rerank():
    """Example with Cohere reranking (requires COHERE_API_KEY)."""
    print("\n" + "="*80)
    print("Example 3: Cohere Reranking")
    print("="*80)

    try:
        config = PipelineConfig(
            retriever_name="hybrid",
            generator_name="openai",
            reranker_name="cohere",  # Use Cohere reranking
            reranker_top_k=5,
            top_k=20,
            max_tokens=512
        )

        pipeline = QAPipeline(config)

        question = "What are the main contributions of this paper?"
        result = await pipeline.answer(question)

        print(f"\nQuestion: {question}")
        print(f"Answer: {result['answer']}\n")
        print(f"Number of citations: {len(result['cited_sections'])}")
        print("\nTop 3 retrieval scores after reranking:")
        for i, score_info in enumerate(result['retriever_scores'][:3], 1):
            print(f"  {i}. Rerank Score: {score_info['score']:.4f}")

    except Exception as e:
        print(f"\nCohere reranking failed: {e}")
        print("Make sure COHERE_API_KEY is set in your environment.")


async def compare_rerankers():
    """Compare different reranker configurations side by side."""
    print("\n" + "="*80)
    print("Example 4: Comparing Rerankers")
    print("="*80)

    question = "What datasets were used in the experiments?"

    configs = [
        ("No Reranking", PipelineConfig(
            retriever_name="hybrid",
            generator_name="openai",
            reranker_name="none",
            top_k=10,
            max_tokens=300
        )),
        ("Cross-Encoder", PipelineConfig(
            retriever_name="hybrid",
            generator_name="openai",
            reranker_name="cross-encoder",
            reranker_top_k=5,
            top_k=20,
            max_tokens=300
        )),
    ]

    for name, config in configs:
        print(f"\n--- {name} ---")
        try:
            pipeline = QAPipeline(config)
            result = await pipeline.answer(question)

            print(f"Answer length: {len(result['answer'])} chars")
            print(f"Citations: {len(result['cited_sections'])}")
            if result['retriever_scores']:
                print(f"Top score: {result['retriever_scores'][0]['score']:.4f}")
            print(f"Answer preview: {result['answer'][:150]}...")
        except Exception as e:
            print(f"Error: {e}")


async def main():
    """Run all examples."""
    print("\n" + "#"*80)
    print("# QA Pipeline Reranking Examples")
    print("#"*80)

    # Run examples
    await example_no_rerank()
    await example_cross_encoder_rerank()
    await example_cohere_rerank()
    await compare_rerankers()

    print("\n" + "#"*80)
    print("# Examples completed!")
    print("#"*80 + "\n")


if __name__ == "__main__":
    # Note: Make sure you have the required dependencies installed:
    # pip install sentence-transformers  # For cross-encoder reranking
    # pip install cohere  # For Cohere reranking

    asyncio.run(main())
