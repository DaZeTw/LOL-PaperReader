from fastapi import FastAPI
from .routes import qa


def create_app() -> FastAPI:
    app = FastAPI(title="PDF QA RAG")

    app.include_router(qa.router, prefix="/api/qa", tags=["qa"])

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
