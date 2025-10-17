cd .\backend\src
set OPENAI_API_KEY="sk-..."  
uvicorn paperreader.main:app --reload --host 0.0.0.0 --port 8000
Thư mục ảnh query
Đặt ảnh trong: \backend\src\paperreader\img_query
Cách gọi API có 1 ảnh:
{
  "question": "different of this image and method of this paper",
  "retriever": "hybrid",
  "generator": "openai",
  "image_policy": "auto",
  "top_k": 5,
  "max_tokens": 512,
  "user_images": [
    "./paperreader/img_query/a.png",

  ]
}

Cách gọi API có nhiều ảnh:
{
  "question": "different of this image and method of this paper",
  "retriever": "hybrid",
  "generator": "openai", 
  "image_policy": "auto",
  "top_k": 5,
  "max_tokens": 512,
  "user_images": [
    "./paperreader/img_query/a.png",
    "./paperreader/img_query/b.png"
  ]
}

Cách gọi API không có ảnh:
{
  "question": "different of this image and method of this paper",
  "retriever": "hybrid",
  "generator": "openai", 
  "image_policy": "auto",
  "top_k": 5,
  "max_tokens": 512
}


Để dùng visual emb cần tải https://huggingface.co/BAAI/bge-visualized/resolve/main/Visualized_m3.pth?download=true và đặt ở backend\src

Nếu lỗi library có thể pip install thêm thư viện trong hướng dẫn ở https://huggingface.co/BAAI/bge-visualized 