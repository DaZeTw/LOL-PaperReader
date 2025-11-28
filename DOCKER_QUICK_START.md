# 🐳 Docker Quick Start - LOL-PaperReader

## ⚡ TL;DR - Just Run This

```bash
# Build (takes 5-10 minutes first time)
docker compose build

# Start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

## 📊 Current Build Status

**Building now...** ⏳

The build process downloads and installs:
1. **Python base image** (Python 3.11) - ~50MB
2. **System dependencies** (gcc, curl, git) - ~100MB
3. **PyTorch CPU** (~200MB) - This takes the longest!
4. **ML libraries** (transformers, sentence-transformers) - ~500MB
5. **Node.js dependencies** - ~300MB

**Total download: ~1.5 GB**
**Expected time: 5-10 minutes**

## 🎯 What Gets Built

### Backend (python-backend)
- FastAPI web server
- PyMuPDF for PDF parsing
- BGE-m3 embeddings model
- OpenAI integration
- Port: 8000

### Frontend (nextjs-app)
- Next.js 15 + React 18
- PDF viewer with skimming mode
- QA interface
- Google OAuth login
- Port: 3000

## ✅ After Build Completes

### 1. Start Services
```bash
docker compose up -d
```

### 2. Watch Logs Until Ready
```bash
docker compose logs -f python-backend
```

**Wait for this message:**
```
✅ Model preloading completed!
INFO:     Application startup complete.
```

### 3. Access Application
- Frontend: **http://localhost:3000**
- Backend API: **http://localhost:8000/docs**

## 🔧 Useful Commands

```bash
# Check status
docker compose ps

# View all logs
docker compose logs -f

# View backend logs only
docker compose logs -f python-backend

# View frontend logs only
docker compose logs -f nextjs-app

# Restart a service
docker compose restart python-backend

# Stop everything
docker compose down

# Stop and remove volumes
docker compose down -v
```

## 🐛 Troubleshooting

### Build Fails
```bash
# Try again with no cache
docker compose build --no-cache

# Or build one at a time
docker compose build python-backend
docker compose build nextjs-app
```

### Port Already in Use
```bash
# Find what's using port 3000 or 8000
netstat -ano | findstr :3000
netstat -ano | findstr :8000

# Kill the process or change ports in docker-compose.yml
```

### Out of Memory
- Increase Docker memory to 8GB in Docker Desktop settings
- Close other applications
- Restart Docker Desktop

### Can't Connect to Backend
```bash
# Check if both services are running
docker compose ps

# Should show:
# nextjs-app       Up
# python-backend   Up

# If not, check logs
docker compose logs python-backend
```

## 📝 Testing Checklist

After services start:

- [ ] Open http://localhost:3000
- [ ] Login with Google account
- [ ] Upload a PDF file
- [ ] Wait for "Model preloading completed!" in logs
- [ ] Try skimming mode (toggle button in PDF viewer)
- [ ] Ask a question in QA sidebar
- [ ] Verify answer with citations

## 🎨 Features to Test

### Skimming Mode (NEW!)
1. Upload PDF
2. Click "Skimming" toggle in toolbar
3. See sections grouped by title
4. Expand sections to see full text
5. Click "Jump" to navigate to page
6. Keyboard shortcuts:
   - `E` - Expand all
   - `C` - Collapse all

### QA Mode
1. Upload PDF
2. Wait for embedding to complete (~500s for 20-page PDF)
3. Ask questions in sidebar
4. Get answers with citations
5. Click citation to see source

## 🚀 Performance Tips

- **First upload is slow** (500s for embeddings) - be patient!
- **Subsequent uploads** use cache if same PDF
- **Multiple PDFs** - backend caches each separately
- **Restart backend** preserves cache (in .pipeline_cache/)

## 📦 What's Running

```bash
docker compose ps
```

Should show:
```
NAME                 STATUS    PORTS
nextjs-app           Up        0.0.0.0:3000->3000/tcp
python-backend       Up        0.0.0.0:8000->8000/tcp
```

## 🛑 Stop Everything

```bash
# Stop containers (preserves data)
docker compose stop

# Stop and remove containers (preserves images)
docker compose down

# Full cleanup (removes everything)
docker compose down -v --rmi all
```

## 💾 Data Persistence

**What's preserved between restarts:**
- ✅ Embedded chunks cache (`.pipeline_cache/`)
- ✅ Parsed PDFs (`parsed_data/`)
- ✅ Environment variables (`.env`)

**What's lost:**
- ❌ Chat history (stored in browser localStorage)
- ❌ Uploaded files in container (volume not mounted)

## 🔐 Security Notes

- `.env` contains sensitive keys - **do not commit to git**
- OpenAI API key is required
- Google OAuth credentials required for login
- Backend has no authentication - **do not expose to internet**

## 📖 Full Documentation

- **Detailed Guide**: DOCKER_BUILD_GUIDE.md
- **Skimming Mode**: SKIMMING_MODE_FINAL.md
- **Architecture**: CLAUDE.md

---

**Current Build Status:** Check with `docker compose build` output above ⬆️

**Need Help?** Check DOCKER_BUILD_GUIDE.md for full troubleshooting guide.
