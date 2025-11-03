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
            print(f"[DEBUG] Connecting to MongoDB URL: {mongodb_url[:50]}...")  # Log first 50 chars for security

            # Add timeout parameters to prevent connection timeout
            # Parse URL to add timeout if not already present
            if "?" not in mongodb_url:
                timeout_params = "?connectTimeoutMS=30000&serverSelectionTimeoutMS=30000&socketTimeoutMS=30000"
                mongodb_url_with_timeout = mongodb_url + timeout_params
            else:
                # Add timeout params to existing query string
                timeout_params = "&connectTimeoutMS=30000&serverSelectionTimeoutMS=30000&socketTimeoutMS=30000"
                mongodb_url_with_timeout = mongodb_url + timeout_params
            
            print(f"[DEBUG] Using MongoDB connection with 30s timeouts")

            # Async client with timeout
            self.client = motor.motor_asyncio.AsyncIOMotorClient(
                mongodb_url_with_timeout,
                serverSelectionTimeoutMS=30000,
                connectTimeoutMS=30000,
                socketTimeoutMS=30000
            )

            # Sync client with timeout
            self.sync_client = MongoClient(
                mongodb_url_with_timeout,
                serverSelectionTimeoutMS=30000,
                connectTimeoutMS=30000,
                socketTimeoutMS=30000
            )

            # Database - extract database name from URL if specified, or use default
            # MongoDB URL format: 
            #   - mongodb://user:pass@host:port/database_name
            #   - mongodb+srv://user:pass@cluster.mongodb.net/database_name?params
            db_name = None
            url_parts = mongodb_url.split("/")
            
            # Check if URL has database name after host (mongodb://... or mongodb+srv://...)
            if len(url_parts) > 3:
                # Extract database name (last part before query params)
                db_part = url_parts[-1].split("?")[0]  # Remove query params
                # Only use if it's not empty and doesn't look like a query param
                if db_part and not db_part.startswith("&"):
                    db_name = db_part
                    self.database = self.client[db_name]
                    print(f"[DEBUG] Using database from URL: {db_name}")
            
            if self.database is None:
                # Use default database (from connection string or default 'test')
                self.database = self.client.get_default_database()
                db_name = self.database.name
                print(f"[DEBUG] Using default database: {db_name}")

            # Test kết nối
            await self.client.admin.command("ping")
            print(f"✅ Connected to MongoDB Atlas - Database: {db_name}")
        except Exception as e:
            print(f"❌ Failed to connect to MongoDB: {e}")
            print(f"[ERROR] MongoDB URL (partial): {mongodb_url[:50] if 'mongodb_url' in locals() else 'N/A'}...")
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
        # Motor database objects cannot be compared with None directly, so we check by accessing name
        try:
            _ = self.database.name
        except (AttributeError, TypeError):
            raise RuntimeError("Database not connected. Call connect() first.")
        return self.database[collection_name]


# Global MongoDB connection instance
mongodb = MongoDBConnection()
