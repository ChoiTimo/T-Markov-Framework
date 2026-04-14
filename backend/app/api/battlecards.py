"""Battle Card API — Phase 2 Sprint 2-2.

Competitors + Battle Cards + Points (drag-and-drop) + References + AI stub.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth import CurrentUser, get_current_user
from app.db import get_supabase_admin

router = APIRouter()

PointType = Literal["strength", "weakness", "differentiator", "counter", "question", "insight"]
BCStatus = Literal["draft", "published", "archived"]
RefType = Literal["news", "case", "research", "video", "other"]


# ----- Schemas -----

class CompetitorIn(BaseModel):
    organization_id: str
    name: str
    slug: str | None = None
    logo_url: str | None = None
    website: str | None = None
    category: str | None = None
    threat_level: int = Field(default=3, ge=1, le=5)
    summary: str | None = None
    target_segments: list[str] = Field(default_factory=list)
    market_share: str | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class CompetitorPatch(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    website: str | None = None
    category: str | None = None
    threat_level: int | None = Field(default=None, ge=1, le=5)
    summary: str | None = None
    target_segments: list[str] | None = None
    market_share: str | None = None
    tags: list[str] | None = None
    is_active: bool | None = None
    metadata: dict | None = None


class PointIn(BaseModel):
    type: PointType
    title: str
    detail: str | None = None
    evidence_url: str | None = None
    priority: int = Field(default=3, ge=1, le=5)
    sort_order: int = 0
    ai_generated: bool = False
    ai_model: str | None = None


class PointPatch(BaseModel):
    title: str | None = None
    detail: str | None = None
    evidence_url: str | None = None
    priority: int | None = Field(default=None, ge=1, le=5)
    type: PointType | None = None


class ReorderItem(BaseModel):
    id: str
    sort_order: int


class BattleCardCreate(BaseModel):
    organization_id: str
    competitor_id: str | None = None
    competitor: CompetitorIn | None = None
    title: str
    subtitle: str | None = None
    overview: str | None = None
    key_insight: str | None = None
    initial_points: list[PointIn] = Field(default_factory=list)


class BattleCardPatch(BaseModel):
    title: str | None = None
    subtitle: str | None = None
    overview: str | None = None
    key_insight: str | None = None
    status: BCStatus | None = None
    owner_user_id: str | None = None
    next_review_at: str | None = None
    metadata: dict | None = None


class ReferenceIn(BaseModel):
    source_type: RefType = "other"
    title: str
    url: str | None = None
    summary: str | None = None
    published_at: str | None = None


# ----- Helpers -----

async def _assert_org_role(user: CurrentUser, org_id: str, allowed: list[str]):
    admin = get_supabase_admin()
    r = (
        admin.table("org_members").select("role")
        .eq("organization_id", org_id).eq("user_id", user.id)
        .maybe_single().execute()
    )
    if not r.data:
        raise HTTPException(403, "Not a member")
    if r.data["role"] not in allowed:
        raise HTTPException(403, f"Requires: {', '.join(allowed)}")


async def _load_card_or_404(card_id: str, user: CurrentUser) -> dict:
    admin = get_supabase_admin()
    r = admin.table("battle_cards").select("*").eq("id", card_id).maybe_single().execute()
    if not r.data:
        raise HTTPException(404, "Battle card not found")
    await _assert_org_role(user, r.data["organization_id"], ["owner", "admin", "member", "viewer"])
    return r.data


async def _fetch_full_card(card_id: str) -> dict:
    admin = get_supabase_admin()
    card = admin.table("battle_cards").select("*").eq("id", card_id).maybe_single().execute().data
    if not card:
        raise HTTPException(404, "Not found")
    comp = admin.table("competitors").select("*").eq("id", card["competitor_id"]).maybe_single().execute().data
    points = admin.table("battle_points").select("*").eq("battle_card_id", card_id).order("type").order("sort_order").execute().data or []
    refs = admin.table("battle_references").select("*").eq("battle_card_id", card_id).order("published_at", desc=True).execute().data or []
    return {**card, "competitor": comp, "points": points, "references": refs}


# ===== Competitors =====

@router.get("/competitors")
async def list_competitors(
    org_id: str = Query(...),
    category: str | None = None,
    q: str | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    await _assert_org_role(user, org_id, ["owner", "admin", "member", "viewer"])
    admin = get_supabase_admin()
    qb = admin.table("competitors").select("*").eq("organization_id", org_id).eq("is_active", True).order("sort_order").order("name")
    if category:
        qb = qb.eq("category", category)
    if q:
        qb = qb.ilike("name", f"%{q}%")
    return qb.execute().data or []


@router.post("/competitors", status_code=201)
async def create_competitor(body: CompetitorIn, user: CurrentUser = Depends(get_current_user)):
    await _assert_org_role(user, body.organization_id, ["owner", "admin", "member"])
    admin = get_supabase_admin()
    r = admin.table("competitors").insert(body.model_dump()).execute()
    if not r.data:
        raise HTTPException(400, "Failed")
    return r.data[0]


@router.put("/competitors/{cid}")
async def update_competitor(cid: str, body: CompetitorPatch, user: CurrentUser = Depends(get_current_user)):
    admin = get_supabase_admin()
    existing = admin.table("competitors").select("organization_id").eq("id", cid).maybe_single().execute()
    if not existing.data:
        raise HTTPException(404, "Not found")
    await _assert_org_role(user, existing.data["organization_id"], ["owner", "admin", "member"])
    patch = body.model_dump(exclude_none=True)
    if not patch:
        return admin.table("competitors").select("*").eq("id", cid).maybe_single().execute().data
    r = admin.table("competitors").update(patch).eq("id", cid).execute()
    return r.data[0] if r.data else None


@router.delete("/competitors/{cid}", status_code=204)
async def delete_competitor(cid: str, user: CurrentUser = Depends(get_current_user)):
    admin = get_supabase_admin()
    existing = admin.table("competitors").select("organization_id").eq("id", cid).maybe_single().execute()
    if not existing.data:
        raise HTTPException(404, "Not found")
    await _assert_org_role(user, existing.data["organization_id"], ["owner", "admin"])
    admin.table("competitors").delete().eq("id", cid).execute()


# ===== Battle Cards =====

@router.get("")
async def list_cards(
    org_id: str = Query(...),
    status_filter: str | None = Query(None, alias="status"),
    category: str | None = None,
    threat_min: int | None = None,
    q: str | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    await _assert_org_role(user, org_id, ["owner", "admin", "member", "viewer"])
    admin = get_supabase_admin()
    qb = admin.table("battle_cards").select("*, competitors!inner(*)").eq("organization_id", org_id).order("updated_at", desc=True)
    if status_filter:
        qb = qb.eq("status", status_filter)
    if category:
        qb = qb.eq("competitors.category", category)
    if threat_min:
        qb = qb.gte("competitors.threat_level", threat_min)
    if q:
        qb = qb.or_(f"title.ilike.%{q}%,key_insight.ilike.%{q}%")
    raw = qb.execute().data or []
    out = []
    for row in raw:
        comp = row.pop("competitors", None)
        out.append({**row, "competitor": comp})
    return out


@router.get("/{card_id}")
async def get_card(card_id: str, user: CurrentUser = Depends(get_current_user)):
    await _load_card_or_404(card_id, user)
    return await _fetch_full_card(card_id)


@router.post("", status_code=201)
async def create_card(body: BattleCardCreate, user: CurrentUser = Depends(get_current_user)):
    await _assert_org_role(user, body.organization_id, ["owner", "admin", "member"])
    admin = get_supabase_admin()

    competitor_id = body.competitor_id
    if not competitor_id and body.competitor:
        comp_row = body.competitor.model_dump()
        comp_row["organization_id"] = body.organization_id
        cr = admin.table("competitors").insert(comp_row).execute()
        if not cr.data:
            raise HTTPException(400, "Failed to create competitor")
        competitor_id = cr.data[0]["id"]
    if not competitor_id:
        raise HTTPException(400, "competitor_id or competitor required")

    card_row = {
        "organization_id": body.organization_id,
        "competitor_id": competitor_id,
        "title": body.title,
        "subtitle": body.subtitle,
        "overview": body.overview,
        "key_insight": body.key_insight,
        "owner_user_id": user.id,
        "created_by": user.id,
        "updated_by": user.id,
    }
    c = admin.table("battle_cards").insert(card_row).execute()
    if not c.data:
        raise HTTPException(400, "Duplicate or failed")
    card_id = c.data[0]["id"]

    if body.initial_points:
        pts = [{**p.model_dump(), "battle_card_id": card_id, "created_by": user.id} for p in body.initial_points]
        admin.table("battle_points").insert(pts).execute()

    return await _fetch_full_card(card_id)


@router.put("/{card_id}")
async def update_card(card_id: str, body: BattleCardPatch, user: CurrentUser = Depends(get_current_user)):
    card = await _load_card_or_404(card_id, user)
    await _assert_org_role(user, card["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()
    patch = body.model_dump(exclude_none=True)
    patch["updated_by"] = user.id
    admin.table("battle_cards").update(patch).eq("id", card_id).execute()
    return await _fetch_full_card(card_id)


@router.delete("/{card_id}", status_code=204)
async def delete_card(card_id: str, user: CurrentUser = Depends(get_current_user)):
    card = await _load_card_or_404(card_id, user)
    await _assert_org_role(user, card["organization_id"], ["owner", "admin"])
    get_supabase_admin().table("battle_cards").delete().eq("id", card_id).execute()


@router.post("/{card_id}/publish")
async def publish_card(card_id: str, user: CurrentUser = Depends(get_current_user)):
    card = await _load_card_or_404(card_id, user)
    await _assert_org_role(user, card["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()
    admin.table("battle_cards").update({
        "status": "published",
        "last_reviewed_at": datetime.utcnow().isoformat(),
        "updated_by": user.id,
    }).eq("id", card_id).execute()
    return await _fetch_full_card(card_id)


@router.post("/{card_id}/archive")
async def archive_card(card_id: str, user: CurrentUser = Depends(get_current_user)):
    card = await _load_card_or_404(card_id, user)
    await _assert_org_role(user, card["organization_id"], ["owner", "admin"])
    get_supabase_admin().table("battle_cards").update({
        "status": "archived", "updated_by": user.id,
    }).eq("id", card_id).execute()
    return await _fetch_full_card(card_id)


# ===== Points =====

@router.post("/{card_id}/points", status_code=201)
async def add_point(card_id: str, body: PointIn, user: CurrentUser = Depends(get_current_user)):
    card = await _load_card_or_404(card_id, user)
    await _assert_org_role(user, card["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()
    row = {**body.model_dump(), "battle_card_id": card_id, "created_by": user.id}
    r = admin.table("battle_points").insert(row).execute()
    return r.data[0] if r.data else None


@router.patch("/{card_id}/points/{pid}")
async def patch_point(card_id: str, pid: str, body: PointPatch, user: CurrentUser = Depends(get_current_user)):
    card = await _load_card_or_404(card_id, user)
    await _assert_org_role(user, card["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()
    patch = body.model_dump(exclude_none=True)
    if not patch:
        return admin.table("battle_points").select("*").eq("id", pid).maybe_single().execute().data
    r = admin.table("battle_points").update(patch).eq("id", pid).eq("battle_card_id", card_id).execute()
    return r.data[0] if r.data else None


@router.delete("/{card_id}/points/{pid}", status_code=204)
async def delete_point(card_id: str, pid: str, user: CurrentUser = Depends(get_current_user)):
    card = await _load_card_or_404(card_id, user)
    await _assert_org_role(user, card["organization_id"], ["owner", "admin", "member"])
    get_supabase_admin().table("battle_points").delete().eq("id", pid).eq("battle_card_id", card_id).execute()


@router.put("/{card_id}/points/reorder")
async def reorder_points(card_id: str, items: list[ReorderItem], user: CurrentUser = Depends(get_current_user)):
    card = await _load_card_or_404(card_id, user)
    await _assert_org_role(user, card["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()
    for it in items:
        admin.table("battle_points").update({"sort_order": it.sort_order}).eq("id", it.id).eq("battle_card_id", card_id).execute()
    return {"updated": len(items)}


# ===== References =====

@router.post("/{card_id}/references", status_code=201)
async def add_reference(card_id: str, body: ReferenceIn, user: CurrentUser = Depends(get_current_user)):
    card = await _load_card_or_404(card_id, user)
    await _assert_org_role(user, card["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()
    row = {**body.model_dump(), "battle_card_id": card_id, "added_by": user.id}
    r = admin.table("battle_references").insert(row).execute()
    return r.data[0] if r.data else None


@router.delete("/{card_id}/references/{rid}", status_code=204)
async def delete_reference(card_id: str, rid: str, user: CurrentUser = Depends(get_current_user)):
    card = await _load_card_or_404(card_id, user)
    await _assert_org_role(user, card["organization_id"], ["owner", "admin", "member"])
    get_supabase_admin().table("battle_references").delete().eq("id", rid).eq("battle_card_id", card_id).execute()


# ===== AI stub (Phase 3) =====

@router.post("/{card_id}/ai-suggest")
async def ai_suggest(card_id: str, user: CurrentUser = Depends(get_current_user)):
    await _load_card_or_404(card_id, user)
    return {
        "status": "pending_implementation",
        "message": "AI 제안 기능은 Phase 3 Sprint 3-2에서 구현됩니다.",
        "card_id": card_id,
    }
