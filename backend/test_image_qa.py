#!/usr/bin/env python3
"""
Test script for QA with image upload feature.

This demonstrates how to use the new image upload endpoints:
1. /api/qa/ask - JSON endpoint with base64 images
2. /api/qa/ask-with-upload - Multipart form data endpoint

Usage:
    python test_image_qa.py
"""

import requests
import base64
import json
from pathlib import Path


BASE_URL = "http://localhost:8000"


def test_json_endpoint_with_base64():
    """Test the /api/qa/ask endpoint with base64 encoded images."""
    print("\n" + "="*60)
    print("TEST 1: JSON Endpoint with Base64 Images")
    print("="*60)

    # Example: Create a simple test image or use an existing one
    # For this test, you would need an actual image file
    # image_path = Path("test_image.png")
    # if image_path.exists():
    #     with open(image_path, "rb") as f:
    #         img_data = base64.b64encode(f.read()).decode("ascii")
    #         data_url = f"data:image/png;base64,{img_data}"
    # else:
    #     data_url = None

    payload = {
        "question": "What is shown in the image?",
        "embedder": "bge-small",
        "retriever": "hybrid",
        "generator": "openai",
        "image_policy": "auto",
        "top_k": 5,
        "max_tokens": 512,
        # "user_images": [data_url] if data_url else None
        "user_images": None  # Set to None if no test image
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/qa/ask",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        response.raise_for_status()
        result = response.json()

        print(f"\nQuestion: {result['question']}")
        print(f"Answer: {result['answer'][:200]}...")
        print(f"Citations: {len(result['cited_sections'])} sections")
        print("✓ Test passed!")

    except requests.exceptions.RequestException as e:
        print(f"✗ Test failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")


def test_multipart_endpoint():
    """Test the /api/qa/ask-with-upload endpoint with file upload."""
    print("\n" + "="*60)
    print("TEST 2: Multipart Endpoint with File Upload")
    print("="*60)

    # Prepare form data
    data = {
        "question": "What architectural components are shown in this diagram?",
        "embedder": "bge-small",
        "retriever": "hybrid",
        "generator": "openai",
        "image_policy": "auto",
        "top_k": 5,
        "max_tokens": 512
    }

    # Example: Upload actual image files
    # image_path = Path("test_image.png")
    # if image_path.exists():
    #     files = [
    #         ("images", (image_path.name, open(image_path, "rb"), "image/png"))
    #     ]
    # else:
    #     files = None

    files = None  # Set to None if no test image

    try:
        response = requests.post(
            f"{BASE_URL}/api/qa/ask-with-upload",
            data=data,
            files=files
        )
        response.raise_for_status()
        result = response.json()

        print(f"\nQuestion: {result['question']}")
        print(f"Answer: {result['answer'][:200]}...")
        print(f"Citations: {len(result['cited_sections'])} sections")
        print("✓ Test passed!")

    except requests.exceptions.RequestException as e:
        print(f"✗ Test failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")


def test_without_images():
    """Test that the endpoints still work without images (backward compatibility)."""
    print("\n" + "="*60)
    print("TEST 3: Backward Compatibility (No Images)")
    print("="*60)

    payload = {
        "question": "What is the core idea of self-attention?",
        "embedder": "bge-small",
        "retriever": "hybrid",
        "generator": "openai",
        "top_k": 5
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/qa/ask",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        response.raise_for_status()
        result = response.json()

        print(f"\nQuestion: {result['question']}")
        print(f"Answer: {result['answer'][:200]}...")
        print(f"Citations: {len(result['cited_sections'])} sections")
        print("✓ Test passed!")

    except requests.exceptions.RequestException as e:
        print(f"✗ Test failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")


def test_curl_examples():
    """Print curl command examples for manual testing."""
    print("\n" + "="*60)
    print("CURL Examples for Manual Testing")
    print("="*60)

    print("\n1. JSON endpoint with base64 image:")
    print("""
curl -X POST http://localhost:8000/api/qa/ask \\
  -H 'Content-Type: application/json' \\
  -d '{
    "question": "What is shown in this diagram?",
    "embedder": "bge-small",
    "retriever": "hybrid",
    "generator": "openai",
    "image_policy": "auto",
    "top_k": 5,
    "user_images": ["data:image/png;base64,iVBORw0KGgo..."]
  }'
""")

    print("\n2. Multipart endpoint with file upload:")
    print("""
curl -X POST http://localhost:8000/api/qa/ask-with-upload \\
  -F "question=What is shown in this diagram?" \\
  -F "embedder=bge-small" \\
  -F "retriever=hybrid" \\
  -F "generator=openai" \\
  -F "image_policy=auto" \\
  -F "top_k=5" \\
  -F "images=@/path/to/your/image.png" \\
  -F "images=@/path/to/another/image.jpg"
""")

    print("\n3. Without images (backward compatible):")
    print("""
curl -X POST http://localhost:8000/api/qa/ask \\
  -H 'Content-Type: application/json' \\
  -d '{
    "question": "What is the core idea of self-attention?",
    "embedder": "bge-small",
    "retriever": "hybrid",
    "generator": "openai",
    "top_k": 5
  }'
""")


if __name__ == "__main__":
    print("\n" + "="*60)
    print("LOL-PaperReader: Image QA Test Suite")
    print("="*60)
    print("\nMake sure the server is running on http://localhost:8000")
    print("Start server with: uvicorn paperreader.main:app --reload")

    # Run tests
    test_without_images()  # Test backward compatibility first
    test_json_endpoint_with_base64()
    test_multipart_endpoint()
    test_curl_examples()

    print("\n" + "="*60)
    print("Test suite completed!")
    print("="*60 + "\n")
