# backend/src/paperreader/database/file_storage.py
import json
import os
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime

class FileStorage:
    """Local file-based storage system to replace MongoDB"""

    def __init__(self, storage_dir: str = "./data/chat_sessions"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        print(f"✅ FileStorage initialized at: {self.storage_dir.absolute()}")

    async def connect(self):
        """Initialize storage directory (replaces MongoDB connect)"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        print(f"✅ Connected to FileStorage at: {self.storage_dir.absolute()}")

    async def disconnect(self):
        """Cleanup (replaces MongoDB disconnect)"""
        print("Disconnected from FileStorage")

    def _get_session_file(self, session_id: str) -> Path:
        """Get the file path for a session"""
        # Use sanitized session_id as filename
        safe_id = session_id.replace("/", "_").replace("\\", "_")
        return self.storage_dir / f"{safe_id}.json"

    def _serialize_datetime(self, obj):
        """Convert datetime to ISO format string"""
        if isinstance(obj, datetime):
            return obj.isoformat()
        raise TypeError(f"Type {type(obj)} not serializable")

    def _deserialize_datetime(self, data: Dict) -> Dict:
        """Convert ISO format strings back to datetime"""
        if isinstance(data, dict):
            for key, value in data.items():
                if isinstance(value, str) and key in ['created_at', 'updated_at', 'timestamp']:
                    try:
                        data[key] = datetime.fromisoformat(value)
                    except (ValueError, AttributeError):
                        pass
                elif isinstance(value, dict):
                    data[key] = self._deserialize_datetime(value)
                elif isinstance(value, list):
                    data[key] = [self._deserialize_datetime(item) if isinstance(item, dict) else item for item in value]
        return data

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict]:
        """Find a single session by query (replaces MongoDB find_one)"""
        session_id = query.get("session_id")
        if not session_id:
            return None

        file_path = self._get_session_file(session_id)
        if not file_path.exists():
            return None

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return self._deserialize_datetime(data)
        except Exception as e:
            print(f"[ERROR] Failed to read session {session_id}: {e}")
            return None

    async def insert_one(self, document: Dict[str, Any]) -> Dict:
        """Insert a new session (replaces MongoDB insert_one)"""
        session_id = document.get("session_id")
        if not session_id:
            raise ValueError("session_id is required")

        file_path = self._get_session_file(session_id)

        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(document, f, indent=2, default=self._serialize_datetime, ensure_ascii=False)
            print(f"[FileStorage] Created session: {session_id}")
            return {"inserted_id": session_id, "acknowledged": True}
        except Exception as e:
            print(f"[ERROR] Failed to create session {session_id}: {e}")
            raise

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]) -> Dict:
        """Update a session (replaces MongoDB update_one)"""
        session_id = query.get("session_id")
        if not session_id:
            raise ValueError("session_id is required")

        file_path = self._get_session_file(session_id)

        try:
            # Read existing data
            if file_path.exists():
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    data = self._deserialize_datetime(data)
            else:
                return {"matched_count": 0, "modified_count": 0}

            # Apply updates
            if "$set" in update:
                data.update(update["$set"])
            if "$push" in update:
                for key, value in update["$push"].items():
                    if key not in data:
                        data[key] = []
                    data[key].append(value)

            # Update timestamp
            data["updated_at"] = datetime.utcnow()

            # Write back
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, default=self._serialize_datetime, ensure_ascii=False)

            print(f"[FileStorage] Updated session: {session_id}")
            return {"matched_count": 1, "modified_count": 1}
        except Exception as e:
            print(f"[ERROR] Failed to update session {session_id}: {e}")
            raise

    async def delete_one(self, query: Dict[str, Any]) -> Dict:
        """Delete a session (replaces MongoDB delete_one)"""
        session_id = query.get("session_id")
        if not session_id:
            raise ValueError("session_id is required")

        file_path = self._get_session_file(session_id)

        try:
            if file_path.exists():
                file_path.unlink()
                print(f"[FileStorage] Deleted session: {session_id}")
                return {"deleted_count": 1}
            return {"deleted_count": 0}
        except Exception as e:
            print(f"[ERROR] Failed to delete session {session_id}: {e}")
            raise

    async def find(self, query: Dict[str, Any], limit: int = 20) -> List[Dict]:
        """Find multiple sessions (replaces MongoDB find)"""
        user_id = query.get("user_id")
        if not user_id:
            return []

        results = []
        try:
            for file_path in self.storage_dir.glob("*.json"):
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        data = self._deserialize_datetime(data)
                        if data.get("user_id") == user_id:
                            results.append(data)
                except Exception as e:
                    print(f"[WARNING] Failed to read {file_path}: {e}")
                    continue

            # Sort by updated_at descending
            results.sort(key=lambda x: x.get("updated_at", datetime.min), reverse=True)
            return results[:limit]
        except Exception as e:
            print(f"[ERROR] Failed to find sessions: {e}")
            return []

    def get_collection(self, collection_name: str):
        """Get a collection (for compatibility with MongoDB interface)"""
        return self


# Global FileStorage instance
file_storage = FileStorage()
