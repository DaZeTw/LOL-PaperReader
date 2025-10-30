# Chat History Evaluation Test Suite

This test suite evaluates the chat history functionality of the LOL-PaperReader backend system. It tests the ability of the chat system to maintain conversation context, reference previous questions and answers, and provide coherent responses based on chat history.

## Files Created

- `test_chat_history_evaluation.py` - Main test suite with comprehensive evaluation logic
- `run_chat_history_tests.py` - Simple runner script for easy execution
- `CHAT_HISTORY_TEST_README.md` - This documentation file

## Test Scenarios

The test suite evaluates the following scenarios:

1. **Reference to Previous Methods** - Tests if the system can understand references to "the method we talked about before"

2. **Image Comparison with Context** - Tests image comparison questions that reference "the ones we discussed earlier"

3. **Summary Requests** - Tests the ability to summarize key ideas discussed about transformers

4. **Question Recall** - Tests if the system can recall the last question asked

5. **Topic-Specific Queries** - Tests recall of specific topics like multi-head attention, training objectives, and model comparisons

## How to Run

### Prerequisites

1. Make sure MongoDB is running and accessible
2. Ensure all backend dependencies are installed
3. The backend services should be properly configured

### Running the Tests

#### Option 1: Using the Runner Script (Recommended)
```bash
python run_chat_history_tests.py
```

#### Option 2: Direct Execution
```bash
python test_chat_history_evaluation.py
```

### Expected Output

The test suite will:
1. Create a test chat session
2. Populate it with initial conversation about transformers
3. Run each test scenario
4. Evaluate responses based on multiple criteria
5. Generate a comprehensive report

## Evaluation Criteria

Each test response is evaluated on:

- **Context Awareness** (30%) - How well the response references previous topics
- **Reference Accuracy** (30%) - How accurately the response addresses the specific question
- **Coherence** (20%) - How well-structured and logical the response is
- **Completeness** (20%) - How thoroughly the response addresses the question

## Test Data

The test suite creates initial conversation data about:
- Transformer model architecture
- Multi-head attention mechanisms
- Training objectives and loss functions
- Differences between Transformers, RNNs, and CNNs

## Output Files

After running the tests, you'll get:
- Console output with real-time progress and results
- A detailed JSON report file: `chat_history_evaluation_report_YYYYMMDD_HHMMSS.json`

## Sample Test Questions

The test suite includes these specific questions:

```json
{
  "question": "how does this method improve over the one we talked about before?",
  "user_images": []
}
{
  "question": "compare these two images with the ones we discussed earlier — do you see the same failure pattern?",
  "user_images": [
    "./paperreader/img_query/figure2.png",
    "./paperreader/img_query/cnn_diagram.jpg"
  ]
}
{
  "question": "can you summarize all the key ideas we have discussed so far about transformer?",
  "user_images": []
}
{
  "question": "what was the last question I asked before this one?",
  "user_images": []
}
{
  "question": "I remember I asked something about multi-head attention in that paper — what was my question?",
  "user_images": []
}
{
  "question": "earlier I mentioned something about the training objective or loss function used in the Transformer paper — what exactly did I ask?",
  "user_images": []
}
{
  "question": "I think I asked how this Transformer differs from RNN or CNN models — can you find that question in our previous chat?",
  "user_images": []
}
```

## Troubleshooting

### Common Issues

1. **Import Errors**: Make sure you're running from the backend directory and all dependencies are installed
2. **Database Connection**: Ensure MongoDB is running and accessible
3. **Image Files**: Verify that the test images exist in the specified paths
4. **Service Dependencies**: Make sure the chat embedding service is properly configured

### Debug Mode

For more detailed debugging, you can modify the test script to include additional logging or run individual test scenarios.

## Customization

You can customize the test suite by:
- Modifying the initial conversation data
- Adding new test scenarios
- Adjusting evaluation criteria weights
- Changing the number of similar Q&A pairs retrieved
- Modifying the chat history limit

## Integration

This test suite integrates with:
- `chat_service` - For session and message management
- `chat_embedding_service` - For similarity search
- `QAPipeline` - For generating responses
- MongoDB - For data persistence

## Performance Notes

- Tests run sequentially with small delays between them
- Each test creates embeddings for similarity search
- The evaluation includes both recent chat history and similar Q&A pairs
- Image processing is included for image-based questions

## Future Enhancements

Potential improvements to the test suite:
- Parallel test execution
- More sophisticated evaluation metrics
- Integration with automated testing frameworks
- Performance benchmarking
- A/B testing capabilities
