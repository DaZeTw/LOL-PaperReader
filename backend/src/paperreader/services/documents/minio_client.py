from __future__ import annotations

import asyncio
import io
import os
from datetime import timedelta
from functools import lru_cache
from typing import Optional

from minio import Minio


def _build_client() -> Minio:
    endpoint = os.getenv("MINIO_ENDPOINT", "localhost")
    port = int(os.getenv("MINIO_PORT", "9000"))
    use_ssl = os.getenv("MINIO_USE_SSL", "false").lower() == "true"
    access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin123")

    return Minio(
        f"{endpoint}:{port}",
        access_key=access_key,
        secret_key=secret_key,
        secure=use_ssl,
    )


@lru_cache(maxsize=1)
def get_minio_client() -> Minio:
    return _build_client()


async def ensure_bucket(bucket: str) -> None:
    client = get_minio_client()

    def _ensure() -> None:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)

    await asyncio.to_thread(_ensure)


async def upload_bytes(
    bucket: str,
    object_name: str,
    data: bytes,
    content_type: Optional[str] = None,
) -> None:
    client = get_minio_client()
    await ensure_bucket(bucket)

    def _upload() -> None:
        buffer = io.BytesIO(data)
        client.put_object(
            bucket,
            object_name,
            buffer,
            length=len(data),
            content_type=content_type or "application/pdf",
        )

    await asyncio.to_thread(_upload)


async def delete_object(bucket: str, object_name: str) -> None:
    client = get_minio_client()
    await asyncio.to_thread(client.remove_object, bucket, object_name)


async def delete_objects_by_prefix(bucket: str, prefix: str) -> int:
    """
    Delete all objects in a bucket that match the given prefix.
    
    Args:
        bucket: The bucket name
        prefix: The prefix to match (e.g., "user_id/document/document_id/")
    
    Returns:
        Number of objects deleted
    """
    client = get_minio_client()
    
    def _delete() -> int:
        objects_to_delete = []
        # List all objects with the given prefix
        try:
            for obj in client.list_objects(bucket, prefix=prefix, recursive=True):
                objects_to_delete.append(obj.object_name)
        except Exception as exc:
            print(f"[MinIO] Error listing objects with prefix {prefix}: {exc}")
            return 0
        
        if not objects_to_delete:
            return 0
        
        # Delete objects one by one to avoid issues with batch deletion
        deleted_count = 0
        error_count = 0
        for object_name in objects_to_delete:
            try:
                client.remove_object(bucket, object_name)
                deleted_count += 1
            except Exception as exc:
                error_count += 1
                print(f"[MinIO] Error deleting {object_name}: {exc}")
        
        return deleted_count
    
    return await asyncio.to_thread(_delete)


async def get_presigned_url(
    bucket: str,
    object_name: str,
    expires: int = 7 * 24 * 60 * 60,
    external: bool | None = None,
) -> str:
    client = get_minio_client()
    # Convert expires from seconds (int) to timedelta object as required by MinIO
    expires_timedelta = timedelta(seconds=expires)
    url = await asyncio.to_thread(client.presigned_get_object, bucket, object_name, expires_timedelta)

    if external is False:
        return url

    public_url = os.getenv("MINIO_PUBLIC_URL")
    if not public_url:
        return url

    from urllib.parse import urlparse, urlunparse

    try:
        presigned = urlparse(url)
        external_parsed = urlparse(public_url)
        new_url = presigned._replace(
            scheme=external_parsed.scheme or presigned.scheme,
            netloc=external_parsed.netloc or presigned.netloc,
        )
        return urlunparse(new_url)
    except Exception:
        return url

