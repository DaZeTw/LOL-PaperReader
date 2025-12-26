"""
WebSocket Manager for real-time status updates.

Manages WebSocket connections and broadcasts status updates to connected clients.
Replaces SSE-based status streaming with WebSocket for better bidirectional communication.
"""
import asyncio
import json
import logging
import time
from typing import Dict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """
    Manages WebSocket connections for document status updates.
    
    Each document_id can have multiple WebSocket connections (multiple tabs/browsers).
    When status changes, all connections for that document_id receive the update.
    """
    
    def __init__(self):
        # Map document_id -> Set of WebSocket connections
        self._connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()
        # Track connection metadata for logging
        self._connection_metadata: Dict[WebSocket, Dict] = {}
    
    async def connect(self, websocket: WebSocket, document_id: str) -> None:
        """
        Register a new WebSocket connection for a document.
        
        Args:
            websocket: The WebSocket connection
            document_id: Document ID to subscribe to
        """
        await websocket.accept()
        
        async with self._lock:
            if document_id not in self._connections:
                self._connections[document_id] = set()
            
            self._connections[document_id].add(websocket)
            self._connection_metadata[websocket] = {
                "document_id": document_id,
                "connected_at": time.time(),
            }
            
            connection_count = len(self._connections[document_id])
            logger.info(
                f"[WebSocket] ✅ Connected to document {document_id} "
                f"(total connections: {connection_count})"
            )
    
    async def disconnect(self, websocket: WebSocket) -> None:
        """
        Unregister a WebSocket connection.
        
        Args:
            websocket: The WebSocket connection to disconnect
        """
        async with self._lock:
            metadata = self._connection_metadata.pop(websocket, {})
            document_id = metadata.get("document_id")
            
            if document_id and document_id in self._connections:
                self._connections[document_id].discard(websocket)
                
                # Clean up empty sets
                if not self._connections[document_id]:
                    del self._connections[document_id]
                    logger.info(
                        f"[WebSocket] 🗑️ Removed document {document_id} "
                        f"(no more connections)"
                    )
                else:
                    remaining = len(self._connections[document_id])
                    logger.info(
                        f"[WebSocket] 🔌 Disconnected from document {document_id} "
                        f"(remaining connections: {remaining})"
                    )
    
    async def send_status(self, document_id: str, status: Dict) -> None:
        """
        Send status update to all connections for a document.
        
        Args:
            document_id: Document ID to send update for
            status: Status dictionary to send
        """
        async with self._lock:
            connections = self._connections.get(document_id, set()).copy()
        
        if not connections:
            logger.debug(
                f"[WebSocket] ⚠️ No connections for document {document_id}, "
                f"status update not sent"
            )
            return
        
        message = json.dumps(status)
        disconnected = set()
        
        logger.info(
            f"[WebSocket] 📤 Sending status update to {len(connections)} "
            f"connection(s) for document {document_id}"
        )
        logger.debug(
            f"[WebSocket] Status: embedding={status.get('embedding_status')}, "
            f"summary={status.get('summary_status')}, "
            f"reference={status.get('reference_status')}, "
            f"skimming={status.get('skimming_status')}, "
            f"available_features={status.get('available_features')}"
        )
        
        # Send to all connections
        for websocket in connections:
            try:
                await websocket.send_text(message)
                logger.debug(
                    f"[WebSocket] ✅ Sent status to connection for {document_id}"
                )
            except Exception as e:
                logger.warning(
                    f"[WebSocket] ❌ Failed to send to connection for {document_id}: {e}"
                )
                disconnected.add(websocket)
        
        # Clean up disconnected connections
        if disconnected:
            async with self._lock:
                for ws in disconnected:
                    if document_id in self._connections:
                        self._connections[document_id].discard(ws)
                    self._connection_metadata.pop(ws, None)
            
            logger.info(
                f"[WebSocket] 🧹 Cleaned up {len(disconnected)} disconnected "
                f"connection(s) for document {document_id}"
            )
    
    def get_connection_count(self, document_id: str) -> int:
        """
        Get the number of active connections for a document.
        
        Args:
            document_id: Document ID
            
        Returns:
            Number of active connections
        """
        return len(self._connections.get(document_id, set()))
    
    def get_total_connections(self) -> int:
        """
        Get total number of active connections across all documents.
        
        Returns:
            Total number of connections
        """
        return sum(len(conns) for conns in self._connections.values())


# Global WebSocket manager instance
_websocket_manager: WebSocketManager = None


def get_websocket_manager() -> WebSocketManager:
    """Get the global WebSocket manager instance."""
    global _websocket_manager
    if _websocket_manager is None:
        _websocket_manager = WebSocketManager()
    return _websocket_manager

