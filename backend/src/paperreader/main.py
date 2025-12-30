import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from paperreader.api import pdf_routes  # main backend routes
from paperreader.api import websocket_routes  # WebSocket routes
from paperreader.api import reference_routes

# Import routers
from paperreader.api.auth_routes import router as auth_router  # Auth routes
from paperreader.api.chat_routes import router as chat_router  # Chat routes
from paperreader.api.collections_routes import (
    router as collections_router,  # Collection routes
)
from paperreader.api.documents_routes import (
    router as documents_router,  # Document routes
)
from paperreader.api.pdf_proxy import (
    router as pdf_proxy_router,  # PDF proxy for fetching reference papers
)
from paperreader.api.routes import router as qa_router  # QA RAG routes
from paperreader.api.skimming_routes import (
    router as skimming_router,  # Skimming/highlighting routes
)
from paperreader.api.summary_routes import (
    router as summary_router,  # Paper summarization routes
)
from paperreader.api.taxonomy_routes import (
    router as taxonomy_router,  # Taxonomy/keyword concept routes
)
from paperreader.api.annotation_routes import (
    router as annotation_router,  # User annotations routes
)
from paperreader.database.mongodb import mongodb
from paperreader.database.postgres import close_postgres_pool, init_postgres_pool
from paperreader.services.qa.embeddings import get_embedder
from paperreader.services.skimming.repository import create_skimming_indexes
from paperreader.services.annotations.repository import create_annotation_indexes
from starlette.middleware.sessions import SessionMiddleware

# from paperreader.api.chat_embedding_routes import router as chat_embedding_router  # Chat embedding routes (removed as unused)

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
    frontend_origin = os.getenv("FRONTEND_URL", "http://localhost:3000")
    additional_origins = [
        origin.strip()
        for origin in os.getenv("CORS_ADDITIONAL_ORIGINS", "").split(",")
        if origin.strip()
    ]
    origins = {frontend_origin.rstrip("/")}
    origins.update(additional_origins)
    origins.add("http://127.0.0.1:3000")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    session_secret = os.getenv("FASTAPI_SESSION_SECRET") or os.getenv("AUTH_JWT_SECRET")
    if not session_secret:
        raise ValueError(
            "Missing FASTAPI_SESSION_SECRET or AUTH_JWT_SECRET for session middleware"
        )

    app.add_middleware(
        SessionMiddleware,
        secret_key=session_secret,
        same_site=os.getenv("SESSION_COOKIE_SAMESITE", "lax"),
        https_only=os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true",
    )

    # ------------------------
    # Routers
    # ------------------------
    app.include_router(auth_router)
    app.include_router(
        websocket_routes.router, tags=["WebSocket"]
    )  # WebSocket at root level
    app.include_router(pdf_routes.router, prefix="/api/pdf", tags=["PDF"])
    app.include_router(
        pdf_proxy_router, tags=["PDF Proxy"]
    )  # No prefix - router already has /api/pdf prefix
    app.include_router(qa_router, prefix="/api/qa", tags=["QA"])
    app.include_router(chat_router, prefix="/api/chat", tags=["Chat"])
    app.include_router(skimming_router, prefix="/api/skimming", tags=["Skimming"])
    app.include_router(summary_router, prefix="/api/summary", tags=["Summary"])
    app.include_router(
        taxonomy_router
    )  # Taxonomy routes (already has /api/taxonomy prefix)
    app.include_router(annotation_router, prefix="/api/annotations", tags=["Annotations"])
    app.include_router(reference_routes.router, prefix="/api")
    app.include_router(documents_router)
    app.include_router(collections_router)
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
        """Initialize database connections and preload embedder model."""
        await mongodb.connect()
        await init_postgres_pool()

        # Create indexes for skimming collections
        try:
            await create_skimming_indexes()
        except Exception as e:
            print(f"[STARTUP] Warning: Failed to create skimming indexes: {e}")
            import traceback

            print(f"[STARTUP] Traceback: {traceback.format_exc()}")
        
        # Create indexes for user annotations collection
        try:
            await create_annotation_indexes()
        except Exception as e:
            print(f"[STARTUP] Warning: Failed to create annotation indexes: {e}")
            import traceback

            print(f"[STARTUP] Traceback: {traceback.format_exc()}")

        # Preload Visualized_BGE embedder model in background (non-blocking)
        # NOTE: Warmup disabled because it blocks the event loop during model loading
        # Models will be loaded lazily on first use instead
        import asyncio

        async def do_warmup():
            try:
                print("[STARTUP] (bg) Preloading Visualized_BGE embedder...")
                embedder = get_embedder(None)
                # CRITICAL: Preload model AND tokenizer to avoid download delay during first chunking
                print(
                    "[STARTUP] (bg) Triggering model load (this will download tokenizer files if needed)..."
                )
                await asyncio.to_thread(
                    embedder._ensure_model
                )  # Load model which loads tokenizer
                print("[STARTUP] (bg) Model loaded, now testing embedding...")
                await asyncio.to_thread(
                    embedder.embed, ["warmup"]
                )  # Test embedding works
                print("[STARTUP] (bg) ✅ Embedder fully ready (model + tokenizer)")
            except Exception as e:
                print(
                    f"[STARTUP] (bg) Embedder preload failed (will retry on first use): {e}"
                )
                import traceback

                print(f"[STARTUP] (bg) Traceback: {traceback.format_exc()}")

        # DISABLED: Warmup blocks the event loop and prevents server from responding
        asyncio.create_task(do_warmup())
        #print("[STARTUP] Embedder warmup disabled - models will load on first use")

    @app.on_event("shutdown")
    async def shutdown_event():
        """Cleanup on shutdown"""
        print("✅ Shutting down application")
        await mongodb.disconnect()
        await close_postgres_pool()

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
