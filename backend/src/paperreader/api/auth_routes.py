"""
Authentication routes powered by Google OAuth for the FastAPI backend.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Optional

import jwt
from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse

from paperreader.services.users.repository import (
    get_user_by_id,
    upsert_google_user,
)
from paperreader.services.users.schemas import AuthenticatedUser


router = APIRouter(prefix="/auth", tags=["Auth"])

_oauth = OAuth()


def _get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _get_frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:3000")


def _cookie_secure() -> bool:
    return os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true"


def _cookie_domain() -> Optional[str]:
    return os.getenv("AUTH_COOKIE_DOMAIN") or None


def _jwt_secret() -> str:
    return _get_required_env("AUTH_JWT_SECRET")


def _jwt_algorithm() -> str:
    return os.getenv("AUTH_JWT_ALGORITHM", "HS256")


def _token_ttl_minutes() -> int:
    return int(os.getenv("AUTH_TOKEN_TTL_MINUTES", "10080"))  # default 7 days


_oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def _create_jwt_token(user: AuthenticatedUser) -> str:
    expires_at = datetime.utcnow() + timedelta(minutes=_token_ttl_minutes())
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "name": user.name,
        "google_id": user.google_id,
        "exp": expires_at,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=_jwt_algorithm())


def _decode_jwt_token(token: str) -> AuthenticatedUser:
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[_jwt_algorithm()])
        return AuthenticatedUser(
            id=int(payload["sub"]),
            email=payload.get("email"),
            name=payload.get("name"),
            googleId=payload.get("google_id"),
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


def _auth_cookie_settings() -> dict:
    cookie_params = {
        "key": "auth_token",
        "httponly": True,
        "samesite": os.getenv("AUTH_COOKIE_SAMESITE", "lax").lower(),
        "secure": _cookie_secure(),
        "path": "/",
        "max_age": _token_ttl_minutes() * 60,
    }
    domain = _cookie_domain()
    if domain:
        cookie_params["domain"] = domain
    return cookie_params


def _set_auth_cookie(response: JSONResponse, token: str) -> None:
    cookie_params = _auth_cookie_settings()
    response.set_cookie(value=token, **cookie_params)


def _clear_auth_cookie(response: JSONResponse) -> None:
    cookie_params = _auth_cookie_settings()
    response.delete_cookie(
        cookie_params["key"],
        path=cookie_params.get("path", "/"),
        domain=cookie_params.get("domain"),
    )


async def _get_current_user_from_cookie(request: Request) -> AuthenticatedUser:
    token = request.cookies.get("auth_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing credentials")
    user_claims = _decode_jwt_token(token)
    # fetch fresh user state
    user = await get_user_by_id(user_claims.id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return AuthenticatedUser(**user)


@router.get("/google/login")
async def google_login(request: Request, redirect: Optional[str] = None):
    """
    Initiate Google OAuth flow.
    """
    if not _oauth.google.client_id or not _oauth.google.client_secret:
        raise HTTPException(status_code=500, detail="Google OAuth is not configured")

    redirect_uri = request.url_for("google_callback")
    request.session["post_login_redirect"] = redirect or _get_frontend_url()

    return await _oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback", name="google_callback")
async def google_callback(request: Request):
    """
    Handle OAuth callback from Google, persist the user and set auth cookie.
    """
    try:
        token = await _oauth.google.authorize_access_token(request)
    except OAuthError as exc:
        error_url = f"{_get_frontend_url()}/auth/error?message={exc.error}"
        return RedirectResponse(url=error_url, status_code=status.HTTP_302_FOUND)

    user_info = token.get("userinfo")
    if not user_info:
        raise HTTPException(status_code=400, detail="Failed to retrieve user information from Google")

    email = user_info.get("email")
    google_id = user_info.get("sub")
    name = user_info.get("name")

    if not email or not google_id:
        raise HTTPException(status_code=400, detail="Google did not provide required profile data")

    user_dict = await upsert_google_user(
        email=email,
        google_id=google_id,
        name=name,
    )

    user = AuthenticatedUser(**user_dict)
    jwt_token = _create_jwt_token(user)

    redirect_target = request.session.pop("post_login_redirect", _get_frontend_url())
    response = RedirectResponse(url=redirect_target, status_code=status.HTTP_302_FOUND)
    _set_auth_cookie(response, jwt_token)
    return response


@router.get("/me", response_model=AuthenticatedUser)
async def current_user(user: AuthenticatedUser = Depends(_get_current_user_from_cookie)):
    """
    Return the authenticated user's profile.
    """
    return user


@router.post("/logout")
async def logout():
    """
    Invalidate the auth cookie.
    """
    response = JSONResponse({"success": True})
    _clear_auth_cookie(response)
    return response

