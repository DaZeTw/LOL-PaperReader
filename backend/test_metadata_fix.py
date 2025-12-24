import sys
from pathlib import Path
sys.path.append("/mnt/c/Users/koba/cazoodle/LOL-PaperReader/backend/src")

from paperreader.services.metadata.metadata_service import ExternalAPIResponse, _metadata_res_to_internal_schema_mapper

def test_metadata_fix():
    print("Testing ExternalAPIResponse validation fix...")
    # Test case 1: DOI is None (simulating the bug)
    data_with_null_doi = {
        "title": "Test Paper",
        "authors": ["Author One"],
        "doi": None,
        "publication_date": "2023-01-01",
        "publisher": "Test Publisher",
        "abstract": "Abstract",
        "link": None,
        "citation_count": 0,
        "board_topic": []
    }
    
    response_payload = {
        "success": True,
        "data": data_with_null_doi
    }
    
    try:
        # This will fail if our fix didn't work (was expecting str, got None)
        parsed = ExternalAPIResponse(**response_payload)
        print("✅ Validation test passed: ExternalAPIResponse accepted None for doi/link")
    except Exception as e:
        print(f"❌ Validation test failed: {e}")

    print("\nTesting Error Handling fix...")
    # Test case 2: Invalid data causing validation error
    invalid_payload = {
        "success": True,
        "data": "Not a dict" # catastrophic failure
    }
    
    result = _metadata_res_to_internal_schema_mapper(invalid_payload)
    print(f"Result type: {type(result)}")
    print(f"Result: {result}")
    
    if isinstance(result, dict) and "title" in result:
        print("✅ Error handling test passed: Returned a valid dict")
    else:
        print("❌ Error handling test failed: Did not return a valid dict")

    # Test case 3: Check explicitly for the set bug
    if isinstance(result, set):
        print("❌ Error handling test failed: Returned a SET!")

if __name__ == "__main__":
    test_metadata_fix()
