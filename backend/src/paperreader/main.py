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

# Import database connection
from paperreader.database.mongodb import mongodb

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
        """Initialize database connection on startup"""
        try:
            await mongodb.connect()
            print("✅ MongoDB connection established")
        except Exception as e:
            print(f"❌ Failed to connect to MongoDB: {e}")
            # Don't raise exception to allow app to start without DB for testing

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
