#!/usr/bin/env python3
"""
Runner script for real chat history evaluation tests.
This script runs tests with actual backend services and real image processing.
"""

import asyncio
import sys
import os
from pathlib import Path

def print_banner():
    """Print a nice banner for the test runner"""
    print("=" * 70)
    print("[TEST] REAL CHAT HISTORY EVALUATION TEST RUNNER")
    print("=" * 70)
    print("This script will evaluate chat history functionality with real backend services.")
    print("REQUIRES: MongoDB running, OpenAI API key, and all backend dependencies!")
    print()
    print("Test scenarios include:")
    print("- Reference to previous conversations")
    print("- REAL image comparison with context")
    print("- Summary requests")
    print("- Question recall")
    print("- Topic-specific queries")
    print()
    print("=" * 70)

async def run_real_evaluation():
    """Run the real chat history evaluation"""
    print_banner()
    
    # Set up environment
    os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test_chat_history")
    
    print("[INFO] Checking system requirements...")
    
    try:
        # Try to import required modules
        from test_chat_history_real import RealChatHistoryEvaluator
        print("[OK] Real evaluator imported successfully")
    except ImportError as e:
        print(f"[ERROR] Import error: {e}")
        print("[INFO] Make sure you're running from the backend directory")
        print("[INFO] Run setup first: python setup_real_chat_tests.py")
        return False
    
    try:
        # Test MongoDB connection
        import pymongo
        client = pymongo.MongoClient(os.environ["MONGODB_URL"])
        client.admin.command('ping')
        print("[OK] MongoDB connection successful")
        client.close()
    except Exception as e:
        print(f"[ERROR] MongoDB connection failed: {e}")
        print("[INFO] Make sure MongoDB is running on localhost:27017")
        return False
    
    # Check OpenAI API key
    openai_key = os.environ.get("OPENAI_API_KEY")
    if not openai_key:
        print("[WARNING] OPENAI_API_KEY not found in environment")
        print("[INFO] The generator may not work without this")
        response = input("Continue anyway? (y/n): ")
        if response.lower() != 'y':
            return False
    
    print("\n[START] Starting real evaluation tests...")
    print("-" * 50)
    
    try:
        evaluator = RealChatHistoryEvaluator()
        await evaluator.run_all_tests()
        print("\n[SUCCESS] Real evaluation completed successfully!")
        return True
    except Exception as e:
        print(f"\n[ERROR] Evaluation failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main function"""
    try:
        success = asyncio.run(run_real_evaluation())
        if success:
            print("\n[OK] All tests completed successfully!")
            print("\n[SUMMARY] Summary:")
            print("- Used real backend services")
            print("- Processed real images")
            print("- Generated comprehensive evaluation report")
            print("- Tested all chat history scenarios")
            print("- Check the generated JSON report for detailed results")
            sys.exit(0)
        else:
            print("\n[ERROR] Tests failed. Check the error messages above.")
            print("\n[TROUBLESHOOTING] Common issues:")
            print("- MongoDB not running: Start MongoDB service")
            print("- Missing dependencies: Run 'python setup_real_chat_tests.py'")
            print("- OpenAI API key: Set OPENAI_API_KEY environment variable")
            print("- Image files: Make sure test images exist in img_query folder")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n[STOP] Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
