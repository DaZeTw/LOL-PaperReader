"""
Database helpers for persisting OAuth-authenticated users.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from asyncpg import Record

from paperreader.database.postgres import get_postgres_pool


def _record_to_dict(record: Record) -> Dict[str, Any]:
    return {
        "id": record["id"],
        "email": record["email"],
        "google_id": record.get("google_id"),
        "name": record.get("name"),
        "role": record.get("role"),
        "is_active": record.get("is_active"),
        "last_login": record.get("last_login"),
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
    }


async def upsert_google_user(
    *,
    email: str,
    google_id: str,
    name: Optional[str],
) -> Dict[str, Any]:
    """
    Create or update a user using Google OAuth profile information.
    """
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow(
                """
                SELECT * FROM users
                WHERE google_id = $1 OR email = $2
                LIMIT 1
                """,
                google_id,
                email,
            )

            if existing:
                updated = await conn.fetchrow(
                    """
                    UPDATE users
                    SET
                        name = COALESCE($1, name),
                        google_id = $2,
                        last_login = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                    RETURNING *
                    """,
                    name,
                    google_id,
                    existing["id"],
                )
                return _record_to_dict(updated)

            inserted = await conn.fetchrow(
                """
                INSERT INTO users (email, google_id, name, last_login)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                RETURNING *
                """,
                email,
                google_id,
                name,
            )
            return _record_to_dict(inserted)


async def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieve a user by their primary key.
    """
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT * FROM users
            WHERE id = $1
            LIMIT 1
            """,
            user_id,
        )
        return _record_to_dict(row) if row else None


async def update_user_last_login(user_id: int) -> None:
    """
    Update the last_login timestamp for a user without returning the row.
    """
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE users
            SET last_login = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            """,
            datetime.utcnow(),
            user_id,
        )

