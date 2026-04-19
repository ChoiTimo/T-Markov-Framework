"""Proposal Generator API — Phase 2 Sprint 2-3.

Endpoints:
  /templates                           — GET list, POST create, PATCH/DELETE (admin)
  /modules                             — GET slide module catalog
  /                                    — GET list proposals, POST create
  /{id}                                — GET / PATCH / DELETE
  /{id}/slides                         — GET list, POST insert (Sprint 2-4), PUT reorder
  /{id}/slides/{slide_id}              — PATCH (edit body/enable), DELETE (Sprint 2-4)
  /{id}/slides/{slide_id}/duplicate    — POST clone slide (Sprint 2-4)
  /{id}/assemble                       — POST regenerate slides from modules + context
  /{id}/render                         — POST render PPTX (returns binary)
  /{id}/publish                        — POST mark as approved/sent
  /{id}/versions                       — GET list, POST snapshot
  /{id}/versions/{version_id}/restore  — POST restore slides from snapshot (Sprint 2-4)
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
    CustomerContext,
    ModuleCatalogItem,
    ProposalContext,
    RecommenderInvalidResponse,
    RecommenderUnavailable,
    SelectionInput,
    SlideSnapshot,
    assemble_pptx,
    attach_cross_references,
    build_slide_instances,
    recommend as recommend_service,
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


class SlideInsert(BaseModel):
    """Insert a new slide into a proposal.

    Either `module_code` (to materialize from the module catalog) or
    `raw` (to insert a fully custom slide) must be provided.
    `position` is 1-based; omit to append at the end.

    Sprint 2-6: when the insertion originates from a Claude recommendation,
    `recommendation_event_id` links the new slide back to the event log and
    the event's `applied_additions` array is updated.
    """
    module_code: str | None = None
    raw: dict | None = None
    position: int | None = None
    title: str | None = None
    subtitle: str | None = None
    body: dict | None = None
    recommendation_event_id: str | None = None
    recommendation_reason: str | None = None


class VersionRestoreRequest(BaseModel):
    snapshot_before_restore: bool = True
    change_summary: str | None = None


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


# ----- Sprint 2-6: recommendation event helpers -----

def _append_event_applied(
    event_id: str,
    proposal_id: str,
    column: str,
    code: str,
) -> None:
    """Append `code` to the event's applied_additions/applied_removals jsonb array.

    Safe against missing/foreign events — silently skips if the event row
    cannot be loaded or belongs to a different proposal.
    """
    if column not in ("applied_additions", "applied_removals"):
        return
    admin = get_supabase_admin()
    event = (
        admin.table("proposal_recommendation_events")
        .select(f"id, proposal_id, {column}")
        .eq("id", event_id)
        .maybe_single()
        .execute()
        .data
    )
    if not event or event.get("proposal_id") != proposal_id:
        return
    current = list(event.get(column) or [])
    if code in current:
        return
    current.append(code)
    admin.table("proposal_recommendation_events").update(
        {column: current}
    ).eq("id", event_id).execute()


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


# ----- Sprint 2-4: slide insert / duplicate / delete -----

def _resequence_slides(admin, proposal_id: str) -> list[dict]:
    """Rewrite sort_order as contiguous 10, 20, 30, ... preserving current order."""
    rows = (
        admin.table("proposal_slides").select("id, sort_order")
        .eq("proposal_id", proposal_id).order("sort_order").execute().data or []
    )
    for idx, row in enumerate(rows):
        new_order = (idx + 1) * 10
        if row["sort_order"] != new_order:
            admin.table("proposal_slides").update({"sort_order": new_order}).eq("id", row["id"]).execute()
    return (
        admin.table("proposal_slides").select("*")
        .eq("proposal_id", proposal_id).order("sort_order").execute().data or []
    )


def _slide_row_from_module(module: dict, proposal_id: str, sort_order: int,
                           overrides: dict | None = None) -> dict:
    """Materialize a fresh proposal_slides row from a module catalog entry."""
    default_body = module.get("default_body") or {}
    body = dict(default_body)
    if overrides and overrides.get("body"):
        body.update(overrides["body"])
    return {
        "proposal_id": proposal_id,
        "module_id": module.get("id"),
        "code": module["code"],
        "name": module["name"],
        "phase": module["phase"],
        "neuro_dogma": module.get("neuro_dogma"),
        "title": (overrides or {}).get("title") or body.get("title") or module["name"],
        "subtitle": (overrides or {}).get("subtitle") or body.get("subtitle"),
        "body": body,
        "speaker_notes": body.get("speaker_notes"),
        "sort_order": sort_order,
        "is_enabled": True,
        "is_customized": bool(overrides),
        "ai_generated": False,
    }


@router.post("/{proposal_id}/slides", status_code=201)
async def insert_slide(
    proposal_id: str,
    body: SlideInsert,
    user: CurrentUser = Depends(get_current_user),
):
    """Insert a new slide at `position` (1-based). Appends to end if omitted.

    Source of the slide payload is one of:
      * module_code  → pulled from proposal_slide_modules catalog
      * raw          → caller-supplied row (must include code, name, phase)
    """
    proposal = await _load_proposal_or_404(proposal_id, user)
    await _assert_org_role(user, proposal["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()

    existing = (
        admin.table("proposal_slides").select("id, sort_order")
        .eq("proposal_id", proposal_id).order("sort_order").execute().data or []
    )

    # Resolve row payload
    row: dict
    if body.module_code:
        mod = (
            admin.table("proposal_slide_modules").select("*")
            .eq("code", body.module_code).eq("is_active", True)
            .or_(f"organization_id.is.null,organization_id.eq.{proposal['organization_id']}")
            .limit(1).execute().data or []
        )
        if not mod:
            raise HTTPException(404, f"Module {body.module_code} not found")
        row = _slide_row_from_module(
            mod[0],
            proposal_id,
            sort_order=0,
            overrides={
                "title": body.title,
                "subtitle": body.subtitle,
                "body": body.body,
            } if any([body.title, body.subtitle, body.body]) else None,
        )
    elif body.raw:
        required = {"code", "name", "phase"}
        missing = required - set(body.raw.keys())
        if missing:
            raise HTTPException(400, f"raw slide missing fields: {sorted(missing)}")
        row = {
            **body.raw,
            "proposal_id": proposal_id,
            "is_customized": True,
            "is_enabled": body.raw.get("is_enabled", True),
        }
    else:
        raise HTTPException(400, "Either module_code or raw is required")

    # Sprint 2-6: mark AI-origin metadata when the insertion originates from a recommendation.
    if body.recommendation_event_id:
        row["ai_recommendation_event_id"] = body.recommendation_event_id
        row["ai_generated"] = True
        if body.recommendation_reason:
            row["ai_recommended_reason"] = body.recommendation_reason

    # Compute insertion sort_order
    pos = body.position
    if pos is None or pos > len(existing):
        row["sort_order"] = ((existing[-1]["sort_order"] if existing else 0) + 10) if existing else 10
        inserted = admin.table("proposal_slides").insert(row).execute()
        new_slide = inserted.data[0] if inserted.data else None
        if new_slide and body.recommendation_event_id and row.get("code"):
            _append_event_applied(
                body.recommendation_event_id,
                proposal_id,
                "applied_additions",
                str(row["code"]),
            )
        return new_slide

    if pos < 1:
        pos = 1
    # Shift everyone at/after target position
    target_index = pos - 1
    if target_index < len(existing):
        target_order = existing[target_index]["sort_order"]
        row["sort_order"] = target_order
        # +10 to everyone at/after target
        for r in existing[target_index:]:
            admin.table("proposal_slides").update(
                {"sort_order": r["sort_order"] + 10}
            ).eq("id", r["id"]).execute()
    else:
        row["sort_order"] = ((existing[-1]["sort_order"] if existing else 0) + 10) if existing else 10

    inserted = admin.table("proposal_slides").insert(row).execute()
    new_slide = inserted.data[0] if inserted.data else None
    _resequence_slides(admin, proposal_id)
    if new_slide and body.recommendation_event_id and row.get("code"):
        _append_event_applied(
            body.recommendation_event_id,
            proposal_id,
            "applied_additions",
            str(row["code"]),
        )
    return new_slide


@router.post("/{proposal_id}/slides/{slide_id}/duplicate", status_code=201)
async def duplicate_slide(
    proposal_id: str,
    slide_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    proposal = await _load_proposal_or_404(proposal_id, user)
    await _assert_org_role(user, proposal["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()

    src = (
        admin.table("proposal_slides").select("*")
        .eq("id", slide_id).eq("proposal_id", proposal_id).maybe_single().execute().data
    )
    if not src:
        raise HTTPException(404, "Slide not found")

    # Shift subsequent slides
    rows_after = (
        admin.table("proposal_slides").select("id, sort_order")
        .eq("proposal_id", proposal_id).gt("sort_order", src["sort_order"])
        .order("sort_order").execute().data or []
    )
    for r in rows_after:
        admin.table("proposal_slides").update(
            {"sort_order": r["sort_order"] + 10}
        ).eq("id", r["id"]).execute()

    clone = dict(src)
    clone.pop("id", None)
    clone.pop("created_at", None)
    clone.pop("updated_at", None)
    clone["sort_order"] = src["sort_order"] + 10
    clone["is_customized"] = True
    clone["title"] = f"{src.get('title') or src.get('name')} (복제)"

    inserted = admin.table("proposal_slides").insert(clone).execute()
    new_slide = inserted.data[0] if inserted.data else None
    _resequence_slides(admin, proposal_id)
    return new_slide


@router.delete("/{proposal_id}/slides/{slide_id}", status_code=204)
async def delete_slide(
    proposal_id: str,
    slide_id: str,
    recommendation_event_id: str | None = Query(
        default=None,
        description="Sprint 2-6: Claude 추천의 제거 제안에서 호출된 경우 이벤트 id",
    ),
    user: CurrentUser = Depends(get_current_user),
):
    proposal = await _load_proposal_or_404(proposal_id, user)
    await _assert_org_role(user, proposal["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()

    existing = (
        admin.table("proposal_slides").select("id, code")
        .eq("id", slide_id).eq("proposal_id", proposal_id).maybe_single().execute().data
    )
    if not existing:
        raise HTTPException(404, "Slide not found")

    admin.table("proposal_slides").delete().eq("id", slide_id).eq("proposal_id", proposal_id).execute()
    _resequence_slides(admin, proposal_id)

    if recommendation_event_id and existing.get("code"):
        _append_event_applied(
            recommendation_event_id,
            proposal_id,
            "applied_removals",
            str(existing["code"]),
        )
    return None


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


@router.post("/{proposal_id}/versions/{version_id}/restore")
async def restore_version(
    proposal_id: str,
    version_id: str,
    body: VersionRestoreRequest | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    """Restore slides from a saved snapshot. Sprint 2-4.

    Flow:
      1. (optional) Take a safety snapshot of the current state
      2. Delete all current proposal_slides rows
      3. Re-insert rows from snapshot (keep original sort_order)
      4. Bump current_version on proposals
    """
    proposal = await _load_proposal_or_404(proposal_id, user)
    await _assert_org_role(user, proposal["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()

    version_row = (
        admin.table("proposal_versions").select("*")
        .eq("id", version_id).eq("proposal_id", proposal_id).maybe_single().execute().data
    )
    if not version_row:
        raise HTTPException(404, "Version not found")
    snapshot = version_row.get("snapshot") or {}
    snap_slides = snapshot.get("slides") or []
    if not snap_slides:
        raise HTTPException(400, "Snapshot contains no slides")

    req = body or VersionRestoreRequest()

    # 1. Safety snapshot (default on)
    if req.snapshot_before_restore:
        current_slides = (
            admin.table("proposal_slides").select("*")
            .eq("proposal_id", proposal_id).order("sort_order").execute().data or []
        )
        safety_version = (proposal.get("current_version") or 1)
        safety_note = req.change_summary or f"Auto-snapshot before restore of v{version_row.get('version_number')}"
        admin.table("proposal_versions").insert({
            "proposal_id": proposal_id,
            "version_number": safety_version,
            "snapshot": {
                "proposal": proposal,
                "slides": current_slides,
                "snapshot_at": datetime.utcnow().isoformat(),
                "auto": True,
            },
            "change_summary": safety_note,
            "created_by": user.id,
        }).execute()
        safety_version += 1
    else:
        safety_version = (proposal.get("current_version") or 1)

    # 2. Wipe current slides
    admin.table("proposal_slides").delete().eq("proposal_id", proposal_id).execute()

    # 3. Re-insert
    fresh_rows = []
    for s in snap_slides:
        row = dict(s)
        row.pop("id", None)
        row.pop("created_at", None)
        row.pop("updated_at", None)
        row["proposal_id"] = proposal_id
        fresh_rows.append(row)
    if fresh_rows:
        admin.table("proposal_slides").insert(fresh_rows).execute()
    _resequence_slides(admin, proposal_id)

    # 4. Bump version counter
    admin.table("proposals").update({
        "current_version": safety_version + 1,
        "updated_by": user.id,
    }).eq("id", proposal_id).execute()

    slides_after = (
        admin.table("proposal_slides").select("*")
        .eq("proposal_id", proposal_id).order("sort_order").execute().data or []
    )
    return {
        "ok": True,
        "restored_from_version": version_row.get("version_number"),
        "slide_count": len(slides_after),
        "slides": slides_after,
    }


# ===== Claude API module recommendation (Sprint 2-5) =====

class RecommendRequest(BaseModel):
    additional_notes: str | None = None


def _quote_summary_lines(quote: dict | None) -> list[str]:
    if not quote:
        return []
    items = quote.get("items") or []
    if not items:
        return []
    # Sort by total desc if the field is present; otherwise preserve order.
    try:
        items_sorted = sorted(
            items,
            key=lambda it: float(it.get("total_price") or it.get("subtotal") or 0),
            reverse=True,
        )
    except (TypeError, ValueError):
        items_sorted = items
    out: list[str] = []
    for it in items_sorted[:5]:
        name = it.get("name") or it.get("module_name") or "-"
        qty = it.get("quantity") or it.get("qty") or "-"
        total = it.get("total_price") or it.get("subtotal") or "-"
        out.append(f"{name} — qty {qty} / total {total}")
    return out


def _battle_card_summary_lines(battle_cards: list[dict]) -> list[str]:
    out: list[str] = []
    for card in (battle_cards or [])[:4]:
        competitor = (card.get("competitors") or {}).get("name") or card.get("competitor_name") or "경쟁사"
        weaknesses = card.get("weaknesses") or []
        differentiators = card.get("differentiators") or []
        if weaknesses:
            out.append(f"{competitor} 약점 — {str(weaknesses[0])[:140]}")
        if differentiators:
            out.append(f"{competitor} 대비 차별점 — {str(differentiators[0])[:140]}")
    return out


@router.post("/{proposal_id}/recommend")
async def recommend_modules(
    proposal_id: str,
    body: RecommendRequest | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    proposal = await _load_proposal_or_404(proposal_id, user)
    admin = get_supabase_admin()

    # Current slides
    slides_rows = (
        admin.table("proposal_slides").select("code, phase, title, is_enabled")
        .eq("proposal_id", proposal_id).order("sort_order").execute().data or []
    )
    current_slides = [
        SlideSnapshot(
            code=str(s.get("code") or ""),
            phase=str(s.get("phase") or ""),
            title=s.get("title"),
            is_enabled=bool(s.get("is_enabled", True)),
        )
        for s in slides_rows if s.get("code")
    ]

    # Available modules (org + global)
    module_rows = _fetch_all_modules(proposal.get("organization_id"))
    available_modules = [
        ModuleCatalogItem(
            code=str(m.get("code") or ""),
            name=str(m.get("name") or ""),
            phase=str(m.get("phase") or ""),
            neuro_dogma=m.get("neuro_dogma"),
            body_hint=m.get("body_hint"),
        )
        for m in module_rows if m.get("code")
    ]

    # Quote + battle card context
    quote = None
    if proposal.get("quote_id"):
        quote = (
            admin.table("quotes").select("*, items:quote_items(*)")
            .eq("id", proposal["quote_id"]).maybe_single().execute().data
        )
    battle_cards: list[dict] = []
    if proposal.get("battle_card_ids"):
        battle_cards = (
            admin.table("battle_cards").select("*, competitors(name)")
            .in_("id", proposal["battle_card_ids"]).execute().data or []
        )

    customer = CustomerContext(
        name=proposal.get("customer_name"),
        company=proposal.get("customer_company"),
        industry=proposal.get("customer_industry") or proposal.get("industry"),
        segment=proposal.get("customer_segment"),
        target_persona=proposal.get("target_persona"),
        stakeholders=list(proposal.get("stakeholders") or []),
        notes=(body.additional_notes if body else None) or proposal.get("notes"),
        quote_summary=_quote_summary_lines(quote),
        battle_card_summary=_battle_card_summary_lines(battle_cards),
    )

    try:
        result = recommend_service(
            customer=customer,
            current_slides=current_slides,
            available_modules=available_modules,
        )
    except RecommenderUnavailable as exc:
        raise HTTPException(503, str(exc))
    except RecommenderInvalidResponse as exc:
        raise HTTPException(502, f"추천 엔진 응답을 해석하지 못했습니다: {exc}")

    # Sprint 2-6: persist the recommendation event for reporting/tracking.
    additions_json = [a.__dict__ for a in result.additions]
    removals_json = [r.__dict__ for r in result.removals]
    emphasis_json = [e.__dict__ for e in result.emphasis]

    event_id: str | None = None
    try:
        event_row = {
            "proposal_id": proposal_id,
            "organization_id": proposal["organization_id"],
            "model": result.model,
            "additional_notes": body.additional_notes if body else None,
            "summary": result.summary,
            "additions": additions_json,
            "removals": removals_json,
            "emphasis": emphasis_json,
            "additions_count": len(additions_json),
            "removals_count": len(removals_json),
            "emphasis_count": len(emphasis_json),
            "raw_response": result.raw if getattr(result, "raw", None) else {},
            "created_by": user.id,
        }
        inserted = (
            admin.table("proposal_recommendation_events")
            .insert(event_row).execute()
        )
        if inserted.data:
            event_id = inserted.data[0].get("id")
    except Exception:
        # 트래킹 실패가 핵심 응답을 망치지 않도록 로그 저장 실패는 조용히 무시.
        event_id = None

    return {
        "event_id": event_id,
        "summary": result.summary,
        "model": result.model,
        "additions": additions_json,
        "removals": removals_json,
        "emphasis": emphasis_json,
    }


# ===== Sprint 2-6: recommendation stats =====

@router.get("/stats/recommendations")
async def recommendation_stats(
    org_id: str = Query(..., description="조직 ID"),
    days: int = Query(default=30, ge=1, le=180, description="집계 기간(일)"),
    user: CurrentUser = Depends(get_current_user),
):
    """조직 단위 Claude 추천 호출·적용 집계.

    Returns:
        {
          range: { days, from, to },
          totals: { calls, additions, removals, emphasis,
                    applied_additions, applied_removals,
                    addition_rate, removal_rate },
          daily: [{day, calls, additions, removals,
                   applied_additions, applied_removals}],
          top_applied_modules: [{code, count}]
        }
    """
    await _assert_org_role(user, org_id, ["owner", "admin", "member", "viewer"])
    admin = get_supabase_admin()

    from datetime import timedelta

    now = datetime.utcnow()
    start = now - timedelta(days=days)

    events = (
        admin.table("proposal_recommendation_events")
        .select(
            "id, proposal_id, created_at, additions_count, removals_count,"
            " emphasis_count, applied_additions, applied_removals"
        )
        .eq("organization_id", org_id)
        .gte("created_at", start.isoformat())
        .order("created_at")
        .execute()
        .data
        or []
    )

    totals = {
        "calls": len(events),
        "additions": 0,
        "removals": 0,
        "emphasis": 0,
        "applied_additions": 0,
        "applied_removals": 0,
    }
    daily: dict[str, dict] = {}
    module_counter: dict[str, int] = {}

    for ev in events:
        day = (ev.get("created_at") or "")[:10] or "unknown"
        d = daily.setdefault(
            day,
            {
                "day": day,
                "calls": 0,
                "additions": 0,
                "removals": 0,
                "applied_additions": 0,
                "applied_removals": 0,
            },
        )
        d["calls"] += 1
        d["additions"] += int(ev.get("additions_count") or 0)
        d["removals"] += int(ev.get("removals_count") or 0)
        applied_add = list(ev.get("applied_additions") or [])
        applied_rm = list(ev.get("applied_removals") or [])
        d["applied_additions"] += len(applied_add)
        d["applied_removals"] += len(applied_rm)

        totals["additions"] += int(ev.get("additions_count") or 0)
        totals["removals"] += int(ev.get("removals_count") or 0)
        totals["emphasis"] += int(ev.get("emphasis_count") or 0)
        totals["applied_additions"] += len(applied_add)
        totals["applied_removals"] += len(applied_rm)

        for code in applied_add:
            if not code:
                continue
            module_counter[str(code)] = module_counter.get(str(code), 0) + 1

    totals["addition_rate"] = (
        round(totals["applied_additions"] / totals["additions"], 4)
        if totals["additions"] else 0.0
    )
    totals["removal_rate"] = (
        round(totals["applied_removals"] / totals["removals"], 4)
        if totals["removals"] else 0.0
    )

    top_modules = sorted(
        ({"code": k, "count": v} for k, v in module_counter.items()),
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    return {
        "range": {
            "days": days,
            "from": start.isoformat(),
            "to": now.isoformat(),
        },
        "totals": totals,
        "daily": sorted(daily.values(), key=lambda d: d["day"]),
        "top_applied_modules": top_modules,
    }
