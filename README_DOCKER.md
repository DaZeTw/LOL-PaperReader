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
   - Database: MongoDB Atlas (cloud) or local MongoDB if configured

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
- **Type:** MongoDB Atlas (cloud) - recommended for production
- **Alternative:** Local MongoDB (see docker-compose.yml for local setup)
- **Database Name:** paperreader_chat
- **Connection:** Configured via `MONGODB_URL` environment variable

## Environment Variables

### For MongoDB Atlas (Recommended)
Set `MONGODB_URL` in `docker-compose.yml` or create `.env` file:
```env
OPENAI_API_KEY=your_openai_api_key_here
MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/paperreader_chat?retryWrites=true&w=majority
```

### For Local MongoDB (Development)
If using local MongoDB, uncomment the `mongodb` service in `docker-compose.yml`:
```env
OPENAI_API_KEY=your_openai_api_key_here
MONGODB_URL=mongodb://mongodb:27017/paperreader_chat
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
- **For MongoDB Atlas:** 
  - Verify `MONGODB_URL` format: `mongodb+srv://...`
  - Check network access - ensure your IP is whitelisted in Atlas
  - Verify database name is `paperreader_chat`
- **For Local MongoDB:**
  - Uncomment `mongodb` service in docker-compose.yml if needed
  - Check if MongoDB container is running: `docker compose ps`
  - Check logs: `docker compose logs mongodb`
- Verify connection: Check backend logs for MongoDB connection status

## Development

For local development without Docker:
1. Start MongoDB locally
2. Set environment variables
3. Run backend: `cd backend && uvicorn src.paperreader.main:app --reload`
4. Run frontend: `npm run dev`
