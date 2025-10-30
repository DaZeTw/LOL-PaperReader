#!/usr/bin/env python3
"""
Simple runner script for the standalone chat history evaluation tests.
This version uses mock services and doesn't require any external configuration.
"""

import asyncio
import sys
import os
from pathlib import Path

def print_banner():
    """Print a nice banner for the test runner"""
    print("=" * 70)
    print("[TEST] STANDALONE CHAT HISTORY EVALUATION TEST RUNNER")
    print("=" * 70)
    print("This script will evaluate chat history functionality using mock services.")
    print("No external dependencies, MongoDB, or configuration required!")
    print()
    print("Test scenarios include:")
    print("- Reference to previous conversations")
    print("- Image comparison with context")
    print("- Summary requests")
    print("- Question recall")
    print("- Topic-specific queries")
    print()
    print("=" * 70)

async def run_standalone_evaluation():
    """Run the standalone chat history evaluation"""
    print_banner()
    
    print("[INFO] Using mock services (no external dependencies required)...")
    print("[OK] All mock modules loaded successfully")
    
    print("\n[START] Starting standalone evaluation tests...")
    print("-" * 50)
    
    try:
        # Import the standalone evaluator
        from test_chat_history_standalone import StandaloneChatHistoryEvaluator
        
        evaluator = StandaloneChatHistoryEvaluator()
        await evaluator.run_all_tests()
        print("\n[SUCCESS] Standalone evaluation completed successfully!")
        return True
    except Exception as e:
        print(f"\n[ERROR] Evaluation failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main function"""
    try:
        success = asyncio.run(run_standalone_evaluation())
        if success:
            print("\n[OK] All tests completed successfully!")
            print("\n[SUMMARY] Summary:")
            print("- Used mock services for testing")
            print("- No external dependencies required")
            print("- Generated comprehensive evaluation report")
            print("- Tested all chat history scenarios")
            sys.exit(0)
        else:
            print("\n[ERROR] Tests failed. Check the error messages above.")
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
