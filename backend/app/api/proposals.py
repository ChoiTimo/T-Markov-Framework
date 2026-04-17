"""Proposal Generator API — Phase 2 Sprint 2-3.

Endpoints:
  /templates              — GET list, POST create, PATCH/DELETE (admin)
  /modules                — GET slide module catalog
  /                       — GET list proposals, POST create
  /{id}                   — GET / PATCH / DELETE
  /{id}/slides            — GET list, PUT reorder
  /{id}/slides/{slide_id} — PATCH (edit body/enable)
  /{id}/assemble          — POST regenerate slides from modules + context
  /{id}/render            — POST render PPTX (returns binary)
  /{id}/publish           — POST mark as approved/sent
  /{id}/versions          — GET list, POST snapshot
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.auth import CurrentUser, get_current_user
from app.db import get_supabase_admin
from app.services.proposal import (
    ProposalContext,
    SelectionInput,
    assemble_pptx,
    attach_cross_references,
    build_slide_instances,
    select_modules,
    validate_selection,
)

router = APIRouter()

ProposalStatus = Literal["draft", "in_review", "approved", "sent", "won", "lost", "archived"]
TargetPersona = Literal["c_level", "practitioner", "overseas_partner", "public_sector"]
NeuroLevel = Literal["minimal", "standard", "full"]


# ----- Schemas -----

class ProposalCreate(BaseModel):
    organization_id: str
    template_id: str | None = None
    title: str
    subtitle: str | None = None
    customer_name: str | None = None
    customer_company: str | None = None
    customer_segment: str | None = None
    customer_industry: str | None = None
    target_persona: TargetPersona = "c_level"
    neuro_level: NeuroLevel = "standard"
    industry: str | None = None
    quote_id: str | None = None
    battle_card_ids: list[str] = Field(default_factory=list)
    stakeholders: list[dict] = Field(default_factory=list)
    notes: str | None = None
    metadata: dict = Field(default_factory=dict)


class ProposalPatch(BaseModel):
    title: str | None = None
    subtitle: str | None = None
    customer_name: str | None = None
    customer_company: str | None = None
    customer_segment: str | None = None
    customer_industry: str | None = None
    target_persona: TargetPersona | None = None
    neuro_level: NeuroLevel | None = None
    industry: str | None = None
    quote_id: str | None = None
    battle_card_ids: list[str] | None = None
    stakeholders: list[dict] | None = None
    status: ProposalStatus | None = None
    notes: str | None = None
    metadata: dict | None = None


class SlidePatch(BaseModel):
    title: str | None = None
    subtitle: str | None = None
    body: dict | None = None
    speaker_notes: str | None = None
    is_enabled: bool | None = None


class ReorderItem(BaseModel):
    id: str
    sort_order: int


class AssembleRequest(BaseModel):
    force_include_codes: list[str] = Field(default_factory=list)
    force_exclude_codes: list[str] = Field(default_factory=list)
    preserve_customizations: bool = True


class TemplateCreate(BaseModel):
    organization_id: str | None = None
    code: str
    name: str
    description: str | None = None
    industry: str | None = None
    target_persona: TargetPersona = "c_level"
    neuro_level: NeuroLevel = "standard"
    default_cover_title: str | None = None
    module_codes: list[str] = Field(default_factory=list)


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


async def _load_proposal_or_404(proposal_id: str, user: CurrentUser) -> dict:
    admin = get_supabase_admin()
    r = admin.table("proposals").select("*").eq("id", proposal_id).maybe_single().execute()
    if not r.data:
        raise HTTPException(404, "Proposal not found")
    await _assert_org_role(user, r.data["organization_id"], ["owner", "admin", "member", "viewer"])
    return r.data


def _fetch_template_modules(template_id: str) -> list[dict]:
    admin = get_supabase_admin()
    links = (
        admin.table("proposal_template_modules").select("*, proposal_slide_modules(*)")
        .eq("template_id", template_id).order("sort_order").execute().data or []
    )
    out = []
    for link in links:
        mod = link.get("proposal_slide_modules") or {}
        if mod:
            out.append({**mod, "_template_sort": link.get("sort_order")})
    return out


def _fetch_all_modules(org_id: str | None) -> list[dict]:
    admin = get_supabase_admin()
    qb = admin.table("proposal_slide_modules").select("*").eq("is_active", True)
    if org_id:
        qb = qb.or_(f"organization_id.is.null,organization_id.eq.{org_id}")
    else:
        qb = qb.is_("organization_id", "null")
    return qb.order("sort_order").execute().data or []


# ===== Templates =====

@router.get("/templates")
async def list_templates(
    org_id: str | None = Query(None),
    user: CurrentUser = Depends(get_current_user),
):
    admin = get_supabase_admin()
    qb = admin.table("proposal_templates").select("*").eq("is_active", True)
    if org_id:
        await _assert_org_role(user, org_id, ["owner", "admin", "member", "viewer"])
        qb = qb.or_(f"organization_id.is.null,organization_id.eq.{org_id}")
    else:
        qb = qb.is_("organization_id", "null")
    return qb.order("sort_order").execute().data or []


@router.get("/templates/{template_id}")
async def get_template(template_id: str, user: CurrentUser = Depends(get_current_user)):
    admin = get_supabase_admin()
    t = admin.table("proposal_templates").select("*").eq("id", template_id).maybe_single().execute().data
    if not t:
        raise HTTPException(404, "Template not found")
    if t.get("organization_id"):
        await _assert_org_role(user, t["organization_id"], ["owner", "admin", "member", "viewer"])
    modules = _fetch_template_modules(template_id)
    return {**t, "modules": modules}


@router.post("/templates", status_code=201)
async def create_template(body: TemplateCreate, user: CurrentUser = Depends(get_current_user)):
    if body.organization_id:
        await _assert_org_role(user, body.organization_id, ["owner", "admin"])
    admin = get_supabase_admin()
    payload = body.model_dump(exclude={"module_codes"})
    res = admin.table("proposal_templates").insert(payload).execute()
    if not res.data:
        raise HTTPException(400, "Failed to create template")
    tpl = res.data[0]

    if body.module_codes:
        mods = (
            admin.table("proposal_slide_modules").select("id, code")
            .in_("code", body.module_codes).execute().data or []
        )
        rows = [
            {"template_id": tpl["id"], "module_id": m["id"], "sort_order": idx * 10}
            for idx, m in enumerate(mods)
        ]
        if rows:
            admin.table("proposal_template_modules").insert(rows).execute()
    return {**tpl, "modules": _fetch_template_modules(tpl["id"])}


# ===== Module catalog =====

@router.get("/modules")
async def list_modules(
    org_id: str | None = Query(None),
    phase: str | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    if org_id:
        await _assert_org_role(user, org_id, ["owner", "admin", "member", "viewer"])
    rows = _fetch_all_modules(org_id)
    if phase:
        rows = [r for r in rows if r.get("phase") == phase]
    return rows


# ===== Proposals =====

@router.get("")
async def list_proposals(
    org_id: str = Query(...),
    status_filter: str | None = Query(None, alias="status"),
    q: str | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    await _assert_org_role(user, org_id, ["owner", "admin", "member", "viewer"])
    admin = get_supabase_admin()
    qb = admin.table("proposals").select("*").eq("organization_id", org_id).order("updated_at", desc=True)
    if status_filter:
        qb = qb.eq("status", status_filter)
    if q:
        qb = qb.or_(f"title.ilike.%{q}%,customer_company.ilike.%{q}%,customer_name.ilike.%{q}%")
    return qb.execute().data or []


@router.get("/{proposal_id}")
async def get_proposal(proposal_id: str, user: CurrentUser = Depends(get_current_user)):
    proposal = await _load_proposal_or_404(proposal_id, user)
    admin = get_supabase_admin()
    slides = (
        admin.table("proposal_slides").select("*")
        .eq("proposal_id", proposal_id).order("sort_order").execute().data or []
    )
    quote = None
    if proposal.get("quote_id"):
        quote = admin.table("quotes").select("*").eq("id", proposal["quote_id"]).maybe_single().execute().data
    battle_cards = []
    if proposal.get("battle_card_ids"):
        battle_cards = (
            admin.table("battle_cards").select("*, competitors(*)")
            .in_("id", proposal["battle_card_ids"]).execute().data or []
        )
    return {
        **proposal,
        "slides": slides,
        "quote": quote,
        "battle_cards": battle_cards,
    }


@router.post("", status_code=201)
async def create_proposal(body: ProposalCreate, user: CurrentUser = Depends(get_current_user)):
    await _assert_org_role(user, body.organization_id, ["owner", "admin", "member"])
    admin = get_supabase_admin()

    payload = body.model_dump()
    payload["created_by"] = user.id
    payload["updated_by"] = user.id

    res = admin.table("proposals").insert(payload).execute()
    if not res.data:
        raise HTTPException(400, "Failed to create proposal")
    proposal = res.data[0]

    # 초기 슬라이드 자동 조립
    try:
        await _assemble_internal(
            proposal,
            force_include_codes=[],
            force_exclude_codes=[],
            preserve_customizations=False,
        )
    except Exception as exc:  # noqa: BLE001
        proposal["_assemble_warning"] = str(exc)

    full = admin.table("proposals").select("*").eq("id", proposal["id"]).maybe_single().execute().data
    slides = (
        admin.table("proposal_slides").select("*")
        .eq("proposal_id", proposal["id"]).order("sort_order").execute().data or []
    )
    return {**full, "slides": slides}


@router.patch("/{proposal_id}")
async def update_proposal(
    proposal_id: str,
    body: ProposalPatch,
    user: CurrentUser = Depends(get_current_user),
):
    existing = await _load_proposal_or_404(proposal_id, user)
    await _assert_org_role(user, existing["organization_id"], ["owner", "admin", "member"])
    patch = body.model_dump(exclude_none=True)
    if not patch:
        return existing
    patch["updated_by"] = user.id
    admin = get_supabase_admin()
    r = admin.table("proposals").update(patch).eq("id", proposal_id).execute()
    return r.data[0] if r.data else existing


@router.delete("/{proposal_id}", status_code=204)
async def delete_proposal(proposal_id: str, user: CurrentUser = Depends(get_current_user)):
    existing = await _load_proposal_or_404(proposal_id, user)
    await _assert_org_role(user, existing["organization_id"], ["owner", "admin"])
    admin = get_supabase_admin()
    admin.table("proposals").delete().eq("id", proposal_id).execute()


# ===== Slides =====

@router.get("/{proposal_id}/slides")
async def list_slides(proposal_id: str, user: CurrentUser = Depends(get_current_user)):
    await _load_proposal_or_404(proposal_id, user)
    admin = get_supabase_admin()
    return (
        admin.table("proposal_slides").select("*")
        .eq("proposal_id", proposal_id).order("sort_order").execute().data or []
    )


@router.patch("/{proposal_id}/slides/{slide_id}")
async def patch_slide(
    proposal_id: str,
    slide_id: str,
    body: SlidePatch,
    user: CurrentUser = Depends(get_current_user),
):
    proposal = await _load_proposal_or_404(proposal_id, user)
    await _assert_org_role(user, proposal["organization_id"], ["owner", "admin", "member"])
    patch = body.model_dump(exclude_none=True)
    if not patch:
        return None
    patch["is_customized"] = True
    admin = get_supabase_admin()
    r = (
        admin.table("proposal_slides").update(patch)
        .eq("id", slide_id).eq("proposal_id", proposal_id).execute()
    )
    return r.data[0] if r.data else None


@router.put("/{proposal_id}/slides/reorder")
async def reorder_slides(
    proposal_id: str,
    items: list[ReorderItem],
    user: CurrentUser = Depends(get_current_user),
):
    proposal = await _load_proposal_or_404(proposal_id, user)
    await _assert_org_role(user, proposal["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()
    for item in items:
        admin.table("proposal_slides").update({"sort_order": item.sort_order}).eq(
            "id", item.id
        ).eq("proposal_id", proposal_id).execute()
    return {"ok": True, "count": len(items)}


# ===== Core assembly =====

async def _assemble_internal(
    proposal: dict,
    force_include_codes: list[str],
    force_exclude_codes: list[str],
    preserve_customizations: bool,
) -> dict:
    admin = get_supabase_admin()
    org_id = proposal["organization_id"]

    template_module_codes: list[str] | None = None
    if proposal.get("template_id"):
        tpl_mods = _fetch_template_modules(proposal["template_id"])
        template_module_codes = [m["code"] for m in tpl_mods if m.get("code")]
    available = _fetch_all_modules(org_id)

    selection = select_modules(
        available,
        SelectionInput(
            target_persona=proposal.get("target_persona") or "c_level",
            neuro_level=proposal.get("neuro_level") or "standard",
            industry=proposal.get("industry") or proposal.get("customer_industry") or "general",
            template_module_codes=template_module_codes,
            force_include_codes=force_include_codes,
            force_exclude_codes=force_exclude_codes,
        ),
    )
    warnings = validate_selection(selection)

    quote = None
    quote_items: list[dict] = []
    if proposal.get("quote_id"):
        quote = admin.table("quotes").select("*").eq("id", proposal["quote_id"]).maybe_single().execute().data
        quote_items = (
            admin.table("quote_items").select("*")
            .eq("quote_id", proposal["quote_id"]).order("sort_order").execute().data or []
        )
    battle_cards: list[dict] = []
    battle_points: list[dict] = []
    if proposal.get("battle_card_ids"):
        battle_cards = (
            admin.table("battle_cards").select("*")
            .in_("id", proposal["battle_card_ids"]).execute().data or []
        )
        battle_points = (
            admin.table("battle_points").select("*")
            .in_("battle_card_id", proposal["battle_card_ids"]).order("priority", desc=True).execute().data or []
        )

    ctx = ProposalContext(
        proposal=proposal,
        selected_modules=selection.modules,
        quote=quote,
        quote_items=quote_items,
        battle_cards=battle_cards,
        battle_points=battle_points,
    )
    instances = build_slide_instances(ctx)
    instances = attach_cross_references(instances, quote_items, battle_points)

    existing = (
        admin.table("proposal_slides").select("id, code, is_customized")
        .eq("proposal_id", proposal["id"]).execute().data or []
    )

    preserved_codes: set[str] = set()
    if preserve_customizations:
        keep_ids = [r["id"] for r in existing if r.get("is_customized")]
        preserved_codes = {r["code"] for r in existing if r.get("is_customized")}
        if keep_ids:
            admin.table("proposal_slides").delete().eq("proposal_id", proposal["id"]).not_.in_("id", keep_ids).execute()
        else:
            admin.table("proposal_slides").delete().eq("proposal_id", proposal["id"]).execute()
    else:
        admin.table("proposal_slides").delete().eq("proposal_id", proposal["id"]).execute()

    new_rows = []
    for inst in instances:
        if inst.get("code") in preserved_codes:
            continue
        row = {"proposal_id": proposal["id"]}
        row.update(inst)
        new_rows.append(row)
    if new_rows:
        admin.table("proposal_slides").insert(new_rows).execute()

    return {
        "selection_stats": selection.stats,
        "warnings": warnings,
        "slide_count": len(instances),
        "preserved_count": len(preserved_codes),
    }


@router.post("/{proposal_id}/assemble")
async def assemble_endpoint(
    proposal_id: str,
    body: AssembleRequest,
    user: CurrentUser = Depends(get_current_user),
):
    proposal = await _load_proposal_or_404(proposal_id, user)
    await _assert_org_role(user, proposal["organization_id"], ["owner", "admin", "member"])
    result = await _assemble_internal(
        proposal,
        force_include_codes=body.force_include_codes,
        force_exclude_codes=body.force_exclude_codes,
        preserve_customizations=body.preserve_customizations,
    )
    admin = get_supabase_admin()
    slides = (
        admin.table("proposal_slides").select("*")
        .eq("proposal_id", proposal_id).order("sort_order").execute().data or []
    )
    return {"result": result, "slides": slides}


# ===== Rendering =====

@router.post("/{proposal_id}/render")
async def render_pptx(proposal_id: str, user: CurrentUser = Depends(get_current_user)):
    proposal = await _load_proposal_or_404(proposal_id, user)
    admin = get_supabase_admin()
    slides = (
        admin.table("proposal_slides").select("*")
        .eq("proposal_id", proposal_id).eq("is_enabled", True)
        .order("sort_order").execute().data or []
    )
    if not slides:
        raise HTTPException(400, "No slides to render. Run /assemble first.")

    pptx_bytes = assemble_pptx(proposal, slides)

    admin.table("proposals").update({
        "last_rendered_at": datetime.utcnow().isoformat(),
        "last_pptx_size": len(pptx_bytes),
    }).eq("id", proposal_id).execute()

    filename = f"{proposal.get('proposal_number') or 'proposal'}.pptx"
    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ===== Publish / versions =====

@router.post("/{proposal_id}/publish")
async def publish_proposal(
    proposal_id: str,
    new_status: ProposalStatus = Query("in_review"),
    user: CurrentUser = Depends(get_current_user),
):
    proposal = await _load_proposal_or_404(proposal_id, user)
    await _assert_org_role(user, proposal["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()
    r = admin.table("proposals").update({
        "status": new_status,
        "updated_by": user.id,
    }).eq("id", proposal_id).execute()
    return r.data[0] if r.data else None


@router.get("/{proposal_id}/versions")
async def list_versions(proposal_id: str, user: CurrentUser = Depends(get_current_user)):
    await _load_proposal_or_404(proposal_id, user)
    admin = get_supabase_admin()
    return (
        admin.table("proposal_versions").select("*")
        .eq("proposal_id", proposal_id).order("version_number", desc=True).execute().data or []
    )


@router.post("/{proposal_id}/versions", status_code=201)
async def snapshot_version(
    proposal_id: str,
    change_summary: str | None = Query(None),
    user: CurrentUser = Depends(get_current_user),
):
    proposal = await _load_proposal_or_404(proposal_id, user)
    await _assert_org_role(user, proposal["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()

    slides = (
        admin.table("proposal_slides").select("*")
        .eq("proposal_id", proposal_id).order("sort_order").execute().data or []
    )

    next_version = (proposal.get("current_version") or 1)
    snap = {
        "proposal": proposal,
        "slides": slides,
        "snapshot_at": datetime.utcnow().isoformat(),
    }
    v = admin.table("proposal_versions").insert({
        "proposal_id": proposal_id,
        "version_number": next_version,
        "snapshot": snap,
        "change_summary": change_summary,
        "created_by": user.id,
    }).execute()
    admin.table("proposals").update({
        "current_version": next_version + 1,
    }).eq("id", proposal_id).execute()
    return v.data[0] if v.data else None


# ===== Claude API recommendation stub (Sprint 2-5) =====

@router.post("/{proposal_id}/recommend")
async def recommend_modules(proposal_id: str, user: CurrentUser = Depends(get_current_user)):
    await _load_proposal_or_404(proposal_id, user)
    return {
        "message": "Claude API recommendation stub — will be implemented in Sprint 2-5",
        "sprint": "2-5",
    }
