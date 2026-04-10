"""Auth & Profile API — Phase 1 Sprint 1-1.

Endpoints:
  GET  /api/auth/me          — 현재 사용자 프로필
  PUT  /api/auth/me          — 프로필 수정
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import get_current_user, CurrentUser
from app.db import get_supabase_admin

router = APIRouter()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------

class ProfileOut(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    avatar_url: str | None = None
    phone: str | None = None
    department: str | None = None
    job_title: str | None = None


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    department: str | None = None
    job_title: str | None = None


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

@router.get("/me", response_model=ProfileOut)
async def get_my_profile(user: CurrentUser = Depends(get_current_user)):
    """현재 로그인 사용자의 프로필 조회."""
    admin = get_supabase_admin()
    result = (
        admin.table("profiles")
        .select("*")
        .eq("id", user.id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return result.data


@router.put("/me", response_model=ProfileOut)
async def update_my_profile(
    body: ProfileUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """현재 사용자 프로필 수정."""
    admin = get_supabase_admin()
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    result = (
        admin.table("profiles")
        .update(update_data)
        .eq("id", user.id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return result.data[0]
