#!/usr/bin/env python3
"""
Simple script to run the test cases.
Usage: python run_tests.py
"""

import subprocess
import sys
from pathlib import Path

def main():
    """Run the test cases using the test runner."""
    script_path = Path(__file__).parent / "run_test_cases.py"
    
    print("Starting LOL PaperReader Test Suite...")
    print("=" * 50)
    
    try:
        # Run the test runner
        result = subprocess.run([sys.executable, str(script_path)], 
                              capture_output=False, 
                              text=True)
        
        if result.returncode == 0:
            print("\n✅ Test suite completed successfully!")
            print("📄 Results saved to: test_results.json")
        else:
            print("\n❌ Test suite failed!")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Error running tests: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
