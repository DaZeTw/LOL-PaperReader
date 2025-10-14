from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from api.routes import router 

def create_app() -> FastAPI:
    app = FastAPI(title="PDF QA RAG")

    app.include_router(router, prefix="/api/qa", tags=["qa"])

    # Serve static images (parsed figures)
    static_dir = Path(__file__).resolve().parent / "services" / "parser"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app

app = create_app()
