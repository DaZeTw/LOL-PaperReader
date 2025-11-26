import os
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase


class MongoDBConnection:
    """Async MongoDB connection manager backed by Motor."""

    def __init__(self) -> None:
        self._uri = os.getenv("MONGODB_URI")
        self._db_name = os.getenv("MONGODB_DATABASE", "paperreader")
        self._client: Optional[AsyncIOMotorClient] = None
        self._database: Optional[AsyncIOMotorDatabase] = None

    async def connect(self) -> None:
        """Establish a singleton connection if needed."""
        if self._client is not None:
            return

        if not self._uri:
            raise ValueError("Missing MONGODB_URI environment variable for backend MongoDB connection")

        self._client = AsyncIOMotorClient(self._uri, uuidRepresentation="standard")
        self._database = self._client[self._db_name]
        print(f"[MongoDB] Connected to database '{self._db_name}'")

    async def disconnect(self) -> None:
        """Cleanly close the connection."""
        if self._client is None:
            return

        self._client.close()
        self._client = None
        self._database = None
        print("[MongoDB] Connection closed")

    @property
    def database(self) -> AsyncIOMotorDatabase:
        if self._database is None:
            raise RuntimeError("MongoDB is not connected. Call connect() during startup.")
        return self._database

    def get_collection(self, name: str):
        return self.database[name]


# Global MongoDB connection instance
mongodb = MongoDBConnection()
