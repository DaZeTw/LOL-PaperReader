from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


# ============================ #
#         BASE CLASS           #
# ============================ #
class Generator(ABC):
    @abstractmethod
    def generate(
        self,
        question: str,
        contexts: List[Any],
        max_tokens: int = 512,
        query_image: Optional[str] = None,
        query_images: Optional[List[str]] = None,
        chat_history: Optional[List[Dict[str, Any]]] = None,
    ):
        ...


# ============================ #
#       OPENAI GENERATOR       #
# ============================ #
class OpenAIGenerator(Generator):
    def __init__(self, model: str = "gpt-4o-mini", image_include_all_override: Optional[bool] = None) -> None:
        from openai import OpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        self.client = OpenAI(api_key=api_key) if api_key else None
        self.model = model
        self.supports_images = True

        # Image selection configs (with env overrides)
        try:
            self.image_max = int(os.getenv("RAG_GEN_IMAGE_MAX", "4"))
        except Exception:
            self.image_max = 4
        try:
            self.image_min_score = float(os.getenv("RAG_GEN_IMAGE_MIN_SCORE", "1"))
        except Exception:
            self.image_min_score = 1.0
        env_include_all = os.getenv("RAG_GEN_IMAGE_INCLUDE_ALL", "false").lower() in {"1", "true", "yes", "y"}
        self.image_include_all = env_include_all if image_include_all_override is None else bool(image_include_all_override)

    # ----------------------------------------------------------
    def generate(
        self,
        question: str,
        contexts: List[Any],
        max_tokens: int = 512,
        query_image: Optional[str] = None,
        query_images: Optional[List[str]] = None,
        chat_history: Optional[List[Dict[str, Any]]] = None,
    ):
        print(f"[DEBUG] ===== GENERATOR CALLED =====")
        print(f"[DEBUG] Question: {question}")
        print(f"[DEBUG] query_image: {query_image}")
        print(f"[DEBUG] query_images: {len(query_images) if query_images else 0}")
        print(f"[DEBUG] chat_history: {chat_history if chat_history else 0}")
        print(f"[DEBUG] contexts: {len(contexts)}")
        print(f"[DEBUG] ================================")

        if self.client is None:
            raise RuntimeError("OPENAI_API_KEY not set")

        # --- Default system prompt (used only if not found in history) ---
        default_system = (
            "You are a helpful assistant that answers questions using chat history, images, and document context."
            "\n\nPRIORITY ORDER:"
            "\n1. Use chat history for questions about previous messages. When asked about previous messages or conversation history, summarize the conversation history clearly."
            "\n2. Analyze user-uploaded images directly for image questions."
            "\n3. Use provided document context only to support explanations."
            "\n\nRULES:"
            "\n- Never quote raw document text when answering."
            "\n- Focus on what is visible in images for image-related queries."
            "\n- Be concise and factual. Add [cN] markers when referencing document context."
            "\n- When answering questions about previous messages or conversation history, provide a clear summary from the chat history."
            "\n- At the end of your answer, provide a confidence score (0.0-1.0) based on how well the provided document context supports your answer. Format: [CONFIDENCE:0.85]"
        )

        # --- Build messages ---
        messages = []
        
        # Check if chat history contains system message
        system_message_found = False
        system_content = default_system
        
        if chat_history:
            print(f"[DEBUG] Checking {len(chat_history)} chat history messages for system message...")
            for msg in chat_history:
                if isinstance(msg, dict) and "role" in msg and "content" in msg:
                    if msg["role"] == "system":
                        # Use system message from history
                        system_content = msg["content"]
                        system_message_found = True
                        print(f"[DEBUG] Found system message in chat history")
                        break
        
        # Add system message (from history or default)
        messages.append({"role": "system", "content": system_content})
        if system_message_found:
            print(f"[DEBUG] Using system message from chat history")
        else:
            print(f"[DEBUG] Using default system prompt (no system message in history)")
        
        # Add chat history messages (excluding system since we already added it)
        if chat_history:
            user_msgs = 0
            assistant_msgs = 0
            print(f"[DEBUG] Adding chat history messages (excluding system)...")
            for msg in chat_history:
                if isinstance(msg, dict) and "role" in msg and "content" in msg:
                    # Skip system message since we already added it above
                    if msg["role"] == "system":
                        continue
                    messages.append({"role": msg["role"], "content": msg["content"]})
                    if msg["role"] == "user":
                        user_msgs += 1
                    elif msg["role"] == "assistant":
                        assistant_msgs += 1
            print(f"[DEBUG] Added to OpenAI messages: {user_msgs} user, {assistant_msgs} assistant messages")

        # Prepare image list
        query_images_to_process = []
        if query_images:
            query_images_to_process.extend(query_images)
        elif query_image:
            query_images_to_process.append(query_image)

        # --- Plain text case ---
        plain_text_only = all(isinstance(c, str) for c in contexts)
        has_query_images = len(query_images_to_process) > 0
        print(f"[DEBUG] Processing {len(contexts)} contexts for plain text generation")
        
        if plain_text_only and not has_query_images:
            # Detect if question is simple greeting/casual chat that doesn't need document context
            question_lower = question.lower().strip()
            simple_greetings = ['hi', 'hello', 'hey', 'thanks', 'thank you', 'bye', 'goodbye', 'ok', 'okay', 'yes', 'no']
            is_simple_greeting = question_lower in simple_greetings or (len(question_lower.split()) <= 2 and question_lower in ['how are you', 'what\'s up', 'whats up'])
            
            if is_simple_greeting:
                # For simple greetings, answer briefly without using document contexts
                if len(contexts) > 0:
                    prompt = (
                        f"Question: {question}\n\n"
                        "Answer briefly and naturally. This is a simple greeting or casual conversation, so respond in a friendly, concise way without referencing any document contexts. "
                        "Keep your response short (1-2 sentences). Do NOT use the document contexts provided below."
                    )
                else:
                    prompt = (
                        f"Question: {question}\n\n"
                        "Answer briefly and naturally. This is a simple greeting or casual conversation, so respond in a friendly, concise way. "
                        "Keep your response short (1-2 sentences)."
                    )
            elif len(contexts) == 0:
                # No contexts available, answer directly
                prompt = (
                    f"Question: {question}\n\n"
                    "Answer the question directly. No document contexts are available, so provide a helpful response based on general knowledge or chat history."
                )
            else:
                # For substantive questions, use document contexts
                prompt = (
                    f"Answer the question using the {len(contexts)} contexts below. "
                    "IMPORTANT: When you use information from a context, mark it with [cN] where N is the context number (1 to {len(contexts)}). "
                    "If you use information from chat history, mark it with [CHAT_HISTORY]. "
                    "For example: 'Based on context 1 [c1] and previous conversation [CHAT_HISTORY], the answer is...' "
                    "At the end of your answer, provide a confidence score (0.0-1.0) based on how well the provided document context supports your answer. Format: [CONFIDENCE:0.85]\n\n"
                    + "\n\n".join([f"[Context {i+1}]\n{c}" for i, c in enumerate(contexts)])
                    + f"\n\nQuestion: {question}\nAnswer:"
                )
            messages.append({"role": "user", "content": prompt})

            resp = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=0.2,
            )
            if not resp or not resp.choices or len(resp.choices) == 0:
                raise ValueError("OpenAI API returned empty response")
            if not resp.choices[0].message or not resp.choices[0].message.content:
                raise ValueError("OpenAI API returned response with no content")
            answer = resp.choices[0].message.content.strip()
            import re
            citations = [int(m.group(1)) - 1 for m in re.finditer(r"\[c(\d+)\]", answer)]
            
            # Check if chat history was used (marked with [CHAT_HISTORY])
            used_chat_history = bool(re.search(r"\[CHAT_HISTORY\]", answer, re.IGNORECASE))
            # Remove [CHAT_HISTORY] marker from answer (keep it readable)
            answer = re.sub(r"\[CHAT_HISTORY\]", "", answer, flags=re.IGNORECASE).strip()
            
            # Extract confidence score if present
            confidence = None
            confidence_pattern = re.search(r"\[CONFIDENCE:([\d.]+)\]", answer)
            if confidence_pattern:
                try:
                    confidence = float(confidence_pattern.group(1))
                    # Remove confidence marker from answer
                    answer = re.sub(r"\[CONFIDENCE:[\d.]+\]", "", answer).strip()
                except ValueError:
                    pass
            
            # Validate citations - only include citations that exist in contexts
            valid_citations = [c for c in citations if 0 <= c < len(contexts)]
            if len(citations) != len(valid_citations):
                print(f"[WARNING] Found invalid citations: {citations}, valid ones: {valid_citations}")
            
            return {
                "answer": answer, 
                "citations": valid_citations, 
                "confidence": confidence,
                "used_chat_history": used_chat_history
            }

        # --- Multimodal mode ---
        from pathlib import Path
        import base64, mimetypes, re
        print(f"[DEBUG] Processing {len(contexts)} contexts for multimodal generation")

        def to_data_url(path_str: str) -> str:
            p = Path(path_str)
            if not p.exists():
                return ""
            mime, _ = mimetypes.guess_type(str(p))
            mime = mime or "image/png"
            data = base64.b64encode(p.read_bytes()).decode("ascii")
            return f"data:{mime};base64,{data}"

        user_content = [{"type": "text", "text": "Use provided contexts and images to answer."}]

        # Add user query images
        if query_images_to_process:
            for i, img_path in enumerate(query_images_to_process):
                data_url = img_path if img_path.startswith("data:image/") else to_data_url(img_path)
                if not data_url:
                    continue
                user_content.append({"type": "text", "text": f"[User Uploaded Image {i+1}]"})
                user_content.append({"type": "image_url", "image_url": {"url": data_url}})

        # Add contexts and their reference images
        ctx_texts = []
        for i, ctx in enumerate(contexts):
            text = ctx.get("text") if isinstance(ctx, dict) else str(ctx)
            user_content.append({"type": "text", "text": f"[Context {i+1}]\n{text}"})
            ctx_texts.append(text)

        # Attach images from contexts if needed
        def tokenize(s: str):
            s = (s or "").lower()
            s = re.sub(r"[^a-z0-9\s]", " ", s)
            tokens = [t for t in s.split() if t]
            stop = {"the", "a", "of", "and", "or", "to", "in", "for", "on", "by", "with", "as", "is", "are"}
            return [t for t in tokens if t not in stop]

        q_tokens = set(tokenize(question))
        candidates = []
        if self.image_include_all:
            for i, ctx in enumerate(contexts):
                if isinstance(ctx, dict):
                    for img in ctx.get("images", []):
                        candidates.append((i, img))
        else:
            for i, ctx in enumerate(contexts):
                if not isinstance(ctx, dict):
                    continue
                text = ctx.get("text", "")
                t_tokens = set(tokenize(text))
                for img in ctx.get("images", [])[:5]:
                    cap = img.get("caption", "")
                    c_tokens = set(tokenize(cap))
                    score = 2 * len(q_tokens & c_tokens) + len(q_tokens & t_tokens)
                    if score >= self.image_min_score:
                        candidates.append((i, img))

        # Dedup and cap
        seen = set()
        selected = []
        for i, img in candidates:
            path = img.get("data", "")
            if path and path not in seen:
                seen.add(path)
                selected.append((i, img))
            if 0 < self.image_max <= len(selected):
                break

        for i, img in selected:
            data_url = to_data_url(img.get("data", ""))
            if not data_url:
                continue
            cap = img.get("caption", "Figure")
            user_content.append({"type": "text", "text": f"[Reference Image {i+1}] {cap}"})
            user_content.append({"type": "image_url", "image_url": {"url": data_url}})

        user_content.append({"type": "text", "text": f"Question: {question}\nAnswer: (IMPORTANT: When you use information from the {len(contexts)} contexts above, mark it with [cN] where N is the context number (1 to {len(contexts)}). If you use information from chat history, mark it with [CHAT_HISTORY]. For example: 'Based on context 1 [c1] and previous conversation [CHAT_HISTORY], the answer is...' At the end, provide a confidence score [CONFIDENCE:0.85] based on how well the document context supports your answer.)"})
        messages.append({"role": "user", "content": user_content})

        # --- Send request ---
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=0.2,
                timeout=60.0,
            )
        except Exception as e:
            print(f"[ERROR] OpenAI API call failed: {e}")
            raise
        
        if not resp or not resp.choices or len(resp.choices) == 0:
            raise ValueError("OpenAI API returned empty response")
        if not resp.choices[0].message or not resp.choices[0].message.content:
            raise ValueError("OpenAI API returned response with no content")
        
        answer = resp.choices[0].message.content.strip()
        import re
        citations = [int(m.group(1)) - 1 for m in re.finditer(r"\[c(\d+)\]", answer)]
        
        # Check if chat history was used (marked with [CHAT_HISTORY])
        used_chat_history = bool(re.search(r"\[CHAT_HISTORY\]", answer, re.IGNORECASE))
        # Remove [CHAT_HISTORY] marker from answer (keep it readable)
        answer = re.sub(r"\[CHAT_HISTORY\]", "", answer, flags=re.IGNORECASE).strip()
        
        # Extract confidence score if present
        confidence = None
        confidence_pattern = re.search(r"\[CONFIDENCE:([\d.]+)\]", answer)
        if confidence_pattern:
            try:
                confidence = float(confidence_pattern.group(1))
                # Remove confidence marker from answer
                answer = re.sub(r"\[CONFIDENCE:[\d.]+\]", "", answer).strip()
            except ValueError:
                pass
        
        # Validate citations - only include citations that exist in contexts
        valid_citations = [c for c in citations if 0 <= c < len(contexts)]
        if len(citations) != len(valid_citations):
            print(f"[WARNING] Found invalid citations: {citations}, valid ones: {valid_citations}")
        
        return {
            "answer": answer, 
            "citations": valid_citations, 
            "confidence": confidence,
            "used_chat_history": used_chat_history
        }


# ============================ #
#       OLLAMA GENERATOR       #
# ============================ #
class OllamaGenerator(Generator):
    def __init__(self, model: str = "llama3.1:8b-instruct") -> None:
        import ollama
        self.ollama = ollama
        self.model = model
        self.supports_images = False

    def generate(
        self, question: str, contexts: List[str], max_tokens: int = 512,
        query_image: Optional[str] = None, query_images: Optional[List[str]] = None,
        chat_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        prompt = (
            f"You are a helpful assistant. Answer strictly using the {len(contexts)} contexts. "
            "IMPORTANT: You MUST append [cN] markers where you use contextual info (e.g., [c1], [c2], etc.). "
            f"Each [cN] should correspond to the context number you're referencing (1 to {len(contexts)}). "
            "At the end of your answer, provide a confidence score (0.0-1.0) based on how well the provided document context supports your answer. Format: [CONFIDENCE:0.85]\n\n"
            + "\n\n".join([f"[Context {i+1}]\n{c}" for i, c in enumerate(contexts)])
            + f"\n\nQuestion: {question}\nAnswer:"
        )
        r = self.ollama.chat(model=self.model, messages=[{"role": "user", "content": prompt}],
                             options={"num_predict": max_tokens})
        answer = r["message"]["content"].strip()
        import re
        citations = [int(m.group(1)) - 1 for m in re.finditer(r"\[c(\d+)\]", answer)]
        
        # Extract confidence score if present
        confidence = None
        confidence_pattern = re.search(r"\[CONFIDENCE:([\d.]+)\]", answer)
        if confidence_pattern:
            try:
                confidence = float(confidence_pattern.group(1))
                # Remove confidence marker from answer
                answer = re.sub(r"\[CONFIDENCE:[\d.]+\]", "", answer).strip()
            except ValueError:
                pass
        
        # Validate citations - only include citations that exist in contexts
        valid_citations = [c for c in citations if 0 <= c < len(contexts)]
        if len(citations) != len(valid_citations):
            print(f"[WARNING] Found invalid citations: {citations}, valid ones: {valid_citations}")
        
        return {"answer": answer, "citations": valid_citations, "confidence": confidence}


# ============================ #
#    SIMPLE EXTRACTIVE GEN     #
# ============================ #
class ExtractiveGenerator(Generator):
    def generate(self, question: str, contexts: List[str], max_tokens: int = 512,
                 query_image: Optional[str] = None, query_images: Optional[List[str]] = None,
                 chat_history: Optional[List[Dict[str, str]]] = None) -> str:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np
        sentences = []
        for ctx in contexts:
            sentences.extend([s.strip() for s in ctx.split(". ") if s.strip()])
        if not sentences:
            return "I don't know."
        vec = TfidfVectorizer().fit(sentences + [question])
        sims = cosine_similarity(vec.transform([question]), vec.transform(sentences))[0]
        return sentences[int(np.argmax(sims))]


# ============================ #
#       FACTORY FUNCTION       #
# ============================ #
def get_generator(name: str, *, image_policy: str = "auto") -> Generator:
    if name == "openai":
        include_all = True if image_policy == "all" else False
        return OpenAIGenerator(image_include_all_override=include_all)
    if name == "ollama":
        return OllamaGenerator()
    if name == "extractive":
        return ExtractiveGenerator()
    raise ValueError(f"Unknown generator: {name}")
