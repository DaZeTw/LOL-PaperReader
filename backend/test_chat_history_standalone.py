#!/usr/bin/env python3
"""
Standalone Chat History Evaluation Test Suite
This version can run independently without requiring full application configuration.
All emojis replaced with ASCII characters for Windows compatibility.
"""

import asyncio
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
import sys
import os
from pathlib import Path

# Mock the required modules for standalone testing
class MockSettings:
    def __init__(self):
        self.mongodb_url = "mongodb://localhost:27017/test_chat_history"

class MockMongoDB:
    def __init__(self):
        self.collections = {}
    
    def get_collection(self, name: str):
        if name not in self.collections:
            self.collections[name] = MockCollection()
        return self.collections[name]

class MockCollection:
    def __init__(self):
        self.data = []
        self.next_id = 1
    
    async def insert_one(self, document: dict):
        document["_id"] = self.next_id
        self.next_id += 1
        self.data.append(document)
        return MockInsertResult(document["_id"])
    
    async def find_one(self, query: dict):
        for doc in self.data:
            if all(doc.get(k) == v for k, v in query.items()):
                return doc
        return None
    
    async def update_one(self, query: dict, update: dict):
        for i, doc in enumerate(self.data):
            if all(doc.get(k) == v for k, v in query.items()):
                # Apply update
                if "$push" in update:
                    for field, value in update["$push"].items():
                        if field not in doc:
                            doc[field] = []
                        doc[field].append(value)
                if "$set" in update:
                    doc.update(update["$set"])
                return MockUpdateResult(1, 1)
        return MockUpdateResult(0, 0)
    
    async def delete_one(self, query: dict):
        for i, doc in enumerate(self.data):
            if all(doc.get(k) == v for k, v in query.items()):
                del self.data[i]
                return MockDeleteResult(1)
        return MockDeleteResult(0)
    
    def find(self, query: dict):
        return MockCursor(self.data, query)

class MockCursor:
    def __init__(self, data: list, query: dict):
        self.data = [doc for doc in data if all(doc.get(k) == v for k, v in query.items())]
        self.data.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        self.index = 0
    
    def sort(self, field: str, direction: int):
        self.data.sort(key=lambda x: x.get(field, ""), reverse=(direction == -1))
        return self
    
    def limit(self, n: int):
        self.data = self.data[:n]
        return self
    
    def __aiter__(self):
        return self
    
    async def __anext__(self):
        if self.index >= len(self.data):
            raise StopAsyncIteration
        result = self.data[self.index]
        self.index += 1
        return result

class MockInsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id

class MockUpdateResult:
    def __init__(self, matched_count, modified_count):
        self.matched_count = matched_count
        self.modified_count = modified_count

class MockDeleteResult:
    def __init__(self, deleted_count):
        self.deleted_count = deleted_count

# Mock the chat service
class MockChatMessage:
    def __init__(self, role: str, content: str, timestamp: datetime = None, metadata: dict = None):
        self.role = role
        self.content = content
        self.timestamp = timestamp or datetime.utcnow()
        self.metadata = metadata or {}

class MockChatSession:
    def __init__(self, session_id: str, user_id: str = None, title: str = None, 
                 messages: list = None, created_at: datetime = None, updated_at: datetime = None):
        self.session_id = session_id
        self.user_id = user_id
        self.title = title
        self.messages = messages or []
        self.created_at = created_at or datetime.utcnow()
        self.updated_at = updated_at or datetime.utcnow()

class MockChatService:
    def __init__(self):
        self.sessions = {}
    
    async def create_session(self, session_data):
        session = MockChatSession(
            session_id=session_data.session_id,
            user_id=session_data.user_id,
            title=session_data.title
        )
        if session_data.initial_message:
            session.messages.append(MockChatMessage(
                role="user",
                content=session_data.initial_message
            ))
        self.sessions[session.session_id] = session
        return session
    
    async def get_session(self, session_id: str):
        return self.sessions.get(session_id)
    
    async def add_message(self, session_id: str, message):
        if session_id in self.sessions:
            chat_message = MockChatMessage(
                role=message.role,
                content=message.content,
                metadata=message.metadata
            )
            self.sessions[session_id].messages.append(chat_message)
            self.sessions[session_id].updated_at = datetime.utcnow()
            return self.sessions[session_id]
        return None
    
    async def get_recent_messages(self, session_id: str, limit: int = 10):
        if session_id in self.sessions:
            messages = self.sessions[session_id].messages
            return messages[-limit:] if limit else messages
        return []

# Mock the chat embedding service
class MockChatEmbeddingService:
    def __init__(self):
        self.embeddings = []
    
    async def search_chat_history(self, query: str, top_k: int = 3):
        # Simple keyword-based similarity for testing
        query_lower = query.lower()
        results = []
        
        for embedding in self.embeddings:
            content = embedding.get("content", "").lower()
            score = 0
            
            # Calculate simple similarity score
            query_words = set(query_lower.split())
            content_words = set(content.split())
            common_words = query_words.intersection(content_words)
            
            if common_words:
                score = len(common_words) / len(query_words)
            
            if score > 0.1:  # Threshold for relevance
                results.append({
                    "role": embedding.get("role", ""),
                    "text": embedding.get("content", ""),
                    "score": score,
                    "session_id": embedding.get("session_id", ""),
                    "timestamp": embedding.get("timestamp", "")
                })
        
        # Sort by score and return top_k
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]
    
    async def embed_message(self, message_data: dict):
        self.embeddings.append(message_data)

# Mock the QA Pipeline
class MockQAPipeline:
    def __init__(self, config):
        self.config = config
    
    async def answer(self, question: str, user_images: list = None, chat_history: list = None):
        # Generate a mock response based on the question
        answer = self.generate_mock_answer(question, chat_history)
        
        return {
            "answer": answer,
            "citations": [],
            "cited_sections": [],
            "retriever_scores": []
        }
    
    def generate_mock_answer(self, question: str, chat_history: list = None):
        """Generate a mock answer based on the question and chat history"""
        question_lower = question.lower()
        
        # Check chat history for context
        context_info = ""
        if chat_history:
            recent_topics = []
            for msg in chat_history[-4:]:  # Look at last 4 messages
                content = msg.get("content", "").lower()
                if "transformer" in content:
                    recent_topics.append("transformer")
                if "attention" in content:
                    recent_topics.append("attention")
                if "rnn" in content or "cnn" in content:
                    recent_topics.append("neural networks")
                if "loss" in content or "training" in content:
                    recent_topics.append("training")
            
            if recent_topics:
                context_info = f"Based on our previous discussion about {', '.join(set(recent_topics))}, "
        
        # Generate responses based on question type
        if "how does this method improve" in question_lower:
            return f"{context_info}this method improves over the previous approach by using more efficient attention mechanisms and better parallelization, resulting in faster training and better performance on long sequences."
        
        elif "compare these two images" in question_lower:
            return f"{context_info}looking at these images, I can see similar patterns to what we discussed earlier. The architecture shows the same attention-based design principles we talked about, with clear improvements in the attention mechanism structure."
        
        elif "summarize" in question_lower and "transformer" in question_lower:
            return f"{context_info}to summarize our discussion about transformers: they use attention mechanisms instead of recurrence, process sequences in parallel, can capture long-range dependencies effectively, and have become the foundation for many modern NLP models. Key components include multi-head attention, positional encoding, and feed-forward networks."
        
        elif "last question" in question_lower:
            if chat_history and len(chat_history) >= 2:
                last_user_msg = None
                for msg in reversed(chat_history):
                    if msg.get("role") == "user":
                        last_user_msg = msg.get("content", "")
                        break
                if last_user_msg:
                    return f"{context_info}your last question was: '{last_user_msg}'"
            return f"{context_info}I can see from our chat history that you've been asking about transformer architecture and attention mechanisms."
        
        elif "multi-head attention" in question_lower:
            return f"{context_info}you asked about how multi-head attention works in transformers. Specifically, you wanted to understand how it allows the model to attend to different representation subspaces simultaneously and how the outputs from all heads are concatenated."
        
        elif "training objective" in question_lower or "loss function" in question_lower:
            return f"{context_info}you asked about the training objective and loss function used in the Transformer paper. You wanted to know about the cross-entropy loss and how teacher forcing is used during training."
        
        elif "transformer differs from rnn" in question_lower or "transformer differs from cnn" in question_lower:
            return f"{context_info}you asked how transformers differ from RNN and CNN models. You wanted to understand the key differences in processing sequences, handling long-range dependencies, and the elimination of recurrence."
        
        else:
            return f"{context_info}based on our conversation about transformers and attention mechanisms, I can provide more context about this topic. The transformer architecture represents a significant advancement in sequence modeling."

# Mock PipelineConfig
class MockPipelineConfig:
    def __init__(self, retriever_name="hybrid", generator_name="openai", 
                 image_policy="auto", top_k=5, max_tokens=512):
        self.retriever_name = retriever_name
        self.generator_name = generator_name
        self.image_policy = image_policy
        self.top_k = top_k
        self.max_tokens = max_tokens

# Mock ChatMessageCreate
class MockChatMessageCreate:
    def __init__(self, role: str, content: str, metadata: dict = None):
        self.role = role
        self.content = content
        self.metadata = metadata or {}

# Mock ChatSessionCreate
class MockChatSessionCreate:
    def __init__(self, session_id: str, user_id: str = None, title: str = None, initial_message: str = None):
        self.session_id = session_id
        self.user_id = user_id
        self.title = title
        self.initial_message = initial_message

class StandaloneChatHistoryEvaluator:
    def __init__(self):
        self.test_session_id = str(uuid.uuid4())
        self.test_user_id = "test_user_123"
        self.results = []
        
        # Initialize mock services
        self.chat_service = MockChatService()
        self.chat_embedding_service = MockChatEmbeddingService()
    
    async def setup_test_session(self):
        """Create a test chat session"""
        print("[SETUP] Setting up test session...")
        
        session_data = MockChatSessionCreate(
            session_id=self.test_session_id,
            user_id=self.test_user_id,
            title="Chat History Evaluation Test",
            initial_message="Hello, I'm testing the chat history functionality."
        )
        
        session = await self.chat_service.create_session(session_data)
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
            message = MockChatMessageCreate(
                role=conv["role"],
                content=conv["content"]
            )
            await self.chat_service.add_message(self.test_session_id, message)
            
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
                await self.chat_embedding_service.embed_message(message_data)
            except Exception as e:
                print(f"[WARNING] Failed to embed message: {e}")
        
        print(f"[OK] Added {len(initial_conversations)} messages to chat history")
    
    async def test_question_scenario(self, question_data: Dict[str, Any], test_id: int) -> Dict[str, Any]:
        """Test a single question scenario"""
        print(f"\n[TEST {test_id}] {question_data['question'][:50]}...")
        
        # Get recent chat history
        chat_history = await self.chat_service.get_recent_messages(self.test_session_id, limit=3)
        
        # Get similar Q&A pairs from chat history using embedding search
        similar_qa_pairs = []
        try:
            similar_results = await self.chat_embedding_service.search_chat_history(
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
        
        # Process user images if provided (mock implementation)
        processed_user_images = []
        if question_data.get('user_images'):
            for img_path in question_data['user_images']:
                # Mock image processing - just note that images were provided
                processed_user_images.append(f"mock_image_data_for_{img_path}")
                print(f"[INFO] Mock processed image: {img_path}")
        
        # Add user question to chat history
        user_message = MockChatMessageCreate(
            role="user",
            content=question_data['question'],
            metadata={
                "user_images": processed_user_images
            }
        )
        await self.chat_service.add_message(self.test_session_id, user_message)
        
        # Configure and run the QA pipeline
        config = MockPipelineConfig(
            retriever_name="hybrid",
            generator_name="openai",
            image_policy="auto",
            top_k=5,
            max_tokens=512,
        )
        
        pipeline = MockQAPipeline(config)
        result = await pipeline.answer(
            question=question_data['question'],
            user_images=processed_user_images if processed_user_images else None,
            chat_history=history_for_generator
        )
        
        # Add assistant response to chat history
        assistant_message = MockChatMessageCreate(
            role="assistant",
            content=result["answer"],
            metadata={
                "citations": result.get("citations", []),
                "cited_sections": result.get("cited_sections", []),
                "retriever_scores": result.get("retriever_scores", [])
            }
        )
        await self.chat_service.add_message(self.test_session_id, assistant_message)
        
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
            await self.chat_embedding_service.embed_message(user_message_data)
            
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
            await self.chat_embedding_service.embed_message(assistant_message_data)
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
        
        # Calculate overall score
        evaluation["overall_score"] = (
            evaluation["context_awareness"] * 0.3 +
            evaluation["reference_accuracy"] * 0.3 +
            evaluation["coherence"] * 0.2 +
            evaluation["completeness"] * 0.2
        )
        
        return evaluation
    
    async def run_all_tests(self):
        """Run all test scenarios"""
        print("[START] Starting Standalone Chat History Evaluation Tests")
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
                await asyncio.sleep(0.5)
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
        print("[REPORT] STANDALONE CHAT HISTORY EVALUATION REPORT")
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
                print(f"  [INFO] Chat History Used: {result['chat_history_used']} messages")
                print(f"  [INFO] Similar Q&A Found: {result['similar_qa_found']}")
                print(f"  [ANSWER] {result['answer'][:100]}...")
        
        # Save detailed results to file
        report_data = {
            "test_session_id": self.test_session_id,
            "test_user_id": self.test_user_id,
            "timestamp": datetime.utcnow().isoformat(),
            "test_type": "standalone_mock",
            "summary": {
                "total_tests": total_tests,
                "successful_tests": successful_tests,
                "success_rate": successful_tests/total_tests*100 if total_tests > 0 else 0,
                "average_scores": avg_scores if successful_tests > 0 else {}
            },
            "detailed_results": self.results
        }
        
        report_filename = f"standalone_chat_history_evaluation_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_filename, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        
        print(f"\n[SAVE] Detailed report saved to: {report_filename}")
        print("=" * 60)

async def main():
    """Main function to run the standalone evaluation"""
    evaluator = StandaloneChatHistoryEvaluator()
    await evaluator.run_all_tests()

if __name__ == "__main__":
    print("[INFO] Standalone Chat History Evaluation Test Suite")
    print("This script tests chat history functionality using mock services.")
    print("No external dependencies or configuration required.")
    print()
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[STOP] Test interrupted by user")
    except Exception as e:
        print(f"\n[ERROR] Test suite failed: {e}")
        import traceback
        traceback.print_exc()