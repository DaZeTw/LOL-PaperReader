from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from paperreader.api import pdf_routes  # import your router module

app = FastAPI(
    title="LOL PaperReader API",
    description="FastAPI backend for parsing and querying academic PDFs.",
    version="0.1.0",
)

# CORS (allow all for now, restrict later)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change this to frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(pdf_routes.router, prefix="/api/pdf", tags=["PDF"])


@app.get("/")
def read_root():
    return {"message": "Welcome to LOL PaperReader Backend 🚀"}
