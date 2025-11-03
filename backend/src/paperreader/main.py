import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Import routers
from paperreader.api import pdf_routes  # main backend routes
from paperreader.api.routes import router as qa_router  # QA RAG routes
from paperreader.api.chat_routes import router as chat_router  # Chat routes
# from paperreader.api.chat_embedding_routes import router as chat_embedding_router  # Chat embedding routes (removed as unused)

# Import database connection
from paperreader.database.mongodb import mongodb
from paperreader.services.qa.embeddings import get_embedder
from paperreader.services.qa.pipeline import get_pipeline
from paperreader.services.qa.config import PipelineConfig

load_dotenv()


if "OPENAI_API_KEY" not in os.environ:
    raise ValueError("Missing OPENAI_API_KEY in environment!")


def create_app() -> FastAPI:
    app = FastAPI(
        title="LOL PaperReader API",
        description="FastAPI backend for parsing and querying academic PDFs and QA RAG features.",
        version="0.1.0",
    )

    # ------------------------
    # Middleware: CORS
    # ------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Change to frontend URL in production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ------------------------
    # Routers
    # ------------------------
    app.include_router(pdf_routes.router, prefix="/api/pdf", tags=["PDF"])
    app.include_router(qa_router, prefix="/api/qa", tags=["QA"])
    app.include_router(chat_router, prefix="/api/chat", tags=["Chat"])
    # Chat Embedding API disabled as unused
    # app.include_router(chat_embedding_router, prefix="/api/chat-embedding", tags=["Chat Embedding"])

    # ------------------------
    # Static files (for parsed figures)
    # ------------------------
    static_dir = Path(__file__).resolve().parent / "services" / "parser"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    # ------------------------
    # Startup and Shutdown events
    # ------------------------
    @app.on_event("startup")
    async def startup_event():
        """Initialize database and schedule warmup in background"""
        # Connect to MongoDB immediately and wait for it (blocking)
        # This ensures MongoDB is ready before accepting requests
        print("[STARTUP] Connecting to MongoDB...")
        max_retries = 3
        retry_delay = 2
        for attempt in range(max_retries):
            try:
                await mongodb.connect()
                print("✅ MongoDB connection established on startup")
                break
            except Exception as e:
                print(f"❌ Attempt {attempt + 1}/{max_retries} failed to connect to MongoDB: {e}")
                if attempt < max_retries - 1:
                    print(f"[STARTUP] Retrying in {retry_delay} seconds...")
                    await asyncio.sleep(retry_delay)
                else:
                    print(f"[STARTUP] ⚠️ MongoDB connection failed after {max_retries} attempts")
                    print("[STARTUP] ⚠️ App will start but chat features may not work until MongoDB is available")
                    # Don't raise exception to allow app to start without DB for testing
        
        # Warmup in background so startup is non-blocking
        import asyncio

        async def do_warmup():
            # Preload Visualized_BGE embedder (extend timeout via env if needed)
            try:
                print("[STARTUP] (bg) Preloading Visualized_BGE embedder...")
                embedder = get_embedder(None)
                # CRITICAL: Preload model AND tokenizer to avoid download delay during first chat
                # This triggers both model loading and tokenizer download
                print("[STARTUP] (bg) Triggering model load (this will download tokenizer files if needed)...")
                await asyncio.to_thread(embedder._ensure_model)  # Load model which loads tokenizer
                print("[STARTUP] (bg) Model loaded, now testing embedding...")
                await asyncio.to_thread(embedder.embed, ["warmup"])  # Test embedding works
                print("[STARTUP] (bg) ✅ Embedder fully ready (model + tokenizer)")
            except Exception as e:
                print(f"[STARTUP] (bg) Embedder preload failed (will retry on first use): {e}")
                import traceback
                print(f"[STARTUP] (bg) Traceback: {traceback.format_exc()}")
            
            # Warm QA pipeline with current parsed docs
            try:
                print("[STARTUP] (bg) Building QA pipeline cache...")
                cfg = PipelineConfig()
                await get_pipeline(cfg)
                print("[STARTUP] (bg) QA pipeline ready")
            except Exception as e:
                print(f"[STARTUP] (bg) QA pipeline warm-up failed (will build on first request): {e}")

        asyncio.create_task(do_warmup())

    @app.on_event("shutdown")
    async def shutdown_event():
        """Close database connection on shutdown"""
        try:
            await mongodb.disconnect()
            print("✅ MongoDB connection closed")
        except Exception as e:
            print(f"❌ Error closing MongoDB connection: {e}")

    # ------------------------
    # Health and Root routes
    # ------------------------
    @app.get("/health", tags=["System"])
    def health():
        return {"status": "ok"}

    @app.get("/", tags=["System"])
    def read_root():
        return {"message": "Welcome to LOL PaperReader Backend 🚀"}

    return app


# Create the FastAPI instance
app = create_app()
