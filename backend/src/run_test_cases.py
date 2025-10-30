#!/usr/bin/env python3
"""
Test runner script for LOL PaperReader QA system.
Runs test cases from test_case.json and saves results to test_results.json.
"""

import json
import asyncio
import os
import sys
from pathlib import Path
from typing import Dict, List, Any
from datetime import datetime

# Add the paperreader module to the path
sys.path.append(str(Path(__file__).parent))

from paperreader.services.qa.config import PipelineConfig
from paperreader.services.qa.pipeline import QAPipeline


class TestRunner:
    def __init__(self, test_file: str = "test_case.json", output_file: str = "test_results.json"):
        self.test_file = test_file
        self.output_file = output_file
        self.pipeline = None
        
    async def initialize_pipeline(self):
        """Initialize the QA pipeline with default configuration."""
        try:
            # Default configuration - matching your working API setup
            config = PipelineConfig()  # Use default values from config.py
            config.runs_dir = "./runs"  # Override only the runs directory
            
            print("[LOG] Initializing QA pipeline...")
            self.pipeline = QAPipeline(config)
            print("[LOG] QA pipeline initialized successfully.")
            return True
        except Exception as e:
            print(f"[ERROR] Failed to initialize pipeline: {e}")
            print(f"[DEBUG] Error type: {type(e).__name__}")
            import traceback
            print(f"[DEBUG] Full traceback:")
            traceback.print_exc()
            return False
    
    def load_test_cases(self) -> List[Dict[str, Any]]:
        """Load test cases from JSON file."""
        try:
            with open(self.test_file, 'r', encoding='utf-8') as f:
                test_cases = json.load(f)
            print(f"[LOG] Loaded {len(test_cases)} test cases from {self.test_file}")
            return test_cases
        except Exception as e:
            print(f"[ERROR] Failed to load test cases: {e}")
            return []
    
    async def run_single_test(self, test_case: Dict[str, Any]) -> Dict[str, Any]:
        """Run a single test case and return results."""
        test_id = test_case.get("id", "unknown")
        question = test_case.get("question", "")
        images = test_case.get("image", [])
        expected_answer = test_case.get("expected_answer", "")
        
        print(f"\n[LOG] Running test {test_id}: {question[:50]}...")
        
        try:
            # Convert image list to proper format for pipeline
            user_images = []
            if images:
                # Handle image paths - check if they exist in img_query directory
                img_query_dir = Path(__file__).parent / "paperreader" / "img_query"
                for img in images:
                    if img:  # Skip empty strings
                        img_path = img_query_dir / img
                        if img_path.exists():
                            user_images.append(str(img_path))
                            print(f"[LOG] Found image: {img}")
                        else:
                            print(f"[WARNING] Image not found: {img}")
            
            # Run the QA pipeline
            result = await self.pipeline.answer(
                question=question,
                user_images=user_images if user_images else None
            )
            
            # Extract the answer
            actual_answer = result.get("answer", "")
            
            # Calculate basic metrics
            answer_length = len(actual_answer)
            num_citations = len(result.get("cited_sections", []))
            retrieval_scores = result.get("retriever_scores", [])
            avg_retrieval_score = sum(s.get("score", 0) for s in retrieval_scores) / len(retrieval_scores) if retrieval_scores else 0
            
            test_result = {
                "test_id": test_id,
                "question": question,
                "images": images,
                "expected_answer": expected_answer,
                "actual_answer": actual_answer,
                "answer_length": answer_length,
                "num_citations": num_citations,
                "avg_retrieval_score": round(avg_retrieval_score, 4),
                "retrieval_scores": retrieval_scores,
                "cited_sections": result.get("cited_sections", []),
                "status": "success",
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"[LOG] Test {test_id} completed successfully")
            return test_result
            
        except Exception as e:
            print(f"[ERROR] Test {test_id} failed: {e}")
            return {
                "test_id": test_id,
                "question": question,
                "images": images,
                "expected_answer": expected_answer,
                "actual_answer": "",
                "error": str(e),
                "status": "failed",
                "timestamp": datetime.now().isoformat()
            }
    
    async def run_all_tests(self) -> Dict[str, Any]:
        """Run all test cases and return comprehensive results."""
        test_cases = self.load_test_cases()
        if not test_cases:
            return {"error": "No test cases loaded"}
        
        print(f"[LOG] Starting test run with {len(test_cases)} test cases...")
        
        results = []
        successful_tests = 0
        failed_tests = 0
        
        for i, test_case in enumerate(test_cases, 1):
            print(f"\n[LOG] Progress: {i}/{len(test_cases)}")
            result = await self.run_single_test(test_case)
            results.append(result)
            
            if result["status"] == "success":
                successful_tests += 1
            else:
                failed_tests += 1
        
        # Calculate summary statistics
        total_tests = len(test_cases)
        success_rate = (successful_tests / total_tests) * 100 if total_tests > 0 else 0
        
        # Calculate average metrics for successful tests
        successful_results = [r for r in results if r["status"] == "success"]
        avg_answer_length = sum(r["answer_length"] for r in successful_results) / len(successful_results) if successful_results else 0
        avg_citations = sum(r["num_citations"] for r in successful_results) / len(successful_results) if successful_results else 0
        avg_retrieval_score = sum(r["avg_retrieval_score"] for r in successful_results) / len(successful_results) if successful_results else 0
        
        summary = {
            "total_tests": total_tests,
            "successful_tests": successful_tests,
            "failed_tests": failed_tests,
            "success_rate": round(success_rate, 2),
            "avg_answer_length": round(avg_answer_length, 2),
            "avg_citations": round(avg_citations, 2),
            "avg_retrieval_score": round(avg_retrieval_score, 4),
            "test_run_timestamp": datetime.now().isoformat()
        }
        
        return {
            "summary": summary,
            "results": results
        }
    
    def save_results(self, results: Dict[str, Any]):
        """Save test results to JSON file."""
        try:
            with open(self.output_file, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            print(f"[LOG] Results saved to {self.output_file}")
        except Exception as e:
            print(f"[ERROR] Failed to save results: {e}")
    
    async def run(self):
        """Main method to run all tests."""
        print("=" * 60)
        print("LOL PaperReader Test Runner")
        print("=" * 60)
        
        # Initialize pipeline
        if not await self.initialize_pipeline():
            print("[ERROR] Failed to initialize pipeline. Exiting.")
            return
        
        # Run all tests
        results = await self.run_all_tests()
        
        # Save results
        self.save_results(results)
        
        # Print summary
        if "summary" in results:
            summary = results["summary"]
            print("\n" + "=" * 60)
            print("TEST SUMMARY")
            print("=" * 60)
            print(f"Total Tests: {summary['total_tests']}")
            print(f"Successful: {summary['successful_tests']}")
            print(f"Failed: {summary['failed_tests']}")
            print(f"Success Rate: {summary['success_rate']}%")
            print(f"Average Answer Length: {summary['avg_answer_length']}")
            print(f"Average Citations: {summary['avg_citations']}")
            print(f"Average Retrieval Score: {summary['avg_retrieval_score']}")
            print("=" * 60)


async def main():
    """Main entry point."""
    # Check if test_case.json exists
    test_file = "test_case.json"
    if not Path(test_file).exists():
        print(f"[ERROR] Test file {test_file} not found!")
        return
    
    # Create and run test runner
    runner = TestRunner(test_file=test_file, output_file="test_results.json")
    await runner.run()


if __name__ == "__main__":
    # Check for required environment variables
    if not os.getenv("OPENAI_API_KEY"):
        print("[ERROR] OPENAI_API_KEY environment variable not set!")
        print("Please set your OpenAI API key before running tests.")
        sys.exit(1)
    
    # Run the test runner
    asyncio.run(main())
