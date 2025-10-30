#!/usr/bin/env python3
"""
Test script to verify pipeline initialization works.
"""

import asyncio
import sys
from pathlib import Path

# Add the paperreader module to the path
sys.path.append(str(Path(__file__).parent))

from paperreader.services.qa.config import PipelineConfig
from paperreader.services.qa.pipeline import QAPipeline

async def test_pipeline_init():
    """Test that the pipeline can be initialized."""
    print("Testing pipeline initialization...")
    
    try:
        # Use default configuration
        config = PipelineConfig()
        config.runs_dir = "./runs"
        
        print(f"Configuration:")
        print(f"  - embedder_name: {config.embedder_name}")
        print(f"  - retriever_name: {config.retriever_name}")
        print(f"  - generator_name: {config.generator_name}")
        print(f"  - image_policy: {config.image_policy}")
        
        print("\nInitializing pipeline...")
        pipeline = QAPipeline(config)
        print("✅ Pipeline initialized successfully!")
        
        return True
        
    except Exception as e:
        print(f"❌ Pipeline initialization failed: {e}")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_pipeline_init())
    sys.exit(0 if success else 1)
