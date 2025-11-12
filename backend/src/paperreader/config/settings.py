# backend/src/paperreader/config/settings.py
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    mongodb_url: Optional[str] = None  # Made optional - will use file storage if not provided
    openai_api_key: str
    use_file_storage: bool = True  # Use local file storage by default instead of MongoDB

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # Note: Environment variables (from docker-compose.yml) take precedence over .env file

settings = Settings()
