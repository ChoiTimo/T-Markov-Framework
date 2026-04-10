"""Organization CRUD & Member Management — Phase 1 Sprint 1-1.

Endpoints:
  GET    /api/orgs                — 내가 소속된 조직 목록
  POST   /api/orgs                — 조직 생성 (생성자 = owner)
  GET    /api/orgs/{org_id}       — 조직 상세
  PUT    /api/orgs/{org_id}       — 조직 수정 (admin+)
  GET    /api/orgs/{org_id}/members   — 멤버 목록
  POST   /api/orgs/{org_id}/members   — 멤버 초대 (admin+)
  PUT    /api/orgs/{org_id}/members/{user_id} — 역할 변경 (admin+)
  DELETE /api/orgs/{org_id}/members/{user_id} — 멤버 제거 (admin+)
"""

from __future__ import annotations

import re
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import get_current_user, CurrentUser
from app.db import get_supabase_admin

router = APIRouter()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------

class OrgCreate(BaseModel):
    name: str
    slug: str | None = None  # auto-generated if omitted


class OrgUpdate(BaseModel):
    name: str | None = None
    logo_url: str | None = None


class OrgOut(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: str | None = None
    created_at: str


class MemberOut(BaseModel):
    id: str
    user_id: str
    role: str
    joined_at: str
    email: str | None = None
    full_name: str | None = None


class MemberInvite(BaseModel):
    email: str
    role: str = "member"


class MemberRoleUpdate(BaseModel):
    role: str


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"[\s-]+", "-", s)
    return s[:50]


async def _assert_org_role(user: CurrentUser, org_id: str, allowed: list[str]):
    """Raise 403 if user doesn't have one of the allowed roles in the org."""
    admin = get_supabase_admin()
    result = (
        admin.table("org_members")
        .select("role")
        .eq("organization_id", org_id)
        .eq("user_id", user.id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    if result.data["role"] not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

@router.get("/", response_model=list[OrgOut])
async def list_my_orgs(user: CurrentUser = Depends(get_current_user)):
    """내가 소속된 조직 목록."""
    admin = get_supabase_admin()
    memberships = (
        admin.table("org_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .execute()
    )
    org_ids = [m["organization_id"] for m in (memberships.data or [])]
    if not org_ids:
        return []

    orgs = (
        admin.table("organizations")
        .select("*")
        .in_("id", org_ids)
        .execute()
    )
    return orgs.data or []


@router.post("/", response_model=OrgOut, status_code=status.HTTP_201_CREATED)
async def create_org(body: OrgCreate, user: CurrentUser = Depends(get_current_user)):
    """조직 생성 — 생성자가 자동으로 owner가 됨."""
    admin = get_supabase_admin()
    slug = body.slug or _slugify(body.name)

    # Create org
    org_result = (
        admin.table("organizations")
        .insert({"name": body.name, "slug": slug})
        .execute()
    )
    if not org_result.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create organization")

    org = org_result.data[0]

    # Add creator as owner
    admin.table("org_members").insert({
        "organization_id": org["id"],
        "user_id": user.id,
        "role": "owner",
        "invited_by": user.id,
    }).execute()

    return org


@router.get("/{org_id}", response_model=OrgOut)
async def get_org(org_id: str, user: CurrentUser = Depends(get_current_user)):
    """조직 상세 (멤버만 접근 가능)."""
    await _assert_org_role(user, org_id, ["owner", "admin", "member", "viewer"])
    admin = get_supabase_admin()
    result = admin.table("organizations").select("*").eq("id", org_id).maybe_single().execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return result.data


@router.put("/{org_id}", response_model=OrgOut)
async def update_org(
    org_id: str,
    body: OrgUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """조직 수정 (admin 이상)."""
    await _assert_org_role(user, org_id, ["owner", "admin"])
    admin = get_supabase_admin()
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    result = admin.table("organizations").update(update_data).eq("id", org_id).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return result.data[0]


# ------------------------------------------------------------------
# Members
# ------------------------------------------------------------------

@router.get("/{org_id}/members", response_model=list[MemberOut])
async def list_members(org_id: str, user: CurrentUser = Depends(get_current_user)):
    """조직 멤버 목록 (프로필 정보 포함)."""
    await _assert_org_role(user, org_id, ["owner", "admin", "member", "viewer"])
    admin = get_supabase_admin()

    members = (
        admin.table("org_members")
        .select("id, user_id, role, joined_at")
        .eq("organization_id", org_id)
        .order("joined_at")
        .execute()
    )

    # Enrich with profile info
    result = []
    for m in (members.data or []):
        profile = (
            admin.table("profiles")
            .select("email, full_name")
            .eq("id", m["user_id"])
            .maybe_single()
            .execute()
        )
        result.append({
            **m,
            "email": profile.data.get("email") if profile.data else None,
            "full_name": profile.data.get("full_name") if profile.data else None,
        })

    return result


@router.post("/{org_id}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def invite_member(
    org_id: str,
    body: MemberInvite,
    user: CurrentUser = Depends(get_current_user),
):
    """멤버 초대 (admin 이상). 이메일로 기존 사용자 검색."""
    await _assert_org_role(user, org_id, ["owner", "admin"])
    admin = get_supabase_admin()

    if body.role not in ("admin", "member", "viewer"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role. Allowed: admin, member, viewer",
        )

    # Find user by email
    profile = (
        admin.table("profiles")
        .select("id, email, full_name")
        .eq("email", body.email)
        .maybe_single()
        .execute()
    )
    if not profile.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No user found with email: {body.email}",
        )

    target_user_id = profile.data["id"]

    # Check if already a member
    existing = (
        admin.table("org_members")
        .select("id")
        .eq("organization_id", org_id)
        .eq("user_id", target_user_id)
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this organization",
        )

    # Insert membership
    result = (
        admin.table("org_members")
        .insert({
            "organization_id": org_id,
            "user_id": target_user_id,
            "role": body.role,
            "invited_by": user.id,
        })
        .execute()
    )

    member = result.data[0]
    return {
        **member,
        "email": profile.data.get("email"),
        "full_name": profile.data.get("full_name"),
    }


@router.put("/{org_id}/members/{user_id}")
async def update_member_role(
    org_id: str,
    user_id: str,
    body: MemberRoleUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """멤버 역할 변경 (admin 이상)."""
    await _assert_org_role(user, org_id, ["owner", "admin"])

    if body.role not in ("owner", "admin", "member", "viewer"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    admin = get_supabase_admin()
    result = (
        admin.table("org_members")
        .update({"role": body.role})
        .eq("organization_id", org_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return {"status": "updated", "role": body.role}


@router.delete("/{org_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    org_id: str,
    user_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """멤버 제거 (admin 이상). Owner는 제거 불가."""
    await _assert_org_role(user, org_id, ["owner", "admin"])
    admin = get_supabase_admin()

    # Can't remove an owner
    target = (
        admin.table("org_members")
        .select("role")
        .eq("organization_id", org_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if target.data and target.data["role"] == "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot remove the organization owner",
        )

    admin.table("org_members").delete().eq("organization_id", org_id).eq("user_id", user_id).execute()
