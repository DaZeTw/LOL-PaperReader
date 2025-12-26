"""
WebSocket Status Manager: Quản lý WebSocket connections và broadcast full aggregated status.

Chức năng:
- Quản lý connections theo document_id
- Broadcast full aggregated status (gọi pipeline_status())
- Gửi full status khi client connect
- Cleanup khi disconnect

Lưu ý: Chỉ broadcast full status, không có task-level messages
"""
import asyncio
import json
import logging
from typing import Dict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketStatusManager:
    """
    Manages WebSocket connections for document status updates.
    
    Each document_id can have multiple WebSocket connections (multiple tabs/browsers).
    When status changes, all connections for that document_id receive the full aggregated status.
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
                "connected_at": asyncio.get_event_loop().time(),
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
    
    async def broadcast_status(self, document_id: str, status: Dict) -> None:
        """
        Broadcast full aggregated status to all connections for a document.
        
        Args:
            document_id: Document ID to send update for
            status: Full aggregated PipelineStatus dictionary
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
            f"[WebSocket] 📤 Broadcasting full status to {len(connections)} "
            f"connection(s) for document {document_id}"
        )
        logger.info(
            f"[WebSocket] 📊 Status details: "
            f"embedding={status.get('embedding_status')}, "
            f"summary={status.get('summary_status')}, "
            f"reference={status.get('reference_status')}, "
            f"skimming={status.get('skimming_status')}, "
            f"available_features={status.get('available_features')}, "
            f"all_ready={status.get('all_ready')}"
        )
        
        # Send to all connections
        for websocket in connections:
            try:
                await websocket.send_text(message)
                logger.info(
                    f"[WebSocket] ✅ Sent status update to WebSocket client for document {document_id}"
                )
            except Exception as e:
                logger.warning(
                    f"[WebSocket] ❌ Failed to send status to WebSocket client for {document_id}: {e}"
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
    
    async def broadcast_chat_status(
        self, document_id: str, session_id: str, status: str = "answer_ready"
    ) -> None:
        """
        Broadcast chat status update to all connections for a document.
        
        Args:
            document_id: Document ID to send update for
            session_id: Chat session ID
            status: Status string (e.g., "answer_ready")
        """
        async with self._lock:
            connections = self._connections.get(document_id, set()).copy()
        
        if not connections:
            logger.debug(
                f"[WebSocket] ⚠️ No connections for document {document_id}, "
                f"chat status update not sent"
            )
            return
        
        message = json.dumps({
            "type": "chat",
            "session_id": session_id,
            "status": status,
            "document_id": document_id,
        })
        disconnected = set()
        
        logger.info(
            f"[WebSocket] 💬 Broadcasting chat status to {len(connections)} "
            f"connection(s) for document {document_id}, session {session_id}, status={status}"
        )
        
        # Send to all connections
        for websocket in connections:
            try:
                await websocket.send_text(message)
                logger.debug(
                    f"[WebSocket] ✅ Sent chat status to connection for {document_id}"
                )
            except Exception as e:
                logger.warning(
                    f"[WebSocket] ❌ Failed to send chat status to connection for {document_id}: {e}"
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
    
    def get_total_connections(self) -> int:
        """
        Get total number of active connections across all documents.
        
        Returns:
            Total number of connections
        """
        return sum(len(conns) for conns in self._connections.values())


# Global WebSocket status manager instance
_status_manager: WebSocketStatusManager = None


def get_status_manager() -> WebSocketStatusManager:
    """Get the global WebSocket status manager instance."""
    global _status_manager
    if _status_manager is None:
        _status_manager = WebSocketStatusManager()
    return _status_manager

