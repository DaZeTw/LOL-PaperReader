# Test Runner for LOL PaperReader

This directory contains test runner scripts for the LOL PaperReader QA system.

## Files

- `test_case.json` - Contains test cases with questions, images, and expected answers
- `run_test_cases.py` - Main test runner script
- `run_tests.py` - Simple wrapper script to run tests
- `test_results.json` - Output file with test results (generated after running tests)

## Prerequisites

1. **Environment Variables**: Make sure you have `OPENAI_API_KEY` set in your environment
2. **Dependencies**: Ensure all required packages are installed
3. **Images**: Test images should be in the `paperreader/img_query/` directory

## Usage

### Method 1: Using the simple wrapper
```bash
cd backend/src
python run_tests.py
```

### Method 2: Running directly
```bash
cd backend/src
python run_test_cases.py
```

## Test Case Format

The `test_case.json` file contains an array of test cases with the following structure:

```json
{
  "id": "qa_001",
  "question": "What is the main contribution of the paper?",
  "image": ["figure1.png"],
  "expected_answer": "Expected answer text..."
}
```

### Fields:
- `id`: Unique identifier for the test case
- `question`: The question to ask the QA system
- `image`: Array of image filenames (optional)
- `expected_answer`: The expected answer (for reference)

## Output

The test runner generates `test_results.json` with:

### Summary Section:
- Total number of tests
- Number of successful/failed tests
- Success rate percentage
- Average answer length
- Average number of citations
- Average retrieval score

### Results Section:
For each test case:
- Test ID and question
- Actual answer from the system
- Answer length and citation count
- Retrieval scores
- Status (success/failed)
- Timestamp

## Example Output

```json
{
  "summary": {
    "total_tests": 8,
    "successful_tests": 7,
    "failed_tests": 1,
    "success_rate": 87.5,
    "avg_answer_length": 156.3,
    "avg_citations": 2.1,
    "avg_retrieval_score": 0.8234
  },
  "results": [
    {
      "test_id": "qa_001",
      "question": "What is the main contribution...",
      "actual_answer": "The main contribution is...",
      "status": "success",
      "timestamp": "2024-01-15T10:30:00"
    }
  ]
}
```

## Troubleshooting

1. **Pipeline initialization fails**: Check that all dependencies are installed and environment variables are set
2. **Images not found**: Ensure test images are in the `paperreader/img_query/` directory
3. **API errors**: Verify your OpenAI API key is valid and has sufficient credits
4. **Import errors**: Make sure you're running from the correct directory (`backend/src`)

## Adding New Test Cases

To add new test cases, edit `test_case.json` and add new objects to the array:

```json
{
  "id": "qa_new_001",
  "question": "Your new question here",
  "image": ["new_image.png"],
  "expected_answer": "Expected answer"
}
```

Then run the test suite again to include the new test case.
