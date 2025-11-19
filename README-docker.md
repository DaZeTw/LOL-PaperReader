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

