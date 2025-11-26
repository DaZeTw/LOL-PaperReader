from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Optional

from elasticsearch import AsyncElasticsearch, NotFoundError
from elasticsearch.exceptions import TransportError


ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
ELASTICSEARCH_INDEX = os.getenv("ELASTICSEARCH_INDEX", "paperreader_chunks")
DEFAULT_SIMILARITY = os.getenv("ELASTICSEARCH_SIMILARITY", "cosine")


@lru_cache(maxsize=1)
def get_elasticsearch_client() -> AsyncElasticsearch:
    return AsyncElasticsearch(ELASTICSEARCH_URL)


async def ensure_index(dimension: int) -> None:
    client = get_elasticsearch_client()
    try:
        exists = await client.indices.exists(index=ELASTICSEARCH_INDEX)
    except TransportError as exc:
        raise RuntimeError(f"Failed to check Elasticsearch index: {exc}") from exc

    if exists:
        return

    body = {
        "settings": {
            "index": {
                "default_pipeline": None,
            }
        },
        "mappings": {
            "properties": {
                "document_key": {"type": "keyword"},
                "document_id": {"type": "keyword"},
                "chunk_id": {"type": "keyword"},
                "text": {"type": "text"},
                "vector": {
                    "type": "dense_vector",
                    "dims": dimension,
                    "similarity": DEFAULT_SIMILARITY,
                },
                "metadata": {"type": "object", "enabled": True},
                "created_at": {"type": "date"},
                "updated_at": {"type": "date"},
            }
        },
    }

    await client.indices.create(index=ELASTICSEARCH_INDEX, mappings=body["mappings"], settings=body["settings"])


async def delete_document_chunks(document_key: str) -> None:
    client = get_elasticsearch_client()
    try:
        await client.delete_by_query(
            index=ELASTICSEARCH_INDEX,
            body={"query": {"term": {"document_key": document_key}}},
            conflicts="proceed",
        )
    except NotFoundError:
        return


async def index_chunks(
    *,
    document_id: Optional[str],
    document_key: str,
    chunks: Iterable[Dict[str, Any]],
    embeddings: Iterable[List[float]],
) -> None:
    embeddings = list(embeddings)
    chunks = list(chunks)
    if not chunks or not embeddings:
        return

    if len(chunks) != len(embeddings):
        raise ValueError("Chunks and embeddings length mismatch")

    await ensure_index(len(embeddings[0]))
    await delete_document_chunks(document_key)

    client = get_elasticsearch_client()
    actions: List[Dict[str, Any]] = []

    for chunk, vector in zip(chunks, embeddings):
        chunk_id = chunk.get("chunk_id")
        action = {
            "_index": ELASTICSEARCH_INDEX,
            "_id": chunk_id,
            "_source": {
                "document_id": document_id,
                "document_key": document_key,
                "chunk_id": chunk_id,
                "text": chunk.get("text"),
                "metadata": {
                    "title": chunk.get("title"),
                    "page": chunk.get("page"),
                    "images": chunk.get("images") or [],
                    "tables": chunk.get("tables") or [],
                },
                "vector": vector,
            },
        }
        actions.append(action)

    if not actions:
        return

    # Bulk index
    from elasticsearch.helpers import async_bulk

    await async_bulk(client, actions, refresh="wait_for")


async def knn_search(
    *,
    document_key: str,
    query_vector: List[float],
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    client = get_elasticsearch_client()
    body = {
        "knn": {
            "field": "vector",
            "query_vector": query_vector,
            "k": top_k,
            "num_candidates": min(max(top_k * 10, 100), 1000),
            "filter": {
                "term": {
                    "document_key": document_key,
                }
            },
        },
    }
    try:
        response = await client.knn_search(index=ELASTICSEARCH_INDEX, body=body)
    except NotFoundError:
        return []
    hits = response.get("hits", {}).get("hits", [])
    return hits

