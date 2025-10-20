# backend/src/paperreader/config/settings.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    mongodb_url: str

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
