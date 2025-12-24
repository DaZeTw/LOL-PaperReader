"""
Status Aggregator: Gom status từ các tasks thành full aggregated status.

Architecture:
- Mỗi task gửi task-level status → Internal Event/Queue
- Aggregator lắng nghe events → Gom lại → Full aggregated status
- WebSocket Manager broadcast full status đến frontend
"""
import asyncio
import logging
import time
from typing import Dict, Optional

from paperreader.services.qa.pipeline import pipeline_status
from paperreader.services.websocket_manager import get_websocket_manager

logger = logging.getLogger(__name__)


class StatusAggregator:
    """
    Aggregates task-level status updates into full pipeline status.
    
    Flow:
    1. Tasks send task-level status updates via add_task_status()
    2. Aggregator collects updates and triggers aggregation
    3. Aggregator gets full status from pipeline_status()
    4. Aggregator broadcasts full status via WebSocket
    """
    
    def __init__(self):
        # Map document_id -> task status updates queue
        self._task_status_queue: Dict[str, asyncio.Queue] = {}
        self._lock = asyncio.Lock()
        # Track last aggregation time per document
        self._last_aggregation: Dict[str, float] = {}
        # Debounce interval (ms) - aggregate max once per interval
        self._debounce_interval = 0.5  # 500ms
    
    async def add_task_status(
        self,
        document_id: str,
        task_name: str,
        status_data: Dict,
    ) -> None:
        """
        Add task-level status update to queue.
        
        Args:
            document_id: Document ID
            task_name: Task name (e.g., "embedding", "summary", "reference", "skimming")
            status_data: Task-specific status data
        """
        if not document_id:
            logger.warning("[Aggregator] ⚠️ Missing document_id, skipping task status")
            return
        
        async with self._lock:
            if document_id not in self._task_status_queue:
                self._task_status_queue[document_id] = asyncio.Queue()
        
        queue = self._task_status_queue[document_id]
        
        task_update = {
            "task": task_name,
            "data": status_data,
            "timestamp": time.time(),
        }
        
        await queue.put(task_update)
        logger.info(
            f"[Aggregator] 📥 Received task status: document={document_id}, "
            f"task={task_name}, status={status_data.get('status', 'unknown')}"
        )
        
        # Trigger aggregation (with debouncing)
        asyncio.create_task(self._aggregate_and_broadcast(document_id))
    
    async def _aggregate_and_broadcast(self, document_id: str) -> None:
        """
        Aggregate task statuses and broadcast full status via WebSocket.
        
        This function:
        1. Waits for MongoDB writes to complete (status already in DB)
        2. Gets full aggregated status from pipeline_status()
        3. Broadcasts via WebSocket
        """
        # Debounce: Only aggregate once per interval
        current_time = time.time()
        last_agg = self._last_aggregation.get(document_id, 0)
        time_since_last = current_time - last_agg
        
        if time_since_last < self._debounce_interval:
            # Wait for debounce interval
            await asyncio.sleep(self._debounce_interval - time_since_last)
        
        self._last_aggregation[document_id] = time.time()
        
        logger.info(f"[Aggregator] 🔄 Aggregating status for document {document_id}")
        
        try:
            # Step 1: Get full aggregated status from database
            # This ensures MongoDB writes are complete and we have latest state
            full_status = await pipeline_status(document_id=document_id)
            
            logger.info(
                f"[Aggregator] ✅ Aggregated status: "
                f"embedding={full_status.get('embedding_status')}, "
                f"summary={full_status.get('summary_status')}, "
                f"reference={full_status.get('reference_status')}, "
                f"skimming={full_status.get('skimming_status')}, "
                f"available_features={full_status.get('available_features')}"
            )
            
            # Step 2: Broadcast full status via WebSocket
            ws_manager = get_websocket_manager()
            await ws_manager.send_status(document_id, full_status)
            
            logger.info(
                f"[Aggregator] 📤 Broadcasted full status to WebSocket clients "
                f"for document {document_id}"
            )
            
        except Exception as e:
            logger.error(
                f"[Aggregator] ❌ Failed to aggregate/broadcast for {document_id}: {e}"
            )
            import traceback
            logger.error(f"[Aggregator] Traceback: {traceback.format_exc()}")
    
    async def get_pending_updates(self, document_id: str) -> list:
        """
        Get pending task status updates for a document (for debugging).
        
        Args:
            document_id: Document ID
            
        Returns:
            List of pending task updates
        """
        async with self._lock:
            queue = self._task_status_queue.get(document_id)
            if not queue:
                return []
            
            updates = []
            while not queue.empty():
                try:
                    update = queue.get_nowait()
                    updates.append(update)
                except asyncio.QueueEmpty:
                    break
            
            # Put updates back
            for update in updates:
                await queue.put(update)
            
            return updates


# Global aggregator instance
_aggregator: Optional[StatusAggregator] = None


def get_status_aggregator() -> StatusAggregator:
    """Get the global status aggregator instance."""
    global _aggregator
    if _aggregator is None:
        _aggregator = StatusAggregator()
    return _aggregator


async def notify_task_status(
    document_id: str,
    task_name: str,
    status_data: Dict,
) -> None:
    """
    Convenience function for tasks to notify status updates.
    
    Args:
        document_id: Document ID
        task_name: Task name ("embedding", "summary", "reference", "skimming")
        status_data: Task-specific status data
    """
    aggregator = get_status_aggregator()
    await aggregator.add_task_status(document_id, task_name, status_data)

