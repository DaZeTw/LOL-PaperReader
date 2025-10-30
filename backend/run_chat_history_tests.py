#!/usr/bin/env python3
"""
Simple runner script for the chat history evaluation tests.
This script provides an easy way to run the evaluation tests with proper setup.
"""

import asyncio
import sys
import os
from pathlib import Path

# Add the src directory to the path
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
sys.path.insert(0, str(src_dir))

# Import the evaluator
from test_chat_history_evaluation import ChatHistoryEvaluator

def print_banner():
    """Print a nice banner for the test runner"""
    print("=" * 70)
    print("🧪 CHAT HISTORY EVALUATION TEST RUNNER")
    print("=" * 70)
    print("This script will evaluate the chat history functionality")
    print("with various question scenarios to test context awareness.")
    print()
    print("Test scenarios include:")
    print("• Reference to previous conversations")
    print("• Image comparison with context")
    print("• Summary requests")
    print("• Question recall")
    print("• Topic-specific queries")
    print()
    print("=" * 70)

async def run_evaluation():
    """Run the chat history evaluation"""
    print_banner()
    
    # Check if required services are available
    print("🔍 Checking system requirements...")
    
    try:
        # Try to import required modules
        from paperreader.services.chat.chat_service import chat_service
        from paperreader.services.chat.chat_embedding_service import chat_embedding_service
        from paperreader.database.mongodb import mongodb
        print("✅ All required modules imported successfully")
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("Make sure you're running this from the backend directory")
        print("and all dependencies are installed.")
        return False
    
    try:
        # Test database connection
        await mongodb.get_collection("test_connection")
        print("✅ Database connection successful")
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        print("Make sure MongoDB is running and accessible.")
        return False
    
    print("\n🚀 Starting evaluation tests...")
    print("-" * 50)
    
    try:
        evaluator = ChatHistoryEvaluator()
        await evaluator.run_all_tests()
        print("\n🎉 Evaluation completed successfully!")
        return True
    except Exception as e:
        print(f"\n❌ Evaluation failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main function"""
    try:
        success = asyncio.run(run_evaluation())
        if success:
            print("\n✅ All tests completed successfully!")
            sys.exit(0)
        else:
            print("\n❌ Tests failed. Check the error messages above.")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n⏹️ Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
