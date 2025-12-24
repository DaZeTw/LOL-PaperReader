"""
WebSocket routes for real-time status updates.

URL structure: ws://backend:8000/ws/status?document_id=xxx
"""
import asyncio
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from paperreader.services.qa.pipeline import pipeline_status
from paperreader.services.websocket.status_manager import get_status_manager
from paperreader.services.websocket.status_aggregator import get_status_aggregator

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/status")
async def websocket_status(websocket: WebSocket):
    """
    WebSocket endpoint for real-time status updates.
    
    Replaces SSE streaming with WebSocket for better bidirectional communication.
    Client connects and receives status updates whenever document status changes.
    
    Query parameters:
        document_id: Document ID to subscribe to status updates (required)
    
    Example:
        ws://localhost:8000/ws/status?document_id=123
    """
    # Get document_id from query parameters
    query_params = dict(websocket.query_params)
    document_id = query_params.get("document_id")
    
    if not document_id:
        logger.error("[WebSocket] ❌ Missing document_id query parameter")
        await websocket.close(code=1008, reason="document_id query parameter is required")
        return
    
    status_manager = get_status_manager()
    status_aggregator = get_status_aggregator()
    
    try:
        # Subscribe aggregator to document (if not already subscribed)
        await status_aggregator.subscribe_to_document(document_id)
        
        # Connect to WebSocket status manager
        await status_manager.connect(websocket, document_id)
        logger.info(f"[WebSocket] ✅ Connection established for document {document_id}")
        
        # Send initial status immediately
        try:
            status = await pipeline_status(document_id=document_id)
            await websocket.send_json(status)
            logger.info(
                f"[WebSocket] 📤 Sent initial status for {document_id}: "
                f"embedding={status.get('embedding_status')}, "
                f"summary={status.get('summary_status')}, "
                f"reference={status.get('reference_status')}, "
                f"skimming={status.get('skimming_status')}, "
                f"available_features={status.get('available_features')}"
            )
            
            # If already complete, we can close connection (optional)
            if status.get("all_ready"):
                logger.info(
                    f"[WebSocket] ✅ All tasks already complete for {document_id}, "
                    f"keeping connection open for future updates"
                )
        except Exception as e:
            logger.error(f"[WebSocket] ❌ Failed to send initial status: {e}")
            import traceback
            logger.error(f"[WebSocket] Traceback: {traceback.format_exc()}")
        
        # Keep connection alive and handle incoming messages (if any)
        # Status updates are sent via ws_manager.send_status() from status aggregator
        while True:
            try:
                # Wait for messages from client (ping/pong, close, etc.)
                # Timeout to allow periodic checks
                data = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
                
                # Handle client messages if needed (ping/pong, etc.)
                if data == "ping":
                    await websocket.send_text("pong")
                    logger.debug(f"[WebSocket] 📍 Received ping from {document_id}, sent pong")
                elif data == "close":
                    logger.info(f"[WebSocket] 🔌 Client requested close for {document_id}")
                    break
                else:
                    logger.debug(f"[WebSocket] 📨 Received message from {document_id}: {data}")
            except asyncio.TimeoutError:
                # No message received, connection still alive
                # Send periodic heartbeat to keep connection alive
                try:
                    await websocket.send_json({"type": "heartbeat", "timestamp": time.time()})
                except Exception:
                    # Connection closed, break loop
                    break
            except WebSocketDisconnect:
                logger.info(f"[WebSocket] 🔌 Client disconnected for {document_id}")
                break
            except Exception as e:
                logger.error(f"[WebSocket] ❌ Error handling message for {document_id}: {e}")
                import traceback
                logger.error(f"[WebSocket] Traceback: {traceback.format_exc()}")
                break
                
    except WebSocketDisconnect:
        logger.info(f"[WebSocket] 🔌 Client disconnected during connection for {document_id}")
    except Exception as e:
        logger.error(f"[WebSocket] ❌ Error in WebSocket handler for {document_id}: {e}")
        import traceback
        logger.error(f"[WebSocket] Traceback: {traceback.format_exc()}")
    finally:
        # Clean up connection
        await status_manager.disconnect(websocket)
        logger.info(f"[WebSocket] 🧹 Cleaned up connection for {document_id}")

