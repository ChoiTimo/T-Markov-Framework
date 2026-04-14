"""Quote Calculator API — Phase 2 Sprint 2-1.

Endpoints:
  Quotes
    GET    /api/quotes                  — 조직 견적 목록 (org_id query)
    POST   /api/quotes                  — 견적 생성 (초안)
    GET    /api/quotes/{id}             — 견적 + 라인 조회
    PUT    /api/quotes/{id}             — 견적 수정 (재계산 포함)
    DELETE /api/quotes/{id}             — 견적 삭제
    POST   /api/quotes/{id}/duplicate   — 복제
    POST   /api/quotes/{id}/recalc      — 재계산 (라인 스냅샷 기준)
    POST   /api/quotes/{id}/versions    — 현재 상태 버전 스냅샷 저장
    GET    /api/quotes/{id}/versions    — 버전 목록
    GET    /api/quotes/{id}/pdf         — PDF 다운로드
  Catalog
    GET    /api/quotes/catalog/modules      — 모듈 목록 (org_id)
    GET    /api/quotes/catalog/pricing      — 모듈별 지역/대역폭 매트릭스
    GET    /api/quotes/catalog/contracts    — 약정 규칙 목록
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from app.auth import CurrentUser, get_current_user
from app.db import get_supabase_admin
from app.services.quote.calculator import calc_line_total, calc_quote_totals
from app.services.quote.pdf_generator import render_quote_pdf

router = APIRouter()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------

class QuoteItemIn(BaseModel):
    module_id: str | None = None
    item_name: str
    item_description: str | None = None
    category: str | None = None
    service_tier: str | None = None
    region_code: str | None = None
    region_name: str | None = None
    bandwidth_mbps: int | None = None
    quantity: float = 1
    unit: str | None = "회선"
    unit_price: float = 0
    is_hub: bool = False
    sort_order: int = 0
    metadata: dict = Field(default_factory=dict)


class QuoteCreate(BaseModel):
    organization_id: str
    title: str
    customer_name: str | None = None
    customer_contact: str | None = None
    customer_company: str | None = None
    service_type: str | None = None        # 'premium' | 'standard' | 'combo'
    contract_months: int = 24
    contract_rule_id: str | None = None
    currency: str = "KRW"
    tax_rate: float = 0.1
    valid_until: str | None = None         # ISO date
    notes: str | None = None
    exceptions_note: str | None = None
    items: list[QuoteItemIn] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class QuoteUpdate(BaseModel):
    title: str | None = None
    customer_name: str | None = None
    customer_contact: str | None = None
    customer_company: str | None = None
    service_type: str | None = None
    contract_months: int | None = None
    contract_rule_id: str | None = None
    status: str | None = None
    tax_rate: float | None = None
    valid_until: str | None = None
    notes: str | None = None
    exceptions_note: str | None = None
    metadata: dict | None = None
    items: list[QuoteItemIn] | None = None  # 전체 교체
    change_summary: str | None = None       # 버전 메모


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

async def _assert_org_role(user: CurrentUser, org_id: str, allowed: list[str]):
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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires one of: {', '.join(allowed)}",
        )


async def _load_quote_or_404(quote_id: str, user: CurrentUser) -> dict:
    admin = get_supabase_admin()
    result = (
        admin.table("quotes").select("*").eq("id", quote_id).maybe_single().execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    await _assert_org_role(
        user, result.data["organization_id"], ["owner", "admin", "member", "viewer"]
    )
    return result.data


def _get_multiplier_for_rule(rule_id: str | None, contract_months: int | None) -> Decimal:
    """Look up the contract multiplier. Falls back to base (1.0) if not found."""
    admin = get_supabase_admin()
    if rule_id:
        r = admin.table("pricing_rules").select("*").eq("id", rule_id).maybe_single().execute()
        if r.data:
            return Decimal(str(r.data.get("multiplier", 1)))
    if contract_months is not None:
        r = (
            admin.table("pricing_rules")
            .select("*")
            .is_("organization_id", "null")
            .eq("rule_type", "contract_term")
            .eq("contract_months", contract_months)
            .maybe_single()
            .execute()
        )
        if r.data:
            return Decimal(str(r.data.get("multiplier", 1)))
    return Decimal("1")


def _compute_and_fill(items: list[dict], multiplier: Decimal, tax_rate: float) -> dict:
    """Fill line_total on each item and return totals dict for the quote row."""
    for it in items:
        it["line_total"] = float(calc_line_total(it.get("quantity", 1), it.get("unit_price", 0)))
    totals = calc_quote_totals(
        [it["line_total"] for it in items],
        contract_multiplier=multiplier,
        tax_rate=tax_rate,
    )
    return {
        "subtotal": float(totals.subtotal),
        "adjustment_amount": float(totals.adjustment_amount),
        "tax_amount": float(totals.tax_amount),
        "total_amount": float(totals.total_amount),
        "monthly_amount": float(totals.monthly_amount),
        "tax_rate": tax_rate,
    }


def _serialize_item(it: dict, quote_id: str) -> dict:
    return {
        "quote_id": quote_id,
        "module_id": it.get("module_id"),
        "item_name": it.get("item_name") or "",
        "item_description": it.get("item_description"),
        "category": it.get("category"),
        "service_tier": it.get("service_tier"),
        "region_code": it.get("region_code"),
        "region_name": it.get("region_name"),
        "bandwidth_mbps": it.get("bandwidth_mbps"),
        "quantity": it.get("quantity", 1),
        "unit": it.get("unit") or "회선",
        "unit_price": it.get("unit_price", 0),
        "line_total": it.get("line_total", 0),
        "is_hub": bool(it.get("is_hub", False)),
        "sort_order": it.get("sort_order", 0),
        "metadata": it.get("metadata") or {},
    }


# ------------------------------------------------------------------
# Quote CRUD
# ------------------------------------------------------------------

@router.get("")
async def list_quotes(
    org_id: str = Query(..., description="Organization ID"),
    status_filter: str | None = Query(None, alias="status"),
    limit: int = 50,
    offset: int = 0,
    user: CurrentUser = Depends(get_current_user),
):
    """조직의 견적 목록."""
    await _assert_org_role(user, org_id, ["owner", "admin", "member", "viewer"])
    admin = get_supabase_admin()
    q = (
        admin.table("quotes")
        .select("*")
        .eq("organization_id", org_id)
        .order("updated_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if status_filter:
        q = q.eq("status", status_filter)
    return q.execute().data or []


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_quote(body: QuoteCreate, user: CurrentUser = Depends(get_current_user)):
    """견적 생성 (초안). items가 있으면 합계 계산 후 저장."""
    await _assert_org_role(user, body.organization_id, ["owner", "admin", "member"])
    admin = get_supabase_admin()

    multiplier = _get_multiplier_for_rule(body.contract_rule_id, body.contract_months)
    items_raw = [it.model_dump() for it in body.items]
    totals = _compute_and_fill(items_raw, multiplier, body.tax_rate)

    quote_row = {
        "organization_id": body.organization_id,
        "title": body.title,
        "customer_name": body.customer_name,
        "customer_contact": body.customer_contact,
        "customer_company": body.customer_company,
        "service_type": body.service_type,
        "contract_months": body.contract_months,
        "contract_rule_id": body.contract_rule_id,
        "currency": body.currency,
        "valid_until": body.valid_until,
        "notes": body.notes,
        "exceptions_note": body.exceptions_note,
        "metadata": body.metadata,
        "created_by": user.id,
        "updated_by": user.id,
        **totals,
    }
    q_result = admin.table("quotes").insert(quote_row).execute()
    if not q_result.data:
        raise HTTPException(status_code=400, detail="Failed to create quote")
    quote = q_result.data[0]

    if items_raw:
        admin.table("quote_items").insert(
            [_serialize_item(it, quote["id"]) for it in items_raw]
        ).execute()

    return await _fetch_full(quote["id"])


@router.get("/{quote_id}")
async def get_quote(quote_id: str, user: CurrentUser = Depends(get_current_user)):
    """견적 상세 (라인 + 약정 규칙 포함)."""
    await _load_quote_or_404(quote_id, user)
    return await _fetch_full(quote_id)


@router.put("/{quote_id}")
async def update_quote(
    quote_id: str,
    body: QuoteUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """견적 수정. items를 보내면 전체 교체 + 재계산. 자동으로 버전 스냅샷 생성."""
    quote = await _load_quote_or_404(quote_id, user)
    await _assert_org_role(
        user, quote["organization_id"], ["owner", "admin", "member"]
    )
    admin = get_supabase_admin()

    contract_months = body.contract_months if body.contract_months is not None else quote.get("contract_months")
    contract_rule_id = body.contract_rule_id if body.contract_rule_id is not None else quote.get("contract_rule_id")
    tax_rate = body.tax_rate if body.tax_rate is not None else (quote.get("tax_rate") or 0.1)

    update_row: dict = {"updated_by": user.id}
    for field in ("title", "customer_name", "customer_contact", "customer_company",
                  "service_type", "status", "valid_until", "notes", "exceptions_note",
                  "metadata", "contract_months", "contract_rule_id", "tax_rate"):
        v = getattr(body, field, None)
        if v is not None:
            update_row[field] = v

    # Items update → recalc totals
    if body.items is not None:
        # 1) snapshot current state BEFORE mutation
        await _snapshot_version(quote_id, user.id, body.change_summary or "items updated")

        # 2) replace items
        multiplier = _get_multiplier_for_rule(contract_rule_id, contract_months)
        items_raw = [it.model_dump() for it in body.items]
        totals = _compute_and_fill(items_raw, multiplier, float(tax_rate))
        update_row.update(totals)

        admin.table("quote_items").delete().eq("quote_id", quote_id).execute()
        if items_raw:
            admin.table("quote_items").insert(
                [_serialize_item(it, quote_id) for it in items_raw]
            ).execute()

        update_row["current_version"] = (quote.get("current_version") or 1) + 1
    elif any(k in update_row for k in ("contract_months", "contract_rule_id", "tax_rate")):
        # 계약 조건만 바뀌어도 재계산
        existing_items = (
            admin.table("quote_items").select("*").eq("quote_id", quote_id).execute().data or []
        )
        multiplier = _get_multiplier_for_rule(contract_rule_id, contract_months)
        totals = _compute_and_fill(existing_items, multiplier, float(tax_rate))
        update_row.update(totals)

    if update_row:
        admin.table("quotes").update(update_row).eq("id", quote_id).execute()

    return await _fetch_full(quote_id)


@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quote(quote_id: str, user: CurrentUser = Depends(get_current_user)):
    quote = await _load_quote_or_404(quote_id, user)
    await _assert_org_role(user, quote["organization_id"], ["owner", "admin"])
    admin = get_supabase_admin()
    admin.table("quotes").delete().eq("id", quote_id).execute()


@router.post("/{quote_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate_quote(quote_id: str, user: CurrentUser = Depends(get_current_user)):
    """견적을 복제해서 새 초안 생성."""
    quote = await _load_quote_or_404(quote_id, user)
    await _assert_org_role(user, quote["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()

    items = (
        admin.table("quote_items").select("*").eq("quote_id", quote_id).execute().data or []
    )

    new_row = {
        k: quote.get(k)
        for k in (
            "organization_id", "customer_name", "customer_contact", "customer_company",
            "service_type", "contract_months", "contract_rule_id", "currency",
            "subtotal", "adjustment_amount", "tax_rate", "tax_amount", "total_amount",
            "monthly_amount", "valid_until", "notes", "exceptions_note", "metadata",
        )
    }
    new_row["title"] = f"{quote.get('title') or '견적'} (복사본)"
    new_row["status"] = "draft"
    new_row["created_by"] = user.id
    new_row["updated_by"] = user.id
    new_row["quote_number"] = None  # regenerate

    created = admin.table("quotes").insert(new_row).execute().data[0]
    if items:
        cloned_items = []
        for it in items:
            cloned = {k: v for k, v in it.items() if k not in ("id", "created_at")}
            cloned["quote_id"] = created["id"]
            cloned_items.append(cloned)
        admin.table("quote_items").insert(cloned_items).execute()

    return await _fetch_full(created["id"])


@router.post("/{quote_id}/recalc")
async def recalculate_quote(
    quote_id: str, user: CurrentUser = Depends(get_current_user)
):
    """라인을 유지한 채 계약 조건/규칙 기반으로 합계를 다시 계산해 저장."""
    quote = await _load_quote_or_404(quote_id, user)
    await _assert_org_role(user, quote["organization_id"], ["owner", "admin", "member"])
    admin = get_supabase_admin()

    items = (
        admin.table("quote_items").select("*").eq("quote_id", quote_id).execute().data or []
    )
    multiplier = _get_multiplier_for_rule(
        quote.get("contract_rule_id"), quote.get("contract_months")
    )
    totals = _compute_and_fill(items, multiplier, float(quote.get("tax_rate") or 0.1))
    admin.table("quotes").update({**totals, "updated_by": user.id}).eq(
        "id", quote_id
    ).execute()
    return await _fetch_full(quote_id)


# ------------------------------------------------------------------
# Versions
# ------------------------------------------------------------------

async def _snapshot_version(quote_id: str, user_id: str, summary: str | None):
    admin = get_supabase_admin()
    q = admin.table("quotes").select("*").eq("id", quote_id).maybe_single().execute()
    if not q.data:
        return
    items = (
        admin.table("quote_items").select("*").eq("quote_id", quote_id).execute().data or []
    )
    version_no = q.data.get("current_version") or 1
    admin.table("quote_versions").insert({
        "quote_id": quote_id,
        "version_number": version_no,
        "snapshot": {"quote": q.data, "items": items},
        "change_summary": summary,
        "created_by": user_id,
    }).execute()


@router.post("/{quote_id}/versions", status_code=status.HTTP_201_CREATED)
async def save_version(
    quote_id: str,
    change_summary: str | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    quote = await _load_quote_or_404(quote_id, user)
    await _assert_org_role(user, quote["organization_id"], ["owner", "admin", "member"])
    await _snapshot_version(quote_id, user.id, change_summary)
    # bump current_version
    admin = get_supabase_admin()
    next_ver = (quote.get("current_version") or 1) + 1
    admin.table("quotes").update({"current_version": next_ver}).eq("id", quote_id).execute()
    return {"quote_id": quote_id, "version_number": next_ver - 1, "saved": True}


@router.get("/{quote_id}/versions")
async def list_versions(quote_id: str, user: CurrentUser = Depends(get_current_user)):
    await _load_quote_or_404(quote_id, user)
    admin = get_supabase_admin()
    return (
        admin.table("quote_versions")
        .select("id, version_number, change_summary, created_by, created_at")
        .eq("quote_id", quote_id)
        .order("version_number", desc=True)
        .execute()
        .data
        or []
    )


# ------------------------------------------------------------------
# PDF
# ------------------------------------------------------------------

@router.get("/{quote_id}/pdf")
async def download_pdf(quote_id: str, user: CurrentUser = Depends(get_current_user)):
    """견적서 PDF 다운로드."""
    quote = await _load_quote_or_404(quote_id, user)
    admin = get_supabase_admin()
    items = (
        admin.table("quote_items")
        .select("*")
        .eq("quote_id", quote_id)
        .order("sort_order")
        .execute()
        .data
        or []
    )
    org = (
        admin.table("organizations")
        .select("*")
        .eq("id", quote["organization_id"])
        .maybe_single()
        .execute()
        .data
    )
    try:
        pdf_bytes = render_quote_pdf(quote, items, org)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    filename = f"{quote.get('quote_number') or 'quote'}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ------------------------------------------------------------------
# Catalog
# ------------------------------------------------------------------

@router.get("/catalog/modules")
async def list_modules(
    org_id: str = Query(...),
    category: str | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    """조직 + 전역(null) 모듈 카탈로그."""
    await _assert_org_role(user, org_id, ["owner", "admin", "member", "viewer"])
    admin = get_supabase_admin()
    q = (
        admin.table("modules")
        .select("*")
        .or_(f"organization_id.eq.{org_id},organization_id.is.null")
        .eq("is_active", True)
        .order("sort_order")
    )
    if category:
        q = q.eq("category", category)
    return q.execute().data or []


@router.get("/catalog/pricing")
async def list_pricing(
    module_id: str = Query(...),
    user: CurrentUser = Depends(get_current_user),
):
    """특정 모듈의 지역/대역폭 가격 매트릭스."""
    admin = get_supabase_admin()
    # module 소속 org 확인
    module = (
        admin.table("modules").select("organization_id").eq("id", module_id).maybe_single().execute()
    )
    if not module.data:
        raise HTTPException(status_code=404, detail="Module not found")
    if module.data.get("organization_id"):
        await _assert_org_role(
            user, module.data["organization_id"], ["owner", "admin", "member", "viewer"]
        )
    return (
        admin.table("pricing_matrices")
        .select("*")
        .eq("module_id", module_id)
        .order("region_code")
        .order("bandwidth_mbps")
        .execute()
        .data
        or []
    )


@router.get("/catalog/contracts")
async def list_contract_rules(
    org_id: str | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    """약정 규칙 목록 (전역 + 조직별)."""
    admin = get_supabase_admin()
    q = admin.table("pricing_rules").select("*").eq("rule_type", "contract_term").eq("is_active", True)
    if org_id:
        q = q.or_(f"organization_id.eq.{org_id},organization_id.is.null")
    else:
        q = q.is_("organization_id", "null")
    return q.order("sort_order").execute().data or []


# ------------------------------------------------------------------
# Internal helper: fetch full quote with items + contract
# ------------------------------------------------------------------

async def _fetch_full(quote_id: str) -> dict:
    admin = get_supabase_admin()
    quote = admin.table("quotes").select("*").eq("id", quote_id).maybe_single().execute().data
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    items = (
        admin.table("quote_items")
        .select("*")
        .eq("quote_id", quote_id)
        .order("sort_order")
        .execute()
        .data
        or []
    )
    contract = None
    if quote.get("contract_rule_id"):
        contract = (
            admin.table("pricing_rules")
            .select("*")
            .eq("id", quote["contract_rule_id"])
            .maybe_single()
            .execute()
            .data
        )
    return {**quote, "items": items, "contract_rule": contract}
