Add your OpenAI API key: docker-compose.yml : OPENAI_API_KEY=sk-yourkeyhere

To use visual embeddings:

Download the model file from: https://huggingface.co/BAAI/bge-visualized/resolve/main/Visualized_m3.pth?download=true

Place it in: backend\src

docker compose build

docker compose up -d

docker logs lol-paperreader-python-backend-1
