# Docker Build & Run Guide

## Prerequisites

✅ **Required:**
- Docker Desktop installed and running
- Docker Compose installed (included with Docker Desktop)
- At least 8GB RAM available
- 10GB free disk space

✅ **Required API Keys (Already in .env):**
- OpenAI API Key ✓
- Google OAuth credentials ✓
- Auth secret ✓

## Quick Start (3 Steps)

### Step 1: Verify .env File

Your `.env` file is already configured with:
- ✅ OpenAI API Key
- ✅ Google OAuth (Client ID & Secret)
- ✅ Auth Secret
- ✅ NextAuth URL

**No changes needed!** Just make sure the file exists.

### Step 2: (Optional) Download Visual Embedding Model

For enhanced PDF visual understanding, download the BGE-Visualized model:

```bash
# Download from HuggingFace (optional but recommended)
# URL: https://huggingface.co/BAAI/bge-visualized/resolve/main/Visualized_m3.pth
# Save to: backend/src/Visualized_m3.pth
```

**Note:** The app works without this, but visual embeddings enhance understanding of figures/charts.

### Step 3: Build and Run

Open terminal in project root and run:

```bash
# Build all containers (this will take 5-10 minutes first time)
docker compose build

# Start all services
docker compose up -d

# View logs to monitor startup
docker compose logs -f
```

## What Gets Built

### Frontend (Next.js)
- Service name: `nextjs-app`
- Port: `3000`
- Build time: ~3-5 minutes
- Features:
  - Next.js 15 with React 18
  - PDF viewer with skimming mode
  - QA interface
  - Google OAuth login

### Backend (FastAPI + Python)
- Service name: `python-backend`
- Port: `8000`
- Build time: ~5-8 minutes (downloads PyTorch, transformers, etc.)
- Features:
  - PDF parsing (PyMuPDF)
  - Text embeddings (BGE-m3)
  - Visual embeddings (optional)
  - OpenAI integration
  - Chunking & retrieval

## Step-by-Step Build Process

### 1. Clean Build (Recommended First Time)

```bash
# Remove old containers and images
docker compose down -v
docker system prune -f

# Build from scratch
docker compose build --no-cache

# Start services
docker compose up -d
```

### 2. Monitor Build Progress

```bash
# Watch all logs
docker compose logs -f

# Watch only backend (to see model loading)
docker compose logs -f python-backend

# Watch only frontend
docker compose logs -f nextjs-app
```

### 3. Wait for "Ready" Messages

**Backend Ready When You See:**
```
✅ Model preloading completed!
INFO:     Application startup complete.
```

**Frontend Ready When You See:**
```
✓ Ready in X.Xs
```

## Access the Application

Once both services show "Ready":

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## Common Commands

### Build & Run
```bash
# Build all services
docker compose build

# Build specific service
docker compose build nextjs-app
docker compose build python-backend

# Start all services (detached)
docker compose up -d

# Start with logs visible
docker compose up

# Start specific service
docker compose up nextjs-app
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f python-backend
docker compose logs -f nextjs-app

# Last 100 lines
docker compose logs --tail=100
```

### Stop & Restart
```bash
# Stop all services
docker compose stop

# Stop specific service
docker compose stop python-backend

# Restart all
docker compose restart

# Restart specific service
docker compose restart python-backend
```

### Clean Up
```bash
# Stop and remove containers
docker compose down

# Stop and remove containers + volumes
docker compose down -v

# Remove images too
docker compose down --rmi all

# Full cleanup (nuclear option)
docker compose down -v --rmi all
docker system prune -af --volumes
```

## Troubleshooting

### Issue 1: Port Already in Use

**Error:**
```
Error: bind: address already in use
```

**Solution:**
```bash
# Check what's using the port
netstat -ano | findstr :3000
netstat -ano | findstr :8000

# Kill the process or change ports in docker-compose.yml
```

### Issue 2: Build Fails - Out of Memory

**Error:**
```
ERROR: failed to solve: executor failed
```

**Solution:**
- Increase Docker memory limit to 8GB in Docker Desktop settings
- Close other applications
- Try building one service at a time:
```bash
docker compose build python-backend
docker compose build nextjs-app
```

### Issue 3: Backend Container Crashes

**Check Logs:**
```bash
docker compose logs python-backend
```

**Common Issues:**
- Missing OpenAI API key → Check `.env` file
- Out of memory → Increase Docker RAM
- Model download failed → Check internet connection

**Restart:**
```bash
docker compose restart python-backend
```

### Issue 4: Frontend Can't Connect to Backend

**Error in browser:**
```
Failed to fetch chunks from backend
```

**Solution:**
```bash
# Check if backend is running
docker compose ps

# Check backend logs
docker compose logs python-backend

# Restart both services
docker compose restart
```

### Issue 5: Changes Not Reflected

**Frontend changes not showing:**
```bash
# Rebuild frontend
docker compose build nextjs-app
docker compose restart nextjs-app
```

**Backend changes not showing:**
```bash
# Backend has volume mount, just restart
docker compose restart python-backend

# If still not working, rebuild
docker compose build python-backend
docker compose restart python-backend
```

## Development Mode

The docker-compose.yml is configured for development with:

- **Hot Reload**: Both services reload on code changes
- **Volume Mounts**: Your code is mounted, no rebuild needed for most changes
- **Debug Logs**: Verbose logging enabled

### Frontend Hot Reload
- Files mounted: `.:/app` (entire project)
- Changes to `.tsx`, `.ts`, `.css` reload automatically
- No rebuild needed

### Backend Hot Reload
- Files mounted: `./backend/src:/app/src`
- Changes to `.py` files reload automatically (uvicorn --reload)
- No rebuild needed

## Production Build

For production deployment:

```bash
# Use production Dockerfile target
docker compose -f docker-compose.prod.yml build

# Or modify docker-compose.yml:
# Change: target: base
# To: target: production
```

## Resource Usage

Expected resource usage:

### During Build:
- CPU: High (80-100%)
- RAM: 4-6 GB
- Disk: ~5 GB download
- Time: 8-15 minutes

### During Runtime:
- CPU: Medium (20-40% when processing PDFs)
- RAM: 3-4 GB total
  - Frontend: ~200 MB
  - Backend: 2-3 GB (model loaded in memory)
- Disk: ~5 GB

## Testing the Setup

### 1. Check Services Running
```bash
docker compose ps
```

Should show both services as "Up":
```
NAME                STATUS
nextjs-app          Up
python-backend      Up
```

### 2. Check Frontend
```bash
curl http://localhost:3000
# Should return HTML
```

### 3. Check Backend
```bash
curl http://localhost:8000/health
# Should return: {"status":"healthy"}
```

### 4. Test PDF Upload
1. Open http://localhost:3000
2. Login with Google
3. Upload a PDF
4. Wait for "✅ Model preloading completed!" in backend logs
5. Try asking questions

## Viewing Inside Containers

### Execute Commands in Running Container
```bash
# Backend shell
docker compose exec python-backend bash

# Check Python version
docker compose exec python-backend python --version

# List installed packages
docker compose exec python-backend pip list

# Frontend shell
docker compose exec nextjs-app sh

# Check Node version
docker compose exec nextjs-app node --version
```

## Docker Compose File Structure

```yaml
services:
  nextjs-app:           # Frontend Next.js
    build: .            # Uses root Dockerfile
    ports: 3000:3000    # Maps port 3000
    depends_on:
      - python-backend  # Waits for backend

  python-backend:       # Backend FastAPI
    build: ./backend    # Uses backend/Dockerfile
    ports: 8000:8000    # Maps port 8000
    volumes:
      - ./backend/src:/app/src  # Hot reload
```

## Environment Variables

All environment variables are in `.env`:

```bash
# OpenAI (Required)
OPENAI_API_KEY=sk-proj-...

# NextAuth (Required)
AUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Backend URL (Auto-configured)
BACKEND_URL=http://python-backend:8000
```

## Next Steps

Once running successfully:

1. **Upload a PDF** at http://localhost:3000
2. **Wait for processing** (check backend logs for progress)
3. **Try Skimming Mode** (toggle button in PDF viewer)
4. **Ask Questions** (QA sidebar)

## Getting Help

If you encounter issues:

1. Check logs: `docker compose logs -f`
2. Verify `.env` file exists with valid keys
3. Ensure Docker has enough resources (8GB RAM)
4. Try clean rebuild: `docker compose down -v && docker compose build --no-cache`

---

**Quick Reference:**

```bash
# Start
docker compose up -d

# Stop
docker compose down

# Rebuild
docker compose build --no-cache

# Logs
docker compose logs -f

# Status
docker compose ps
```
