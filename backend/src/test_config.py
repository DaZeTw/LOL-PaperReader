#!/usr/bin/env python3
"""
Quick test to verify the configuration is working correctly.
"""

import sys
from pathlib import Path

# Add the paperreader module to the path
sys.path.append(str(Path(__file__).parent))

from paperreader.services.qa.config import PipelineConfig

def test_config():
    """Test that the configuration works correctly."""
    print("Testing PipelineConfig...")
    
    # Test default configuration
    config = PipelineConfig()
    print(f"✓ Default embedder_name: {config.embedder_name}")
    print(f"✓ Default retriever_name: {config.retriever_name}")
    print(f"✓ Default generator_name: {config.generator_name}")
    print(f"✓ Default image_policy: {config.image_policy}")
    print(f"✓ Default top_k: {config.top_k}")
    print(f"✓ Default max_tokens: {config.max_tokens}")
    
    # Test that retriever_name is valid
    valid_retrievers = ["dense", "hybrid", "keyword"]
    if config.retriever_name in valid_retrievers:
        print(f"✓ Retriever '{config.retriever_name}' is valid")
    else:
        print(f"✗ Retriever '{config.retriever_name}' is not valid")
        return False
    
    print("\n✅ Configuration test passed!")
    return True

if __name__ == "__main__":
    test_config()
