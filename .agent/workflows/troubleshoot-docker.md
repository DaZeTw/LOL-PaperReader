---
description: Troubleshoot when the app is stuck loading or not responding
---

# Troubleshooting Docker App Issues

## Quick Fix Commands

When the app is stuck loading, run these commands in order:

### 1. Check container status
// turbo
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```
Look for containers marked as "unhealthy" or "Exited".

### 2. Check backend logs for errors
// turbo
```bash
docker logs lol-paperreader-python-backend-1 --tail 30
```
Look for Python errors, connection issues, or "Reloading..." messages.

### 3. Test if backend is responding
// turbo
```bash
curl -s http://localhost:8010/health --max-time 5
```
Should return: `{"status":"ok"}`

### 4. Restart the backend (most common fix)
```bash
docker restart lol-paperreader-python-backend-1
```
Wait 15-20 seconds, then refresh browser.

### 5. Restart frontend
```bash
docker restart lol-paperreader-nextjs-app-1
```

### 6. Restart all services (nuclear option)
```bash
docker compose restart
```

## Common Issues & Fixes

### Issue: "Loading..." forever on frontend
**Cause**: Backend not responding or connection issue
**Fix**: 
```bash
docker restart lol-paperreader-python-backend-1
# Wait 20 seconds, then refresh browser
```

### Issue: Backend shows "unhealthy"
**Cause**: Backend server crashed or is blocked
**Fix**:
```bash
docker restart lol-paperreader-python-backend-1
```

### Issue: CORS errors in browser console
**Cause**: Backend not running or wrong URL configuration  
**Fix**: Ensure `BACKEND_URL=http://python-backend:8000` in docker-compose.yml (NOT 8010)

### Issue: "Session initialization failed"
**Cause**: Backend API not responding
**Fix**: Restart backend and refresh browser

### Issue: References extraction fails
**Cause**: GROBID service not ready
**Fix**:
```bash
docker restart paperreader-grobid
# Wait 60 seconds for GROBID to start
```

### Issue: After code changes, app stops working
**Cause**: Backend auto-reload got stuck
**Fix**: 
```bash
docker restart lol-paperreader-python-backend-1
```

## Full Reset (if nothing else works)

```bash
# Stop everything
docker compose down

# Start everything fresh
docker compose up -d

# Watch logs to ensure startup completes
docker logs -f lol-paperreader-python-backend-1
```

## Service URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8010 |
| Backend Health | http://localhost:8010/health |
| API Docs | http://localhost:8010/docs |
| pgAdmin | http://localhost:5050 |
| Mongo Express | http://localhost:8081 |
| MinIO Console | http://localhost:9101 |
| Kibana | http://localhost:5601 |
| GROBID | http://localhost:8070 |
