import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Import routers
from paperreader.api import pdf_routes  # main backend routes
from paperreader.api.routes import router as qa_router  # QA RAG routes

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

    # ------------------------
    # Static files (for parsed figures)
    # ------------------------
    static_dir = Path(__file__).resolve().parent / "services" / "parser"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

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
