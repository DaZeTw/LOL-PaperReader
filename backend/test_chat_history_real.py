#!/usr/bin/env python3
"""
Real Chat History Evaluation Test Suite
This version runs with actual backend services and can process real images.
"""

import asyncio
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
import sys
import os
from pathlib import Path

# Add the src directory to the path
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
sys.path.insert(0, str(src_dir))

# Set up environment variables for testing
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test_chat_history")

try:
    from paperreader.services.chat.chat_service import chat_service
    from paperreader.services.chat.chat_embedding_service import chat_embedding_service
    from paperreader.models.chat import ChatSessionCreate, ChatMessageCreate
    from paperreader.services.qa.config import PipelineConfig
    from paperreader.services.qa.pipeline import QAPipeline
    print("[OK] Successfully imported real backend services")
except ImportError as e:
    print(f"[ERROR] Failed to import backend services: {e}")
    print("[INFO] Make sure you're running from the backend directory and all dependencies are installed")
    sys.exit(1)

class RealChatHistoryEvaluator:
    def __init__(self):
        self.test_session_id = str(uuid.uuid4())
        self.test_user_id = "test_user_123"
        self.results = []
    
    async def setup_test_session(self):
        """Create a test chat session"""
        print("[SETUP] Setting up test session...")
        
        session_data = ChatSessionCreate(
            session_id=self.test_session_id,
            user_id=self.test_user_id,
            title="Real Chat History Evaluation Test",
            initial_message="Hello, I'm testing the chat history functionality with real services."
        )
        
        session = await chat_service.create_session(session_data)
        print(f"[OK] Test session created: {session.session_id}")
        return session
    
    async def populate_initial_chat_history(self):
        """Populate the session with initial conversation about transformers"""
        print("[SETUP] Populating initial chat history...")
        
        # Initial conversation about transformers
        initial_conversations = [
            {
                "role": "user",
                "content": "Can you explain what a Transformer model is?"
            },
            {
                "role": "assistant", 
                "content": "A Transformer is a deep learning model architecture introduced in the paper 'Attention Is All You Need' by Vaswani et al. It relies entirely on attention mechanisms to process sequential data, eliminating the need for recurrent or convolutional layers. The key components include multi-head attention, positional encoding, and feed-forward networks."
            },
            {
                "role": "user",
                "content": "How does multi-head attention work in Transformers?"
            },
            {
                "role": "assistant",
                "content": "Multi-head attention allows the model to attend to different representation subspaces simultaneously. It consists of multiple attention heads, each learning different types of relationships between tokens. The outputs from all heads are concatenated and linearly transformed to produce the final attention output. This parallel processing enables the model to capture various types of dependencies in the input sequence."
            },
            {
                "role": "user",
                "content": "What training objective or loss function is used in the Transformer paper?"
            },
            {
                "role": "assistant",
                "content": "The Transformer uses cross-entropy loss for training. For machine translation tasks, it employs teacher forcing during training, where the model predicts the next token given the previous ground truth tokens. The loss is computed as the negative log-likelihood of the correct next token, summed over all positions in the sequence."
            },
            {
                "role": "user",
                "content": "How does this Transformer differ from RNN or CNN models?"
            },
            {
                "role": "assistant",
                "content": "Transformers differ from RNNs and CNNs in several key ways: 1) RNNs process sequences sequentially, creating bottlenecks and difficulty with long-range dependencies, while Transformers process all positions in parallel. 2) CNNs use local receptive fields and require multiple layers to capture long-range dependencies, whereas Transformers can directly model relationships between any two positions. 3) Transformers eliminate recurrence entirely, relying on attention mechanisms for sequence modeling."
            }
        ]
        
        # Add each message to the session
        for conv in initial_conversations:
            message = ChatMessageCreate(
                role=conv["role"],
                content=conv["content"]
            )
            await chat_service.add_message(self.test_session_id, message)
            
            # Also embed the message for similarity search
            try:
                message_data = {
                    "message_id": f"{self.test_session_id}_{datetime.utcnow().isoformat()}_{conv['role']}",
                    "session_id": self.test_session_id,
                    "user_id": self.test_user_id,
                    "role": conv["role"],
                    "content": conv["content"],
                    "timestamp": datetime.utcnow(),
                    "metadata": {},
                    "has_images": False
                }
                await chat_embedding_service.embed_message(message_data)
            except Exception as e:
                print(f"[WARNING] Failed to embed message: {e}")
        
        print(f"[OK] Added {len(initial_conversations)} messages to chat history")
    
    async def test_question_scenario(self, question_data: Dict[str, Any], test_id: int) -> Dict[str, Any]:
        """Test a single question scenario"""
        print(f"\n[TEST {test_id}] {question_data['question'][:50]}...")
        
        # Get recent chat history
        chat_history = await chat_service.get_recent_messages(self.test_session_id, limit=3)
        
        # Get similar Q&A pairs from chat history using embedding search
        similar_qa_pairs = []
        try:
            similar_results = await chat_embedding_service.search_chat_history(
                query=question_data['question'],
                top_k=3
            )
            for result in similar_results:
                similar_qa_pairs.append({
                    "role": result.get("role", ""),
                    "content": result.get("text", ""),
                    "score": result.get("score", 0.0),
                    "session_id": result.get("session_id", ""),
                    "timestamp": result.get("timestamp", "")
                })
            print(f"[INFO] Found {len(similar_qa_pairs)} similar Q&A pairs")
        except Exception as e:
            print(f"[WARNING] Failed to search similar Q&A pairs: {e}")
            similar_qa_pairs = []
        
        # Merge recent chat history with similar Q&A pairs
        all_messages = []
        
        # Add recent chat history
        for msg in chat_history:
            all_messages.append({
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat(),
                "source": "recent_history"
            })
        
        # Add similar Q&A pairs
        for qa_pair in similar_qa_pairs:
            all_messages.append({
                "role": qa_pair.get("role", ""),
                "content": qa_pair.get("content", ""),
                "timestamp": qa_pair.get("timestamp", ""),
                "source": "similar_qa"
            })
        
        # Remove duplicates and sort by timestamp
        seen_contents = set()
        unique_messages = []
        for msg in all_messages:
            content_key = f"{msg['role']}:{msg['content']}"
            if content_key not in seen_contents:
                seen_contents.add(content_key)
                unique_messages.append(msg)
        
        # Sort by timestamp (most recent first) - handle both string and datetime timestamps
        def get_timestamp_for_sort(msg):
            timestamp = msg['timestamp']
            if isinstance(timestamp, str):
                return timestamp
            else:
                return timestamp.isoformat()
        
        unique_messages.sort(key=get_timestamp_for_sort, reverse=True)
        
        # Convert to format expected by generator
        history_for_generator = []
        for msg in unique_messages:
            history_for_generator.append({
                "role": msg["role"],
                "content": msg["content"]
            })
        
        # Process user images if provided (REAL image processing)
        processed_user_images = []
        if question_data.get('user_images'):
            for img_path in question_data['user_images']:
                try:
                    import base64
                    from pathlib import Path
                    
                    # Resolve image path
                    if img_path.startswith("./paperreader/img_query/"):
                        full_path = Path(img_path)
                    elif img_path.startswith("paperreader/img_query/"):
                        full_path = Path(f"./{img_path}")
                    else:
                        full_path = Path(img_path)
                    
                    if full_path.exists():
                        with open(full_path, "rb") as f:
                            img_bytes = f.read()
                        
                        ext = full_path.suffix.lower()
                        mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}
                        mime = mime_map.get(ext, "image/png")
                        
                        b64 = base64.b64encode(img_bytes).decode("ascii")
                        data_url = f"data:{mime};base64,{b64}"
                        processed_user_images.append(data_url)
                        print(f"[INFO] Processed real image: {img_path} ({len(img_bytes)} bytes)")
                    else:
                        print(f"[WARNING] Image not found: {img_path}")
                except Exception as e:
                    print(f"[WARNING] Failed to process image {img_path}: {e}")
        
        # Add user question to chat history
        user_message = ChatMessageCreate(
            role="user",
            content=question_data['question'],
            metadata={
                "user_images": processed_user_images
            }
        )
        await chat_service.add_message(self.test_session_id, user_message)
        
        # Configure and run the QA pipeline
        config = PipelineConfig(
            retriever_name="hybrid",
            generator_name="openai",
            image_policy="auto",
            top_k=5,
            max_tokens=512,
        )
        
        pipeline = QAPipeline(config)
        result = await pipeline.answer(
            question=question_data['question'],
            user_images=processed_user_images if processed_user_images else None,
            chat_history=history_for_generator
        )
        
        # Add assistant response to chat history
        assistant_message = ChatMessageCreate(
            role="assistant",
            content=result["answer"],
            metadata={
                "citations": result.get("citations", []),
                "cited_sections": result.get("cited_sections", []),
                "retriever_scores": result.get("retriever_scores", [])
            }
        )
        await chat_service.add_message(self.test_session_id, assistant_message)
        
        # Embed messages for future similarity search
        try:
            # Embed user message
            user_message_data = {
                "message_id": f"{self.test_session_id}_{datetime.utcnow().isoformat()}_user",
                "session_id": self.test_session_id,
                "user_id": self.test_user_id,
                "role": "user",
                "content": question_data['question'],
                "timestamp": datetime.utcnow(),
                "metadata": user_message.metadata or {},
                "has_images": bool(processed_user_images)
            }
            await chat_embedding_service.embed_message(user_message_data)
            
            # Embed assistant message
            assistant_message_data = {
                "message_id": f"{self.test_session_id}_{datetime.utcnow().isoformat()}_assistant",
                "session_id": self.test_session_id,
                "user_id": self.test_user_id,
                "role": "assistant",
                "content": result["answer"],
                "timestamp": datetime.utcnow(),
                "metadata": assistant_message.metadata,
                "has_images": False
            }
            await chat_embedding_service.embed_message(assistant_message_data)
        except Exception as e:
            print(f"[WARNING] Failed to embed messages: {e}")
        
        # Evaluate the response
        evaluation = self.evaluate_response(question_data, result, history_for_generator)
        
        test_result = {
            "test_id": test_id,
            "question": question_data['question'],
            "user_images": question_data.get('user_images', []),
            "answer": result["answer"],
            "cited_sections": result.get("cited_sections", []),
            "retriever_scores": result.get("retriever_scores", []),
            "chat_history_used": len(history_for_generator),
            "similar_qa_found": len(similar_qa_pairs),
            "images_processed": len(processed_user_images),
            "evaluation": evaluation,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        print(f"[OK] Test {test_id} completed")
        return test_result
    
    def evaluate_response(self, question_data: Dict[str, Any], result: Dict[str, Any], chat_history: List[Dict]) -> Dict[str, Any]:
        """Evaluate the quality of the response"""
        answer = result["answer"]
        question = question_data['question']
        
        evaluation = {
            "context_awareness": 0,
            "reference_accuracy": 0,
            "coherence": 0,
            "completeness": 0,
            "image_analysis": 0,
            "overall_score": 0
        }
        
        # Check for context awareness (mentions previous topics)
        context_keywords = ["transformer", "attention", "multi-head", "rnn", "cnn", "loss function", "training"]
        context_mentions = sum(1 for keyword in context_keywords if keyword.lower() in answer.lower())
        evaluation["context_awareness"] = min(context_mentions / 3, 1.0)  # Normalize to 0-1
        
        # Check for reference accuracy (answers the specific question)
        if "how does this method improve" in question.lower():
            evaluation["reference_accuracy"] = 1.0 if "improve" in answer.lower() or "better" in answer.lower() else 0.5
        elif "compare these two images" in question.lower():
            evaluation["reference_accuracy"] = 1.0 if "compare" in answer.lower() or "similar" in answer.lower() or "different" in answer.lower() else 0.5
        elif "summarize" in question.lower():
            evaluation["reference_accuracy"] = 1.0 if len(answer) > 100 else 0.5
        elif "last question" in question.lower():
            evaluation["reference_accuracy"] = 1.0 if any(msg["role"] == "user" for msg in chat_history[-2:]) else 0.5
        elif "multi-head attention" in question.lower():
            evaluation["reference_accuracy"] = 1.0 if "multi-head" in answer.lower() or "attention" in answer.lower() else 0.5
        elif "training objective" in question.lower() or "loss function" in question.lower():
            evaluation["reference_accuracy"] = 1.0 if "loss" in answer.lower() or "objective" in answer.lower() or "cross-entropy" in answer.lower() else 0.5
        elif "transformer differs from rnn" in question.lower():
            evaluation["reference_accuracy"] = 1.0 if ("rnn" in answer.lower() or "cnn" in answer.lower()) and "transformer" in answer.lower() else 0.5
        else:
            evaluation["reference_accuracy"] = 0.8  # Default good score
        
        # Check coherence (response makes sense)
        evaluation["coherence"] = 1.0 if len(answer) > 50 and not answer.startswith("I don't know") else 0.5
        
        # Check completeness (response addresses the question)
        evaluation["completeness"] = 1.0 if len(answer) > 100 else 0.7
        
        # Check image analysis (for image-based questions)
        if question_data.get('user_images'):
            image_keywords = ["image", "figure", "diagram", "visual", "see", "show", "display", "pattern", "structure"]
            image_mentions = sum(1 for keyword in image_keywords if keyword.lower() in answer.lower())
            evaluation["image_analysis"] = min(image_mentions / 2, 1.0)  # Normalize to 0-1
        else:
            evaluation["image_analysis"] = 1.0  # Not applicable
        
        # Calculate overall score
        if question_data.get('user_images'):
            # For image questions, include image analysis
            evaluation["overall_score"] = (
                evaluation["context_awareness"] * 0.25 +
                evaluation["reference_accuracy"] * 0.25 +
                evaluation["coherence"] * 0.15 +
                evaluation["completeness"] * 0.15 +
                evaluation["image_analysis"] * 0.20
            )
        else:
            # For text-only questions
            evaluation["overall_score"] = (
                evaluation["context_awareness"] * 0.3 +
                evaluation["reference_accuracy"] * 0.3 +
                evaluation["coherence"] * 0.2 +
                evaluation["completeness"] * 0.2
            )
        
        return evaluation
    
    async def run_all_tests(self):
        """Run all test scenarios"""
        print("[START] Starting Real Chat History Evaluation Tests")
        print("=" * 60)
        
        # Setup
        await self.setup_test_session()
        await self.populate_initial_chat_history()
        
        # Test scenarios
        test_scenarios = [
            {
                "question": "how does this method improve over the one we talked about before?",
                "user_images": []
            },
            {
                "question": "compare these two images with the ones we discussed earlier — do you see the same failure pattern?",
                "user_images": [
                    "./paperreader/img_query/figure2.png",
                    "./paperreader/img_query/cnn_diagram.jpg"
                ]
            },
            {
                "question": "can you summarize all the key ideas we have discussed so far about transformer?",
                "user_images": []
            },
            {
                "question": "what was the last question I asked before this one?",
                "user_images": []
            },
            {
                "question": "I remember I asked something about multi-head attention in that paper — what was my question?",
                "user_images": []
            },
            {
                "question": "earlier I mentioned something about the training objective or loss function used in the Transformer paper — what exactly did I ask?",
                "user_images": []
            },
            {
                "question": "I think I asked how this Transformer differs from RNN or CNN models — can you find that question in our previous chat?",
                "user_images": []
            }
        ]
        
        # Run each test
        for i, scenario in enumerate(test_scenarios, 1):
            try:
                result = await self.test_question_scenario(scenario, i)
                self.results.append(result)
                
                # Small delay between tests
                await asyncio.sleep(1)
            except Exception as e:
                print(f"[ERROR] Test {i} failed: {e}")
                self.results.append({
                    "test_id": i,
                    "question": scenario['question'],
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                })
        
        # Generate report
        await self.generate_report()
    
    async def generate_report(self):
        """Generate a comprehensive test report"""
        print("\n" + "=" * 60)
        print("[REPORT] REAL CHAT HISTORY EVALUATION REPORT")
        print("=" * 60)
        
        total_tests = len(self.results)
        successful_tests = len([r for r in self.results if "error" not in r])
        
        print(f"Total Tests: {total_tests}")
        print(f"Successful: {successful_tests}")
        print(f"Failed: {total_tests - successful_tests}")
        print(f"Success Rate: {successful_tests/total_tests*100:.1f}%")
        
        if successful_tests > 0:
            # Calculate average scores
            avg_scores = {
                "context_awareness": 0,
                "reference_accuracy": 0,
                "coherence": 0,
                "completeness": 0,
                "image_analysis": 0,
                "overall_score": 0
            }
            
            for result in self.results:
                if "evaluation" in result:
                    eval_data = result["evaluation"]
                    for key in avg_scores:
                        avg_scores[key] += eval_data[key]
            
            for key in avg_scores:
                avg_scores[key] /= successful_tests
            
            print(f"\n[SCORES] Average Scores:")
            print(f"  Context Awareness: {avg_scores['context_awareness']:.2f}")
            print(f"  Reference Accuracy: {avg_scores['reference_accuracy']:.2f}")
            print(f"  Coherence: {avg_scores['coherence']:.2f}")
            print(f"  Completeness: {avg_scores['completeness']:.2f}")
            print(f"  Image Analysis: {avg_scores['image_analysis']:.2f}")
            print(f"  Overall Score: {avg_scores['overall_score']:.2f}")
        
        print(f"\n[DETAILS] Detailed Results:")
        for result in self.results:
            print(f"\nTest {result['test_id']}: {result['question'][:60]}...")
            if "error" in result:
                print(f"  [ERROR] Error: {result['error']}")
            else:
                eval_data = result["evaluation"]
                print(f"  [OK] Overall Score: {eval_data['overall_score']:.2f}")
                print(f"  [INFO] Context: {eval_data['context_awareness']:.2f}, Reference: {eval_data['reference_accuracy']:.2f}")
                print(f"  [INFO] Coherence: {eval_data['coherence']:.2f}, Completeness: {eval_data['completeness']:.2f}")
                if result.get('user_images'):
                    print(f"  [INFO] Image Analysis: {eval_data['image_analysis']:.2f}")
                    print(f"  [INFO] Images Processed: {result.get('images_processed', 0)}")
                print(f"  [INFO] Chat History Used: {result['chat_history_used']} messages")
                print(f"  [INFO] Similar Q&A Found: {result['similar_qa_found']}")
                print(f"  [ANSWER] {result['answer'][:150]}...")
        
        # Save detailed results to file
        report_data = {
            "test_session_id": self.test_session_id,
            "test_user_id": self.test_user_id,
            "timestamp": datetime.utcnow().isoformat(),
            "test_type": "real_backend",
            "summary": {
                "total_tests": total_tests,
                "successful_tests": successful_tests,
                "success_rate": successful_tests/total_tests*100 if total_tests > 0 else 0,
                "average_scores": avg_scores if successful_tests > 0 else {}
            },
            "detailed_results": self.results
        }
        
        report_filename = f"real_chat_history_evaluation_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_filename, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        
        print(f"\n[SAVE] Detailed report saved to: {report_filename}")
        print("=" * 60)

async def main():
    """Main function to run the real evaluation"""
    evaluator = RealChatHistoryEvaluator()
    await evaluator.run_all_tests()

if __name__ == "__main__":
    print("[INFO] Real Chat History Evaluation Test Suite")
    print("This script tests chat history functionality with real backend services.")
    print("Requires MongoDB, OpenAI API, and all backend dependencies.")
    print()
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[STOP] Test interrupted by user")
    except Exception as e:
        print(f"\n[ERROR] Test suite failed: {e}")
        import traceback
        traceback.print_exc()
