"""
Internal Task Status Event System: Event queue/notifier cho task-level status.

Chức năng:
- Internal event queue/notifier cho task-level status
- Tasks gửi status vào đây (internal only)
- Aggregator lắng nghe và gom lại

Lưu ý: Hoàn toàn nội bộ, frontend không thấy
"""
import asyncio
import logging
import time
from typing import Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class TaskEvent:
    """Represents a task-level status update event."""
    
    def __init__(self, document_id: str, task_name: str, status_data: Dict, timestamp: float):
        self.document_id = document_id
        self.task_name = task_name
        self.status_data = status_data
        self.timestamp = timestamp


class TaskEventNotifier:
    """
    Internal event notifier for task-level status updates.
    
    Tasks send status updates here, and aggregators can subscribe to listen.
    """
    
    def __init__(self):
        # Map document_id -> List of event handlers
        self._handlers: Dict[str, List[Callable]] = {}
        self._lock = asyncio.Lock()
        # Event queue for processing
        self._event_queue: asyncio.Queue = asyncio.Queue()
        # Background task for processing events
        self._processor_task: Optional[asyncio.Task] = None
    
    async def notify_task_status(
        self,
        document_id: str,
        task_name: str,
        status_data: Dict,
    ) -> None:
        """
        Notify that a task status has changed.
        
        Args:
            document_id: Document ID
            task_name: Task name ("embedding", "summary", "reference", "skimming")
            status_data: Task-specific status data
        """
        if not document_id:
            logger.warning("[TaskEvents] ⚠️ Missing document_id, skipping task status")
            return
        
        event = TaskEvent(
            document_id=document_id,
            task_name=task_name,
            status_data=status_data,
            timestamp=time.time(),
        )
        
        await self._event_queue.put(event)
        logger.info(
            f"[WebSocket] 📥 [TaskEvents] Queued task status: document={document_id}, "
            f"task={task_name}, status={status_data.get('status', 'unknown')}"
        )
    
    def subscribe(self, document_id: str, handler: Callable) -> None:
        """
        Subscribe to task events for a document.
        
        Args:
            document_id: Document ID
            handler: Async function that takes (document_id, task_name, status_data)
        """
        async def wrapped_handler(event: TaskEvent):
            await handler(event.document_id, event.task_name, event.status_data)
        
        async def add_handler():
            async with self._lock:
                if document_id not in self._handlers:
                    self._handlers[document_id] = []
                self._handlers[document_id].append(wrapped_handler)
        
        # Run in event loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(add_handler())
        else:
            loop.run_until_complete(add_handler())
    
    def unsubscribe(self, document_id: str, handler: Callable) -> None:
        """
        Unsubscribe from task events for a document.
        
        Args:
            document_id: Document ID
            handler: Handler function to remove
        """
        async def remove_handler():
            async with self._lock:
                if document_id in self._handlers:
                    self._handlers[document_id] = [
                        h for h in self._handlers[document_id] if h != handler
                    ]
                    if not self._handlers[document_id]:
                        del self._handlers[document_id]
        
        # Run in event loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(remove_handler())
        else:
            loop.run_until_complete(remove_handler())
    
    async def _process_events(self) -> None:
        """Background task to process events and notify handlers."""
        while True:
            try:
                event = await self._event_queue.get()
                
                logger.info(
                    f"[WebSocket] 🔄 [TaskEvents] Processing event: document={event.document_id}, "
                    f"task={event.task_name}, status={event.status_data.get('status', 'unknown')}"
                )
                
                # Get handlers for this document
                async with self._lock:
                    handlers = self._handlers.get(event.document_id, []).copy()
                
                logger.info(
                    f"[WebSocket] 📋 [TaskEvents] Found {len(handlers)} handler(s) for document {event.document_id}"
                )
                
                # Notify all handlers
                for handler in handlers:
                    try:
                        logger.info(
                            f"[WebSocket] 🔔 [TaskEvents] Notifying handler for document {event.document_id}, "
                            f"task={event.task_name}"
                        )
                        await handler(event)
                        logger.info(
                            f"[WebSocket] ✅ [TaskEvents] Handler notified successfully for document {event.document_id}"
                        )
                    except Exception as e:
                        logger.error(
                            f"[WebSocket] ❌ [TaskEvents] Error in handler for {event.document_id}: {e}"
                        )
                        import traceback
                        logger.error(f"[WebSocket] [TaskEvents] Traceback: {traceback.format_exc()}")
                
                self._event_queue.task_done()
                logger.info(
                    f"[WebSocket] ✅ [TaskEvents] Event processed successfully for document {event.document_id}"
                )
                
            except Exception as e:
                logger.error(f"[WebSocket] ❌ [TaskEvents] Error processing event: {e}")
                import traceback
                logger.error(f"[WebSocket] [TaskEvents] Traceback: {traceback.format_exc()}")
    
    def start_processor(self) -> None:
        """Start the background event processor."""
        if self._processor_task is None or self._processor_task.done():
            self._processor_task = asyncio.create_task(self._process_events())
            logger.info("[TaskEvents] ✅ Started event processor")


# Global task event notifier instance
_task_event_notifier: TaskEventNotifier = None


def get_task_event_notifier() -> TaskEventNotifier:
    """Get the global task event notifier instance."""
    global _task_event_notifier
    if _task_event_notifier is None:
        _task_event_notifier = TaskEventNotifier()
        _task_event_notifier.start_processor()
    return _task_event_notifier


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
    notifier = get_task_event_notifier()
    await notifier.notify_task_status(document_id, task_name, status_data)

