# Troubleshooting Guide

## Common Issues

### 1. Dependency conflict: pandas version

**Problem:** `docling` requires `pandas>=2.1.4` but you may have specified `pandas==2.1.3`.

**Solution:** Đã cập nhật requirements.txt với `pandas>=2.1.4,<3.0.0`. Nếu vẫn lỗi:
```bash
pip install "pandas>=2.1.4,<3.0.0"
```

### 2. ModuleNotFoundError: No module named 'docling' or 'docling_core'

**Problem:** Package `docling` có thể có tên khác hoặc cần cài từ source khác.

**Solutions:**

1. **Thử các tên package khác:**
   ```bash
   pip install ibm-docling ibm-docling-core
   # hoặc
   pip install docling[all]
   ```

2. **Nếu docling không có trên PyPI, cài từ Git:**
   ```bash
   pip install git+https://github.com/IBM/docling.git
   pip install git+https://github.com/IBM/docling-core.git
   ```

3. **Hoặc cài từ wheel file nếu có**

4. **Nếu vẫn không được, tạm thời comment imports trong `pdf_parser.py`** và sử dụng parser khác.

### 3. Dependency conflict: torch version

**Problem:** `docling` requires `torch>=2.2.2` but you may have specified `torch==2.1.0`.

**Solution:** Đã cập nhật requirements.txt với `torch>=2.2.2,<3.0.0` để tương thích với docling. Nếu vẫn lỗi:
```bash
# For CPU only (smaller, faster install)
pip install "torch>=2.2.2,<3.0.0" --index-url https://download.pytorch.org/whl/cpu

# For GPU support
pip install "torch>=2.2.2,<3.0.0"
```

### 4. Dependency conflict: pydantic version

**Problem:** `docling-core` requires `pydantic>=2.6.0` but you may have specified `pydantic==2.5.0`.

**Solution:** Đã cập nhật requirements.txt với `pydantic>=2.6.0,<3.0.0`. Nếu vẫn lỗi:
```bash
pip install "pydantic>=2.6.0,<3.0.0"
```

### 5. ImportError với transformers

**Solution:** Đã thêm `transformers==4.35.0`. Nếu lỗi version:
```bash
pip install transformers>=4.30.0
```

### 5. MongoDB connection issues

**Check:**
- MongoDB container đang chạy: `docker compose ps`
- MONGODB_URL trong docker-compose.yml đúng: `mongodb://mongodb:27017/paperreader`
- Logs: `docker compose logs mongodb`

### 6. Backend không start

**Check:**
- OPENAI_API_KEY đã set trong docker-compose.yml
- Xem logs: `docker compose logs python-backend`
- Kiểm tra health: `curl http://localhost:8000/health`

### 7. Build Docker image chậm

**Tip:** Các dependencies như torch và transformers rất lớn. Lần đầu build có thể mất 10-20 phút. Hãy kiên nhẫn!

### 8. Out of memory khi build

**Solution:** Tăng Docker memory limit hoặc build từng dependency:
```dockerfile
# Build Dockerfile với multi-stage để tối ưu
```

## Kiểm tra dependencies

Để kiểm tra package nào thiếu:

```bash
# Vào container backend
docker compose exec python-backend bash

# Chạy Python và thử import
python -c "import pandas; print('pandas OK')"
python -c "import docling; print('docling OK')"
python -c "import torch; print('torch OK')"
```

## Update requirements

Sau khi fix lỗi, cập nhật `requirements.txt` với package và version đúng đã cài được.
