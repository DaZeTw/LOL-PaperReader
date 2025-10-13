from fastapi import FastAPI
from backend.rag_app.routes import router  # import trực tiếp router từ routes.py

def create_app() -> FastAPI:
    app = FastAPI(title="PDF QA RAG")

    app.include_router(router, prefix="/api/qa", tags=["qa"])

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app

app = create_app()
