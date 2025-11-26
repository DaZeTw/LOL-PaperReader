from typing import Optional

from fastapi import Header, HTTPException, Query


async def require_user_id(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    user_id_query: Optional[str] = Query(None, alias="userId"),
) -> str:
    """
    Resolve the authenticated user identifier from headers or query params.

    The frontend is expected to forward the session's user id using the
    `X-User-Id` header (preferred) or the legacy `userId` query parameter.
    """
    user_id = x_user_id or user_id_query
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user identifier")
    return user_id

