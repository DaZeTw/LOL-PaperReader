"""
Status Aggregator: Lắng nghe task-level status updates và broadcast full aggregated status.

Chức năng:
- Lắng nghe task-level status updates (internal events)
- Khi nhận task update → gọi pipeline_status() để aggregate
- Broadcast full aggregated status qua WebSocket Manager

Lưu ý: Đây là refactor nội bộ, frontend không biết. Luôn gửi full status object.
"""
import asyncio
import logging
import time
from typing import Dict

from paperreader.services.qa.pipeline import pipeline_status
from paperreader.services.websocket.status_manager import get_status_manager
from paperreader.services.websocket.task_events import get_task_event_notifier

logger = logging.getLogger(__name__)


class StatusAggregator:
    """
    Aggregates task-level status updates into full pipeline status.
    
    Flow:
    1. Subscribes to task events from task_events
    2. When task update received → calls pipeline_status() to get full aggregated status
    3. Broadcasts full aggregated status via WebSocket Status Manager
    """
    
    def __init__(self):
        # Track last aggregation time per document (for debouncing)
        self._last_aggregation: Dict[str, float] = {}
        # Debounce interval (seconds) - aggregate max once per interval
        self._debounce_interval = 0.5  # 500ms
        # Status manager for broadcasting
        self._status_manager = get_status_manager()
        # Task event notifier
        self._task_events = get_task_event_notifier()
        # Track which documents we're subscribed to
        self._subscribed_documents: set = set()
        self._lock = asyncio.Lock()
    
    async def subscribe_to_document(self, document_id: str) -> None:
        """
        Subscribe to task events for a document.
        
        Args:
            document_id: Document ID to subscribe to
        """
        async with self._lock:
            if document_id in self._subscribed_documents:
                logger.debug(f"[Aggregator] Already subscribed to {document_id}")
                return
            
            self._subscribed_documents.add(document_id)
        
        # Subscribe to task events
        self._task_events.subscribe(document_id, self._handle_task_update)
        logger.info(f"[Aggregator] ✅ Subscribed to task events for document {document_id}")
    
    async def _handle_task_update(
        self,
        document_id: str,
        task_name: str,
        status_data: Dict,
    ) -> None:
        """
        Handle task-level status update.
        
        Args:
            document_id: Document ID
            task_name: Task name
            status_data: Task-specific status data
        """
        logger.info(
            f"[WebSocket] 📥 [Aggregator] Received task update: document={document_id}, "
            f"task={task_name}, status={status_data.get('status', 'unknown')}"
        )
        
        # Trigger aggregation (with debouncing)
        logger.info(
            f"[WebSocket] 🔄 [Aggregator] Triggering aggregation for document {document_id} "
            f"(task: {task_name})"
        )
        asyncio.create_task(self._aggregate_and_broadcast(document_id))
    
    async def _aggregate_and_broadcast(self, document_id: str) -> None:
        """
        Aggregate task statuses and broadcast full status via WebSocket.
        
        This function:
        1. Waits for MongoDB writes to complete (status already in DB)
        2. Gets full aggregated status from pipeline_status()
        3. Broadcasts via WebSocket Status Manager
        """
        # Debounce: Only aggregate once per interval
        current_time = time.time()
        last_agg = self._last_aggregation.get(document_id, 0)
        time_since_last = current_time - last_agg
        
        if time_since_last < self._debounce_interval:
            # Wait for debounce interval
            await asyncio.sleep(self._debounce_interval - time_since_last)
        
        self._last_aggregation[document_id] = time.time()
        
        logger.info(f"[WebSocket] 🔄 [Aggregator] Starting aggregation for document {document_id}")
        
        try:
            # Step 1: Get full aggregated status from database
            # This ensures MongoDB writes are complete and we have latest state
            logger.info(f"[WebSocket] 📊 [Aggregator] Fetching full status from pipeline_status() for document {document_id}")
            full_status = await pipeline_status(document_id=document_id)
            
            logger.info(
                f"[WebSocket] ✅ [Aggregator] Aggregated status for document {document_id}: "
                f"embedding={full_status.get('embedding_status')}, "
                f"summary={full_status.get('summary_status')}, "
                f"reference={full_status.get('reference_status')}, "
                f"skimming={full_status.get('skimming_status')}, "
                f"available_features={full_status.get('available_features')}, "
                f"all_ready={full_status.get('all_ready')}"
            )
            
            # Step 2: Broadcast full aggregated status via WebSocket
            logger.info(f"[WebSocket] 📤 [Aggregator] Broadcasting to WebSocket manager for document {document_id}")
            await self._status_manager.broadcast_status(document_id, full_status)
            
            logger.info(
                f"[WebSocket] ✅ [Aggregator] Successfully broadcasted full status to WebSocket clients "
                f"for document {document_id}"
            )
            
        except Exception as e:
            logger.error(
                f"[Aggregator] ❌ Failed to aggregate/broadcast for {document_id}: {e}"
            )
            import traceback
            logger.error(f"[Aggregator] Traceback: {traceback.format_exc()}")


# Global aggregator instance
_aggregator: StatusAggregator = None


def get_status_aggregator() -> StatusAggregator:
    """Get the global status aggregator instance."""
    global _aggregator
    if _aggregator is None:
        _aggregator = StatusAggregator()
    return _aggregator

