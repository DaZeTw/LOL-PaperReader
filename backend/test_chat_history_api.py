#!/usr/bin/env python3
"""
Simple Chat History Evaluation Test Suite using HTTP API calls.
This version calls the actual running backend API instead of importing modules.
"""

import asyncio
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
import sys
import os
import aiohttp
import base64
from pathlib import Path

class APIChatHistoryEvaluator:
    def __init__(self, base_url: str = "http://127.0.0.1:8000"):
        self.base_url = base_url
        self.test_session_id = str(uuid.uuid4())
        self.results = []
    
    async def create_test_session(self):
        """Create a test chat session via API"""
        print("[SETUP] Creating test session via API...")
        
        async with aiohttp.ClientSession() as session:
            url = f"{self.base_url}/api/chat/sessions"
            data = {
                "user_id": "test_user_123",
                "title": "Chat History Evaluation Test",
                "initial_message": "Hello, I'm testing the chat history functionality."
            }
            
            try:
                async with session.post(url, json=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        self.test_session_id = result["session_id"]
                        print(f"[OK] Test session created: {self.test_session_id}")
                        return True
                    else:
                        print(f"[ERROR] Failed to create session: {response.status}")
                        return False
            except Exception as e:
                print(f"[ERROR] Failed to create session: {e}")
                return False
    
    async def populate_initial_chat_history(self):
        """Populate the session with initial conversation about transformers"""
        print("[SETUP] Populating initial chat history...")
        
        # Initial conversation about transformers
        initial_conversations = [
            "Can you explain what a Transformer model is?",
            "How does multi-head attention work in Transformers?",
            "What training objective or loss function is used in the Transformer paper?",
            "How does this Transformer differ from RNN or CNN models?"
        ]
        
        async with aiohttp.ClientSession() as session:
            for i, question in enumerate(initial_conversations):
                url = f"{self.base_url}/api/chat/ask"
                data = {
                    "session_id": self.test_session_id,
                    "question": question,
                    "retriever": "hybrid",
                    "generator": "openai",
                    "image_policy": "auto",
                    "top_k": 5,
                    "max_tokens": 512
                }
                
                try:
                    async with session.post(url, json=data) as response:
                        if response.status == 200:
                            result = await response.json()
                            print(f"[OK] Added conversation {i+1}: {question[:30]}...")
                        else:
                            print(f"[WARNING] Failed to add conversation {i+1}: {response.status}")
                except Exception as e:
                    print(f"[WARNING] Failed to add conversation {i+1}: {e}")
                
                # Small delay between requests
                await asyncio.sleep(0.5)
        
        print(f"[OK] Added {len(initial_conversations)} conversations to chat history")
    
    def process_image_to_base64(self, image_path: str) -> Optional[str]:
        """Convert image file to base64 data URL"""
        try:
            full_path = Path(image_path)
            if not full_path.exists():
                print(f"[WARNING] Image not found: {image_path}")
                return None
            
            with open(full_path, "rb") as f:
                img_bytes = f.read()
            
            ext = full_path.suffix.lower()
            mime_map = {
                ".jpg": "image/jpeg", 
                ".jpeg": "image/jpeg", 
                ".png": "image/png", 
                ".gif": "image/gif", 
                ".webp": "image/webp"
            }
            mime = mime_map.get(ext, "image/png")
            
            b64 = base64.b64encode(img_bytes).decode("ascii")
            data_url = f"data:{mime};base64,{b64}"
            print(f"[INFO] Processed image: {image_path} ({len(img_bytes)} bytes)")
            return data_url
            
        except Exception as e:
            print(f"[WARNING] Failed to process image {image_path}: {e}")
            return None
    
    async def get_chat_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Get chat history for a session"""
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.base_url}/api/chat/sessions/{session_id}"
                async with session.get(url) as response:
                    if response.status == 200:
                        session_data = await response.json()
                        messages = []
                        for msg in session_data.get("messages", []):
                            messages.append({
                                "role": msg.get("role", ""),
                                "content": msg.get("content", ""),
                                "timestamp": msg.get("timestamp", ""),
                                "metadata": msg.get("metadata", {}),
                                "has_images": bool(msg.get("metadata", {}).get("user_images", []))
                            })
                        return messages
                    else:
                        print(f"[WARNING] Failed to get chat history: {response.status}")
                        return []
        except Exception as e:
            print(f"[WARNING] Failed to get chat history: {e}")
            return []

    async def test_question_scenario(self, question_data: Dict[str, Any], test_id: int) -> Dict[str, Any]:
        """Test a single question scenario via API"""
        print(f"\n[TEST {test_id}] {question_data['question'][:50]}...")
        
        # Process user images if provided
        processed_user_images = []
        if question_data.get('user_images'):
            for img_path in question_data['user_images']:
                base64_image = self.process_image_to_base64(img_path)
                if base64_image:
                    processed_user_images.append(base64_image)
        
        # Prepare API request
        url = f"{self.base_url}/api/chat/ask"
        data = {
            "session_id": self.test_session_id,
            "question": question_data['question'],
            "retriever": "hybrid",
            "generator": "openai",
            "image_policy": "auto",
            "top_k": 5,
            "max_tokens": 512,
            "user_images": processed_user_images if processed_user_images else None
        }
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(url, json=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        
                        # Get chat history after the request
                        chat_history = await self.get_chat_history(self.test_session_id)
                        
                        # Evaluate the response
                        evaluation = self.evaluate_response(question_data, result)
                        
                        test_result = {
                            "test_id": test_id,
                            "question": question_data['question'],
                            "user_images": question_data.get('user_images', []),
                            "answer": result["answer"],
                            "cited_sections": result.get("cited_sections", []),
                            "retriever_scores": result.get("retriever_scores", []),
                            "images_processed": len(processed_user_images),
                            "chat_history": chat_history,
                            "chat_history_count": len(chat_history),
                            "evaluation": evaluation,
                            "timestamp": datetime.utcnow().isoformat()
                        }
                        
                        print(f"[OK] Test {test_id} completed")
                        return test_result
                    else:
                        error_text = await response.text()
                        print(f"[ERROR] API request failed: {response.status} - {error_text}")
                        return {
                            "test_id": test_id,
                            "question": question_data['question'],
                            "error": f"API error {response.status}: {error_text}",
                            "timestamp": datetime.utcnow().isoformat()
                        }
            except Exception as e:
                print(f"[ERROR] Test {test_id} failed: {e}")
                return {
                    "test_id": test_id,
                    "question": question_data['question'],
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                }
    
    def evaluate_response(self, question_data: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
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
            evaluation["reference_accuracy"] = 1.0 if "last" in answer.lower() or "previous" in answer.lower() else 0.5
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
        print("[START] Starting API-based Chat History Evaluation Tests")
        print("=" * 60)
        
        # Setup
        if not await self.create_test_session():
            print("[ERROR] Failed to create test session. Make sure the API is running.")
            return
        
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
        print("[REPORT] API-BASED CHAT HISTORY EVALUATION REPORT")
        print("=" * 60)
        
        total_tests = len(self.results)
        successful_tests = len([r for r in self.results if "error" not in r])
        
        print(f"Total Tests: {total_tests}")
        print(f"Successful: {successful_tests}")
        print(f"Failed: {total_tests - successful_tests}")
        print(f"Success Rate: {successful_tests/total_tests*100:.1f}%")
        
        # Chat history statistics
        total_messages = 0
        messages_with_images = 0
        user_messages = 0
        assistant_messages = 0
        
        for result in self.results:
            if "chat_history" in result and result["chat_history"]:
                for msg in result["chat_history"]:
                    total_messages += 1
                    if msg.get("has_images", False):
                        messages_with_images += 1
                    if msg.get("role") == "user":
                        user_messages += 1
                    elif msg.get("role") == "assistant":
                        assistant_messages += 1
        
        print(f"\n[CHAT HISTORY STATS]")
        print(f"Total Messages: {total_messages}")
        print(f"User Messages: {user_messages}")
        print(f"Assistant Messages: {assistant_messages}")
        print(f"Messages with Images: {messages_with_images}")
        
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
                print(f"  [INFO] Chat History Count: {result.get('chat_history_count', 0)}")
                print(f"  [ANSWER] {result['answer'][:150]}...")
                
                # Show chat history summary
                if result.get('chat_history'):
                    print(f"  [CHAT HISTORY] Last {min(3, len(result['chat_history']))} messages:")
                    for i, msg in enumerate(result['chat_history'][-3:]):
                        role = msg.get('role', 'unknown')
                        content = msg.get('content', '')[:100]
                        has_images = msg.get('has_images', False)
                        print(f"    {i+1}. {role}: {content}... {'[HAS IMAGES]' if has_images else ''}")
        
        # Save detailed results to file
        report_data = {
            "test_session_id": self.test_session_id,
            "base_url": self.base_url,
            "timestamp": datetime.utcnow().isoformat(),
            "test_type": "api_based",
            "summary": {
                "total_tests": total_tests,
                "successful_tests": successful_tests,
                "success_rate": successful_tests/total_tests*100 if total_tests > 0 else 0,
                "average_scores": avg_scores if successful_tests > 0 else {}
            },
            "detailed_results": self.results
        }
        
        report_filename = f"api_chat_history_evaluation_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_filename, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        
        print(f"\n[SAVE] Detailed report saved to: {report_filename}")
        
        # Save chat history separately for easier analysis
        chat_history_filename = f"chat_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        chat_history_data = {
            "test_session_id": self.test_session_id,
            "timestamp": datetime.utcnow().isoformat(),
            "chat_history": []
        }
        
        # Collect all chat history from all tests
        for result in self.results:
            if "chat_history" in result and result["chat_history"]:
                chat_history_data["chat_history"].extend(result["chat_history"])
        
        # Remove duplicates based on content and timestamp
        unique_messages = []
        seen_messages = set()
        for msg in chat_history_data["chat_history"]:
            msg_key = f"{msg.get('role', '')}_{msg.get('content', '')}_{msg.get('timestamp', '')}"
            if msg_key not in seen_messages:
                seen_messages.add(msg_key)
                unique_messages.append(msg)
        
        chat_history_data["chat_history"] = unique_messages
        chat_history_data["total_messages"] = len(unique_messages)
        
        with open(chat_history_filename, 'w', encoding='utf-8') as f:
            json.dump(chat_history_data, f, indent=2, ensure_ascii=False)
        
        print(f"[SAVE] Chat history saved to: {chat_history_filename}")
        print(f"[INFO] Total unique messages: {len(unique_messages)}")
        
        # Save chat history in readable format
        readable_filename = f"chat_history_readable_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        with open(readable_filename, 'w', encoding='utf-8') as f:
            f.write(f"Chat History for Session: {self.test_session_id}\n")
            f.write(f"Generated: {datetime.utcnow().isoformat()}\n")
            f.write("=" * 80 + "\n\n")
            
            for i, msg in enumerate(unique_messages, 1):
                role = msg.get('role', 'unknown').upper()
                content = msg.get('content', '')
                timestamp = msg.get('timestamp', '')
                has_images = msg.get('has_images', False)
                
                f.write(f"[{i}] {role} ({timestamp})\n")
                if has_images:
                    f.write("[HAS IMAGES]\n")
                f.write(f"{content}\n")
                f.write("-" * 40 + "\n\n")
        
        print(f"[SAVE] Readable chat history saved to: {readable_filename}")
        print("=" * 60)

async def main():
    """Main function to run the API-based evaluation"""
    evaluator = APIChatHistoryEvaluator()
    await evaluator.run_all_tests()

if __name__ == "__main__":
    print("[INFO] API-based Chat History Evaluation Test Suite")
    print("This script tests chat history functionality by calling the running API.")
    print("Make sure your backend API is running on http://127.0.0.1:8000")
    print()
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[STOP] Test interrupted by user")
    except Exception as e:
        print(f"\n[ERROR] Test suite failed: {e}")
        import traceback
        traceback.print_exc()
