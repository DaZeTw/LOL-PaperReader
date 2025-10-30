#!/usr/bin/env python3
"""
Setup script for real chat history evaluation tests.
This script helps set up the environment and run tests with real backend services.
"""

import os
import sys
from pathlib import Path

def setup_environment():
    """Set up environment variables for testing"""
    print("[SETUP] Setting up environment for real backend tests...")
    
    # Set MongoDB URL
    mongodb_url = os.environ.get("MONGODB_URL", "mongodb://localhost:27017/test_chat_history")
    os.environ["MONGODB_URL"] = mongodb_url
    print(f"[OK] MongoDB URL set to: {mongodb_url}")
    
    # Check if MongoDB is accessible
    try:
        import pymongo
        client = pymongo.MongoClient(mongodb_url)
        client.admin.command('ping')
        print("[OK] MongoDB connection successful")
        client.close()
    except Exception as e:
        print(f"[WARNING] MongoDB connection failed: {e}")
        print("[INFO] Make sure MongoDB is running on localhost:27017")
    
    # Check for OpenAI API key
    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        print("[OK] OpenAI API key found")
    else:
        print("[WARNING] OPENAI_API_KEY not found in environment")
        print("[INFO] You may need to set this for the generator to work")
    
    print("[OK] Environment setup completed")

def check_dependencies():
    """Check if all required dependencies are available"""
    print("[CHECK] Checking dependencies...")
    
    required_modules = [
        "pymongo",
        "fastapi",
        "pydantic",
        "openai",
        "numpy",
        "pandas"
    ]
    
    missing_modules = []
    for module in required_modules:
        try:
            __import__(module)
            print(f"[OK] {module} available")
        except ImportError:
            missing_modules.append(module)
            print(f"[MISSING] {module} not found")
    
    if missing_modules:
        print(f"\n[ERROR] Missing dependencies: {', '.join(missing_modules)}")
        print("[INFO] Install them with: pip install " + " ".join(missing_modules))
        return False
    
    print("[OK] All dependencies available")
    return True

def main():
    """Main setup function"""
    print("=" * 60)
    print("[SETUP] Real Chat History Evaluation Setup")
    print("=" * 60)
    
    # Check dependencies
    if not check_dependencies():
        print("\n[ERROR] Setup failed due to missing dependencies")
        sys.exit(1)
    
    # Setup environment
    setup_environment()
    
    print("\n" + "=" * 60)
    print("[READY] Setup completed successfully!")
    print("=" * 60)
    print("\nTo run the real backend tests:")
    print("1. Make sure MongoDB is running")
    print("2. Set OPENAI_API_KEY if needed")
    print("3. Run: python test_chat_history_real.py")
    print("\nOr use the runner script:")
    print("python run_real_chat_tests.py")

if __name__ == "__main__":
    main()
