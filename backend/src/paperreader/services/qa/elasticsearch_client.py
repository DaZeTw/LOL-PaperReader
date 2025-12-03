from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Optional

from elasticsearch import AsyncElasticsearch, NotFoundError, BadRequestError
from elasticsearch.exceptions import TransportError

# Force Elasticsearch client to use API versioning (version 8 compatibility)
# This ensures the client sends correct Accept/Content-Type headers
os.environ.setdefault("ELASTIC_CLIENT_APIVERSIONING", "1")

ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
ELASTICSEARCH_INDEX = os.getenv("ELASTICSEARCH_INDEX", "paperreader_chunks")
DEFAULT_SIMILARITY = os.getenv("ELASTICSEARCH_SIMILARITY", "cosine")


@lru_cache(maxsize=1)
def get_elasticsearch_client() -> AsyncElasticsearch:
    # Initialize client with version 8 compatibility mode
    # Server supports version 7 or 8, but client may default to 9
    # Set headers explicitly to use version 8 compatibility
    # The ELASTIC_CLIENT_APIVERSIONING env var is set at module level
    client = AsyncElasticsearch(
        ELASTICSEARCH_URL,
        # Explicitly set headers to use version 8 compatibility
        headers={
            "Accept": "application/vnd.elasticsearch+json; compatible-with=8",
            "Content-Type": "application/vnd.elasticsearch+json; compatible-with=8",
        }
    )
    return client


async def test_connection() -> bool:
    """Test Elasticsearch connection and return True if successful."""
    try:
        client = get_elasticsearch_client()
        info = await client.info()
        print(f"[Elasticsearch] ✅ Connected to Elasticsearch: {info.get('version', {}).get('number', 'unknown')}")
        return True
    except Exception as exc:
        print(f"[Elasticsearch] ❌ Connection test failed: {exc}")
        return False


async def ensure_index(dimension: int) -> None:
    """Ensure Elasticsearch index exists, create if it doesn't.
    
    Instead of checking existence first (which can fail with 400), we try to create
    the index directly and handle "already exists" errors gracefully.
    """
    print(f"[Elasticsearch] Ensuring index exists: {ELASTICSEARCH_INDEX} (dimension={dimension})")
    client = get_elasticsearch_client()
    
    # Try to create index directly - simpler and more reliable than checking first
    # If index already exists, we'll catch that error and continue
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

    try:
        print(f"[Elasticsearch] Attempting to create index: {ELASTICSEARCH_INDEX}")
        response = await client.indices.create(
            index=ELASTICSEARCH_INDEX,
            mappings=body["mappings"],
            settings=body["settings"],
        )
        print(f"[Elasticsearch] ✅ Created index: {ELASTICSEARCH_INDEX}")
        if response:
            print(f"[Elasticsearch] Index creation response: {response}")
    except BadRequestError as exc:
        error_type = getattr(exc, "error", "") or ""
        error_info = getattr(exc, "info", None)
        if not error_info:
            error_info = getattr(exc, "body", None)
        if isinstance(error_info, dict):
            nested_type = error_info.get("error", {}).get("type", "")
            error_type = error_type or nested_type
        if "resource_already_exists_exception" in error_type:
            print(f"[Elasticsearch] ✅ Index {ELASTICSEARCH_INDEX} already exists (this is fine)")
            return
        error_reason = ""
        if isinstance(error_info, dict):
            error_reason = error_info.get("error", {}).get("reason", "") or error_info.get("error", {}).get("caused_by", {}).get("reason", "")
        raise RuntimeError(
            f"Failed to create Elasticsearch index (400): {error_type or 'bad_request'} {error_reason or exc}"
        ) from exc
    except TransportError as exc:
        error_str = str(exc).lower()
        # Index already exists - this is fine, just continue
        if "resource_already_exists_exception" in error_str or "already_exists_exception" in error_str:
            print(f"[Elasticsearch] ✅ Index {ELASTICSEARCH_INDEX} already exists (this is fine)")
            return
        # 400 Bad Request - could be various issues, log details
        elif exc.status_code == 400:
            print(f"[Elasticsearch] ❌ 400 Bad Request when creating index: {exc}")
            if hasattr(exc, 'info') and exc.info:
                print(f"[Elasticsearch] Error info: {exc.info}")
            # Try to get more details from error
            error_details = getattr(exc, 'info', {})
            if isinstance(error_details, dict):
                error_reason = error_details.get('error', {}).get('reason', '')
                error_type = error_details.get('error', {}).get('type', '')
                print(f"[Elasticsearch] Error type: {error_type}, reason: {error_reason}")
            raise RuntimeError(f"Failed to create Elasticsearch index (400): {exc}") from exc
        else:
            print(f"[Elasticsearch] ❌ Failed to create index: {exc} (status={exc.status_code})")
            if hasattr(exc, 'info') and exc.info:
                print(f"[Elasticsearch] Error info: {exc.info}")
            raise RuntimeError(f"Failed to create Elasticsearch index: {exc}") from exc
    except NotFoundError:
        # Should not happen for create, but handle gracefully
        print(f"[Elasticsearch] ⚠️ NotFoundError when creating index (unexpected)")
        raise RuntimeError(f"Unexpected NotFoundError when creating index") from None
    except Exception as exc:
        print(f"[Elasticsearch] ❌ Unexpected error creating index: {exc}")
        import traceback
        print(f"[Elasticsearch] Traceback: {traceback.format_exc()}")
        raise RuntimeError(f"Failed to create Elasticsearch index: {exc}") from exc


async def delete_document_chunks(
    document_key: Optional[str] = None,
    document_id: Optional[str] = None,
) -> None:
    """
    Delete all chunks from Elasticsearch for a document.
    
    Args:
        document_key: Document key to delete by.
        document_id: Document ID to delete by.
    """
    if not document_key and not document_id:
        return
    
    client = get_elasticsearch_client()
    try:
        # Build query - match by document_key or document_id
        query: Dict[str, Any] = {}
        if document_id and document_key:
            query = {
                "bool": {
                    "should": [
                        {"term": {"document_id": str(document_id)}},
                        {"term": {"document_key": document_key}},
                    ],
                    "minimum_should_match": 1,
                }
            }
        elif document_id:
            query = {"term": {"document_id": str(document_id)}}
        elif document_key:
            query = {"term": {"document_key": document_key}}
        
        await client.delete_by_query(
            index=ELASTICSEARCH_INDEX,
            body={"query": query},
            conflicts="proceed",
        )
        print(f"[Elasticsearch] ✅ Deleted embeddings from Elasticsearch (document_id={document_id}, document_key={document_key})")
    except NotFoundError:
        return
    except Exception as exc:
        print(f"[Elasticsearch] ⚠️ Failed to delete embeddings from Elasticsearch: {exc}")


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
        print(f"[Elasticsearch] ⚠️ No chunks or embeddings to index")
        return

    if len(chunks) != len(embeddings):
        raise ValueError(f"Chunks and embeddings length mismatch: {len(chunks)} chunks vs {len(embeddings)} embeddings")

    # Ensure index exists before indexing
    embedding_dim = len(embeddings[0]) if embeddings else 0
    if embedding_dim == 0:
        raise ValueError("Cannot determine embedding dimension (empty embeddings)")

    # Diagnostic logging to help trace indexing issues
    print("[Elasticsearch] 📤 Preparing to index chunks")
    print(f"[Elasticsearch]    document_key='{document_key}' (len={len(document_key) if document_key else 0})")
    print(f"[Elasticsearch]    document_id={document_id}")
    print(f"[Elasticsearch]    chunks={len(chunks)}, embeddings={len(embeddings)}, dim={embedding_dim}")

    print(f"[Elasticsearch] Indexing {len(chunks)} chunks for document_key={document_key}, dimension={embedding_dim}")
    await ensure_index(embedding_dim)
    
    # No need to verify - if ensure_index succeeded, index exists
    # If it failed, exception would have been raised
    
    await delete_document_chunks(document_key)

    client = get_elasticsearch_client()
    actions: List[Dict[str, Any]] = []

    for chunk, vector in zip(chunks, embeddings):
        chunk_id = chunk.get("chunk_id")
        if not chunk_id:
            print(f"[Elasticsearch] ⚠️ Skipping chunk without chunk_id: {chunk.get('chunk_id', 'unknown')}")
            continue
        if not vector or len(vector) == 0:
            print(f"[Elasticsearch] ⚠️ Skipping chunk {chunk_id} with empty vector")
            continue
        action = {
            "_index": ELASTICSEARCH_INDEX,
            "_id": chunk_id,
            "_source": {
                "document_id": document_id,
                "document_key": document_key,
                "chunk_id": chunk_id,
                "text": chunk.get("text") or "",
                "metadata": {
                    "page": chunk.get("page") or chunk.get("page_number"),
                    # images and tables are stored in MongoDB, not needed in ES for search
                    # title field removed as requested
                },
                "vector": vector,
            },
        }
        actions.append(action)

    if not actions:
        print(f"[Elasticsearch] ⚠️ No valid actions to index (all chunks had missing chunk_id or empty vector)")
        return

    # Bulk index
    from elasticsearch.helpers import async_bulk

    try:
        result = await async_bulk(client, actions, refresh="wait_for")
        print(f"[Elasticsearch] ✅ Indexed {len(actions)} chunks to {ELASTICSEARCH_INDEX}")
        if result:
            # Log bulk operation result
            errors = [item for item in result[1] if item.get("index", {}).get("error")]
            if errors:
                print(f"[Elasticsearch] ⚠️ {len(errors)} errors in bulk operation:")
                for error_item in errors[:5]:  # Show first 5 errors
                    print(f"[Elasticsearch]   Error: {error_item.get('index', {}).get('error')}")
    except TransportError as exc:
        error_msg = str(exc)
        print(f"[Elasticsearch] ❌ Failed to bulk index chunks: {exc}")
        if exc.status_code == 400:
            print(f"[Elasticsearch] ⚠️ 400 Bad Request - this may indicate mapping mismatch or invalid data")
            # Try to get more details from error
            if hasattr(exc, 'info') and exc.info:
                print(f"[Elasticsearch] Error details: {exc.info}")
            # Log sample of actions that failed
            if actions:
                print(f"[Elasticsearch] Sample action (first): {actions[0]}")
        raise RuntimeError(f"Failed to index chunks to Elasticsearch: {exc}") from exc
    except Exception as exc:
        print(f"[Elasticsearch] ❌ Unexpected error during bulk index: {exc}")
        import traceback
        print(f"[Elasticsearch] Traceback: {traceback.format_exc()}")
        raise RuntimeError(f"Failed to index chunks to Elasticsearch: {exc}") from exc


async def knn_search(
    *,
    document_key: str,
    query_vector: List[float],
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    client = get_elasticsearch_client()

    # Diagnostics to ensure the document_key exists within the index
    try:
        count_query = {"query": {"term": {"document_key": document_key}}}
        count_response = await client.count(index=ELASTICSEARCH_INDEX, body=count_query)
        doc_count = count_response.get("count", 0)
        print(f"[Elasticsearch] 🔎 document_key='{document_key}' => {doc_count} docs in index")
        if doc_count == 0:
            print(f"[Elasticsearch] ⚠️ No exact document_key match. Searching for similar keys…")
            similar = await client.search(
                index=ELASTICSEARCH_INDEX,
                body={
                    "size": 5,
                    "query": {
                        "wildcard": {
                            "document_key": {
                                "value": f"*{document_key[:32]}*"
                            }
                        }
                    },
                    "_source": ["document_key"]
                }
            )
            candidate_hits = similar.get("hits", {}).get("hits", [])
            if candidate_hits:
                for hit in candidate_hits:
                    alt_key = hit.get("_source", {}).get("document_key")
                    if alt_key:
                        print(f"[Elasticsearch]    similar document_key='{alt_key}'")
            else:
                print(f"[Elasticsearch]    no similar document keys found")
    except Exception as exc:
        print(f"[Elasticsearch] ⚠️ Failed to count documents for document_key '{document_key}': {exc}")

    # Use search API with knn in body (more compatible across ES versions)
    # Filter goes inside knn block for ES 8+
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
            }
        },
        "size": top_k,
    }
    try:
        print(f"[Elasticsearch] 🔍 knn search -> document_key='{document_key}', top_k={top_k}")
        response = await client.search(index=ELASTICSEARCH_INDEX, body=body)
    except NotFoundError:
        print(f"[Elasticsearch] ❌ Index '{ELASTICSEARCH_INDEX}' not found during knn search")
        return []
    except Exception as e:
        print(f"[Elasticsearch] Search with KNN failed: {e}")
        import traceback
        print(f"[Elasticsearch] Traceback: {traceback.format_exc()}")
        return []
    hits = response.get("hits", {}).get("hits", [])
    print(f"[Elasticsearch] ✅ knn returned {len(hits)} hits")
    if hits:
        top_hit = hits[0]
        print(f"[Elasticsearch]    top chunk_id={top_hit.get('_source', {}).get('chunk_id')} score={top_hit.get('_score')}")
    return hits

