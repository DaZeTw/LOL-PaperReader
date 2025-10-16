#!/usr/bin/env python3
"""
Simple example demonstrating Image QA usage.

This script shows the most common use cases:
1. Asking a question with a single image
2. Asking a question with multiple images
3. Combining user images with document retrieval

Prerequisites:
- Server running: uvicorn paperreader.main:app --reload
- OPENAI_API_KEY environment variable set
- Sample images in the same directory
"""

import requests
import base64
from pathlib import Path


def example_1_single_image():
    """Example 1: Ask about a single uploaded image."""
    print("\n" + "="*60)
    print("Example 1: Single Image Upload")
    print("="*60)

    # Using multipart upload (easiest for files)
    image_path = "sample_diagram.png"  # Replace with your image

    if not Path(image_path).exists():
        print(f"⚠️  Image not found: {image_path}")
        print("Please provide a sample image to test with.")
        return

    with open(image_path, "rb") as f:
        files = [("images", (image_path, f, "image/png"))]
        data = {
            "question": "What architectural components are shown in this diagram?",
            "generator": "openai",
            "image_policy": "all",  # Include all images
            "top_k": 3
        }

        response = requests.post(
            "http://localhost:8000/api/qa/ask-with-upload",
            data=data,
            files=files
        )

    if response.status_code == 200:
        result = response.json()
        print(f"\n✓ Success!")
        print(f"\nQuestion: {result['question']}")
        print(f"\nAnswer:\n{result['answer']}")
        print(f"\nCitations: {len(result['cited_sections'])} sections cited")
    else:
        print(f"✗ Error: {response.status_code}")
        print(response.text)


def example_2_multiple_images():
    """Example 2: Ask about multiple images at once."""
    print("\n" + "="*60)
    print("Example 2: Multiple Images Upload")
    print("="*60)

    images = ["diagram1.png", "diagram2.png"]  # Replace with your images

    # Check if images exist
    existing_images = [img for img in images if Path(img).exists()]
    if not existing_images:
        print(f"⚠️  No images found: {images}")
        print("Please provide sample images to test with.")
        return

    # Prepare multiple file uploads
    files = []
    for img_path in existing_images:
        with open(img_path, "rb") as f:
            files.append(("images", (img_path, f.read(), "image/png")))

    data = {
        "question": "Compare these two diagrams. What are the main differences?",
        "generator": "openai",
        "image_policy": "all",
        "top_k": 5
    }

    response = requests.post(
        "http://localhost:8000/api/qa/ask-with-upload",
        data=data,
        files=files
    )

    if response.status_code == 200:
        result = response.json()
        print(f"\n✓ Success!")
        print(f"\nQuestion: {result['question']}")
        print(f"\nAnswer:\n{result['answer']}")
        print(f"\nCitations: {len(result['cited_sections'])} sections cited")
    else:
        print(f"✗ Error: {response.status_code}")
        print(response.text)


def example_3_json_with_base64():
    """Example 3: Use JSON endpoint with base64-encoded image."""
    print("\n" + "="*60)
    print("Example 3: JSON Endpoint with Base64")
    print("="*60)

    image_path = "sample_chart.png"  # Replace with your image

    if not Path(image_path).exists():
        print(f"⚠️  Image not found: {image_path}")
        print("Please provide a sample image to test with.")
        return

    # Read and encode image
    with open(image_path, "rb") as f:
        img_data = base64.b64encode(f.read()).decode("ascii")
        data_url = f"data:image/png;base64,{img_data}"

    payload = {
        "question": "What trends are visible in this chart?",
        "generator": "openai",
        "image_policy": "auto",
        "user_images": [data_url],
        "top_k": 5
    }

    response = requests.post(
        "http://localhost:8000/api/qa/ask",
        json=payload,
        headers={"Content-Type": "application/json"}
    )

    if response.status_code == 200:
        result = response.json()
        print(f"\n✓ Success!")
        print(f"\nQuestion: {result['question']}")
        print(f"\nAnswer:\n{result['answer']}")
        print(f"\nCitations: {len(result['cited_sections'])} sections cited")
    else:
        print(f"✗ Error: {response.status_code}")
        print(response.text)


def example_4_no_images():
    """Example 4: Standard QA without images (backward compatibility)."""
    print("\n" + "="*60)
    print("Example 4: Standard QA (No Images)")
    print("="*60)

    payload = {
        "question": "What is a transformer architecture?",
        "generator": "openai",
        "retriever": "hybrid",
        "top_k": 5
    }

    response = requests.post(
        "http://localhost:8000/api/qa/ask",
        json=payload,
        headers={"Content-Type": "application/json"}
    )

    if response.status_code == 200:
        result = response.json()
        print(f"\n✓ Success!")
        print(f"\nQuestion: {result['question']}")
        print(f"\nAnswer:\n{result['answer'][:300]}...")
        print(f"\nCitations: {len(result['cited_sections'])} sections cited")
    else:
        print(f"✗ Error: {response.status_code}")
        print(response.text)


def example_5_image_with_context():
    """Example 5: Image + document context retrieval (most powerful!)."""
    print("\n" + "="*60)
    print("Example 5: Image + Document Context")
    print("="*60)

    image_path = "architecture_diagram.png"  # Replace with your image

    if not Path(image_path).exists():
        print(f"⚠️  Image not found: {image_path}")
        print("This example combines an uploaded diagram with document retrieval.")
        print("Please provide a sample architecture diagram.")
        return

    with open(image_path, "rb") as f:
        files = [("images", (image_path, f, "image/png"))]
        data = {
            "question": (
                "Based on this architecture diagram and relevant papers, "
                "explain how the components work together and cite related research."
            ),
            "generator": "openai",
            "retriever": "hybrid",  # Use retrieval to find relevant papers
            "image_policy": "all",
            "top_k": 5,
            "max_tokens": 1024  # Longer response
        }

        response = requests.post(
            "http://localhost:8000/api/qa/ask-with-upload",
            data=data,
            files=files
        )

    if response.status_code == 200:
        result = response.json()
        print(f"\n✓ Success!")
        print(f"\nQuestion: {result['question']}")
        print(f"\nAnswer:\n{result['answer']}")
        print(f"\nCitations: {len(result['cited_sections'])} sections cited")
        if result['cited_sections']:
            print("\nCited Papers:")
            for cite in result['cited_sections'][:3]:
                print(f"  - {cite.get('title', 'Unknown')} (Page {cite.get('page', '?')})")
    else:
        print(f"✗ Error: {response.status_code}")
        print(response.text)


def main():
    print("\n" + "="*60)
    print("LOL-PaperReader: Image QA Examples")
    print("="*60)
    print("\nThese examples demonstrate the Image QA feature.")
    print("Make sure the server is running on http://localhost:8000")

    # Check server health
    try:
        health = requests.get("http://localhost:8000/health", timeout=2)
        if health.status_code == 200:
            print("✓ Server is running!")
        else:
            print("⚠️  Server returned unexpected status")
            return
    except requests.exceptions.RequestException:
        print("✗ Server is not running!")
        print("Start it with: cd backend/src && uvicorn paperreader.main:app --reload")
        return

    # Run examples
    print("\nRunning examples...\n")

    # Example 4 first (no images required)
    example_4_no_images()

    # Examples with images (will skip if images not found)
    example_1_single_image()
    example_2_multiple_images()
    example_3_json_with_base64()
    example_5_image_with_context()

    print("\n" + "="*60)
    print("Examples completed!")
    print("="*60)
    print("\nFor more details, see: IMAGE_QA_GUIDE.md")
    print("For testing, run: python test_image_qa.py\n")


if __name__ == "__main__":
    main()
