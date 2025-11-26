"""
Pydantic models for user authentication payloads.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AuthenticatedUser(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    google_id: Optional[str] = Field(None, alias="googleId")
    role: Optional[str] = None
    is_active: Optional[bool] = Field(None, alias="isActive")
    last_login: Optional[datetime] = Field(None, alias="lastLogin")
    created_at: Optional[datetime] = Field(None, alias="createdAt")
    updated_at: Optional[datetime] = Field(None, alias="updatedAt")

    class Config:
        populate_by_name = True

