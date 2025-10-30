import asyncio
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import MongoClient
from paperreader.config.settings import settings

# backend/src/paperreader/database/mongodb.py
import motor.motor_asyncio
from pymongo import MongoClient
from paperreader.config.settings import settings

class MongoDBConnection:
    def __init__(self):
        self.client = None
        self.database = None
        self.sync_client = None

    async def connect(self):
        try:
            # Lấy URI từ settings
            mongodb_url = settings.mongodb_url

            # Async client
            self.client = motor.motor_asyncio.AsyncIOMotorClient(mongodb_url)

            # Sync client
            self.sync_client = MongoClient(mongodb_url)

            # Database
            self.database = self.client.get_default_database()  # sẽ dùng database trong URI

            # Test kết nối
            await self.client.admin.command("ping")
            print("✅ Connected to MongoDB Atlas")
        except Exception as e:
            print(f"❌ Failed to connect to MongoDB: {e}")
            raise
    async def disconnect(self):
        """Disconnect from MongoDB"""
        if self.client:
            self.client.close()
        if self.sync_client:
            self.sync_client.close()
        print("Disconnected from MongoDB")
    
    def get_collection(self, collection_name: str):
        """Get a collection from the database"""
        if self.database is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        return self.database[collection_name]


# Global MongoDB connection instance
mongodb = MongoDBConnection()
