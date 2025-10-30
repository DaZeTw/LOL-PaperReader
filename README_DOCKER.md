# Docker Setup Guide

## Quick Start

1. **Clone and setup:**
   ```bash
   git clone <repository>
   cd LOL-PaperReader
   ```

2. **Set your OpenAI API key:**
   ```bash
   # Edit docker-compose.yml and replace the OPENAI_API_KEY value
   # Or create .env file with your key
   ```

3. **Run with Docker Compose:**
   ```bash
   docker compose up --build
   ```

4. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - MongoDB: localhost:27017

## Services

### Frontend (Next.js)
- **Port:** 3000
- **Environment:** Production
- **Backend URL:** http://python-backend:8000 (internal Docker network)

### Backend (Python FastAPI)
- **Port:** 8000
- **Environment Variables:**
  - `OPENAI_API_KEY`: Your OpenAI API key
  - `MONGODB_URL`: MongoDB connection string
- **Health Check:** http://localhost:8000/health

### Database (MongoDB)
- **Port:** 27017
- **Data Volume:** `mongodb_data`
- **Database:** paperreader

## Environment Variables

Create `.env` file for local development:
```env
OPENAI_API_KEY=your_openai_api_key_here
MONGODB_URL=mongodb://localhost:27017/paperreader
```

## Troubleshooting

### Backend not starting
- Check if OPENAI_API_KEY is set correctly
- Verify MongoDB is running
- Check logs: `docker compose logs python-backend`

### Frontend can't connect to backend
- Ensure both services are in the same Docker network
- Check BACKEND_URL environment variable
- Verify backend is healthy: `curl http://localhost:8000/health`

### MongoDB connection issues
- Check if MongoDB container is running
- Verify MONGODB_URL format
- Check logs: `docker compose logs mongodb`

## Development

For local development without Docker:
1. Start MongoDB locally
2. Set environment variables
3. Run backend: `cd backend && uvicorn src.paperreader.main:app --reload`
4. Run frontend: `npm run dev`
