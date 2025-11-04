
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
