# ===========================================
# Backend Python FastAPI Dockerfile (optimized)
# ===========================================
FROM python:3.11-slim

WORKDIR /app

# ---- 1. Install system dependencies ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ curl git \
    && rm -rf /var/lib/apt/lists/*

# ---- 2. Copy requirements first for caching ----
COPY requirements.txt .

# ---- 3. Install dependencies in logical layers ----
# Core + DB + Utils (light layers)
RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    starlette==0.27.0 \
    "uvicorn[standard]==0.24.0" \
    python-multipart==0.0.6 \
    python-dotenv==1.0.0 \
    "pydantic>=2.0.0,<3.0.0" \
    "requests>=2.31.0" \
    pathlib2==2.3.7 \
    motor==3.3.2 \
    pymongo==4.6.0 \
    "elasticsearch==8.11.0" \
    minio==7.2.7 \
    asyncpg==0.29.0 \
    Authlib==1.3.2 \
    PyJWT==2.9.0 \
    itsdangerous==2.1.2 \
    "lxml>=4.9.0" \
    "beautifulsoup4>=4.12.0"

# ---- 4. Heavy ML libs (separate layer to preserve cache) ----
# Use precompiled wheels (avoid source builds)
RUN pip install --no-cache-dir torch==2.2.2+cpu torchvision==0.17.2+cpu \
    --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir --force-reinstall "numpy<2.0.0"

    
# ---- 5. ML/AI packages ----
RUN pip install --no-cache-dir \
    "sentence-transformers==2.2.2" \
    "pandas>=2.0.0,<3.0.0" \
    "numpy<2.0.0" \
    "scikit-learn==1.5.1" \
    "pymupdf>=1.23.0" \
    "Pillow==10.1.0" \
    "einops>=0.7.0" \
    "regex>=2023.10.3" \
    "timm>=0.9.0" \
    "huggingface_hub>=0.19.0" \
    "tqdm>=4.65.0" \
    "openai>=1.47.0,<2.0.0" \
    "httpx>=0.27.0" \
    "pydantic-settings"

RUN pip install --no-cache-dir \
    "transformers==4.40.1" \
    "llama-index" \
    "llama-index-embeddings-huggingface"
RUN pip install --no-cache-dir --force-reinstall "openai>=1.47.0,<2.0.0"
RUN pip install --no-cache-dir ftfy

# ---- 6. Docling and Pydantic AI for paper summarization ----
RUN pip install --no-cache-dir \
    "docling-core>=2.50.0,<3.0.0" \
    "docling>=2.60.0,<3.0.0" \
    "pydantic-ai>=1.27.0"
RUN pip install --no-cache-dir --force-reinstall starlette==0.27.0
RUN pip install --no-cache-dir --force-reinstall "numpy<2.0.0"

# ---- 7. Copy app source code ----
COPY src/ ./src/

# ---- 8. Environment variables ----
# Không hardcode để Docker Compose override được
ENV PYTHONPATH=/app/src
ENV PORT=8000
# Force Elasticsearch client to use API versioning (version 8 compatibility)
ENV ELASTIC_CLIENT_APIVERSIONING=1

# ---- 9. Expose port ----
EXPOSE 8000

# ---- 10. Health check ----
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# ---- 11. Run app ----
CMD ["uvicorn", "paperreader.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
