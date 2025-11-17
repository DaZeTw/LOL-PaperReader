# MongoDB removed - stub file to prevent import errors
# This file is kept for backward compatibility but MongoDB functionality is disabled

class MongoDBConnection:
    """Stub class for MongoDB - MongoDB has been removed from this project"""
    
    def __init__(self):
        self.client = None
        self.database = None
        self.sync_client = None

    async def connect(self):
        """Stub method - MongoDB is disabled"""
        print("[INFO] MongoDB is disabled - connect() called but ignored")
        pass

    async def disconnect(self):
        """Stub method - MongoDB is disabled"""
        print("[INFO] MongoDB is disabled - disconnect() called but ignored")
        pass
    
    def get_collection(self, collection_name: str):
        """Stub method - MongoDB is disabled"""
        raise RuntimeError("MongoDB has been removed from this project. Database operations are not available.")


# Global MongoDB connection instance (stub)
mongodb = MongoDBConnection()
