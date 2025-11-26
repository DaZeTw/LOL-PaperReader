
## Prerequisites

- Docker and Docker Compose installed on your system
- OpenAI API key
- For visual embeddings: Download the BGE-Visualized model

## Step-by-Step Setup

### 1. Add Your OpenAI API Key

Edit the `docker-compose.yml` file and update the `OPENAI_API_KEY` environment variable:

```yaml
environment:
  OPENAI_API_KEY: sk-yourkeyhere
```

Replace `sk-yourkeyhere` with your actual OpenAI API key.

**Location:** `docker-compose.yml`

### 1b. Configure Google OAuth and Auth Secrets

Update your `.env` file (or the environment block in `docker-compose.yml`) with the following values to enable Google OAuth via the FastAPI backend:

```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
AUTH_JWT_SECRET=super-secure-random-string
FASTAPI_SESSION_SECRET=another-secure-random-string
FRONTEND_URL=http://localhost:3000
```

Optional overrides are available for cookie behaviour:

```
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAMESITE=lax
AUTH_COOKIE_DOMAIN=
AUTH_TOKEN_TTL_MINUTES=10080
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_SAMESITE=lax
```

These defaults work for local development. For production, ensure you use HTTPS and set `*_SECURE=true` with appropriate cookie domains.

### 2. Setup Visual Embeddings

To use visual embeddings for enhanced document understanding:

1. **Download the model file:**
   - Download from: https://huggingface.co/BAAI/bge-visualized/resolve/main/Visualized_m3.pth?download=true

2. **Place the model file:**
   - Save the downloaded `Visualized_m3.pth` file in: `backend\src\`
   - The full path should be: `backend\src\Visualized_m3.pth`

### 3. Build and Run the Application

1. **Build the Docker containers:**
   ```bash
   docker compose build
   ```

2. **Start the services in detached mode:**
   ```bash
   docker compose up -d
   ```

### 4. Access the Application

Once the services are running, you can access:

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000

### 5. Wait for Model Initialization

After starting the services, check the backend logs to ensure models are loaded:

```bash
docker compose logs python-backend
```

**Important:** Wait until you see the following message in the logs:
```
✅ Model preloading completed!
```

Only proceed to upload PDFs after seeing this message. The application needs the embedding models to be fully loaded before processing documents.

## Important Notes

### PDF Upload and Embedding Process

When uploading a PDF file:

1. **After PDF parsing completes:** The system will log that PDF parsing is finished. However, this does NOT mean the process is complete.

2. **Embedding process:** The system still needs to embed all document chunks, which can take approximately **500 seconds** for large PDFs.

3. **⚠️ DO NOT:**
   - Upload the file again
   - Reload/refresh the page
   - Stop the backend service

4. **✅ DO:**
   - Wait patiently for the embedding process to complete
   - Monitor the backend logs for the embedding success message
   - Keep the page open and let the process finish

The embedding process runs in the background and may appear stuck, but it is processing. Reloading or re-uploading will interrupt the process and require starting over.


# Hướng dẫn khởi động bằng Docker

## Chuẩn bị lần đầu

```
docker compose down -v            # đảm bảo không còn volume/node_modules cũ
docker compose build nextjs-app   # build image, cache sẵn node_modules
```

## Thông tin liên quan

- Frontend (Next.js): http://localhost:3000
- Backend FastAPI: http://localhost:8000
- pgAdmin (Postgres UI): http://localhost:5050
- Mongo Express (MongoDB UI): http://localhost:8081
- MinIO Console: http://localhost:9001
- Elasticsearch: http://localhost:9200
- Elasticsearch - UI: http://localhost:5601


## Xem bảng `users` trong pgAdmin

1. Trên panel trái, mở `Servers`. Nếu chưa có kết nối, chuột phải chọn `Register → Server…` và điền:
   - **Name:** tuỳ chọn (ví dụ `PaperReader`)
   - **Connection → Host name/address:** `postgres`
   - **Port:** `5432`
   - **Maintenance database:** `paperreader`
   - **Username:** 
   - **Password:** (thông tin bạn cấu hình)

2. Sau khi kết nối thành công, mở cây: `PaperReader → Databases → paperreader → Schemas → public → Tables`. Bảng `users` được tạo từ script `backend/init-db.sql` sẽ nằm ở đây.

3. Để xem dữ liệu:
   - Chuột phải vào bảng `users`
   - Chọn `View/Edit Data → All Rows` (hoặc biểu tượng kính lúp trên toolbar)

4. Nếu cần xem cấu trúc bảng, sử dụng các tab `Columns` hoặc `SQL` trong pgAdmin.

