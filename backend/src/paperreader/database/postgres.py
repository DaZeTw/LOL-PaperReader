"""
Async PostgreSQL connection management for the PaperReader backend.

This module exposes helpers to initialise and tear down a global asyncpg
connection pool that can be reused across FastAPI request handlers.
"""

from __future__ import annotations

import os
from typing import Optional

import asyncpg

_pool: Optional[asyncpg.Pool] = None


class PostgresNotConfiguredError(RuntimeError):
    """Raised when the DATABASE_URL environment variable is missing."""


async def init_postgres_pool() -> asyncpg.Pool:
    """
    Initialise the asyncpg connection pool if it does not already exist.
    """
    global _pool

    if _pool is not None:
        return _pool

    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise PostgresNotConfiguredError(
            "DATABASE_URL environment variable is required for PostgreSQL access."
        )

    _pool = await asyncpg.create_pool(dsn, min_size=1, max_size=10)
    return _pool


async def get_postgres_pool() -> asyncpg.Pool:
    """
    Retrieve the initialised asyncpg pool, creating it if necessary.
    """
    if _pool is None:
        await init_postgres_pool()
    assert _pool is not None  # help type checkers
    return _pool


async def close_postgres_pool() -> None:
    """
    Dispose of the asyncpg connection pool if it has been initialised.
    """
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None

