"""AI Tool definitions — Phase 3 Sprint 3-1.

Anthropic SDK tool-use 패턴으로 호출되는 6 개 도구 (읽기 3 / 쓰기 3) 의 정의·핸들러.
쓰기 도구는 실제 DB 변경을 즉시 수행하지 않고 ai_tool_executions 에
mutates_data=true, status='pending' 으로 드래프트만 기록한다.
실제 변경은 사용자가 Confirm 한 시점에만 별도 호출(/api/ai/confirm/{id})로 수행된다.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from app.db import get_supabase_admin
from app.services import ai_persistence


logger = logging.getLogger(__name__)


# ============================================================
# Tool Schemas (Anthropic Messages API tools 형식)
# ============================================================

TOOL_SCHEMAS: list[dict[str, Any]] = [
    # -------- READ 3종 --------
    {
        "name": "get_proposal",
        "description": "지정한 제안서의 슬라이드 목록·적용 모듈·최근 추천 이벤트 요약을 반환합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "proposal_id": {"type": "string", "description": "proposals.id (UUID)"},
            },
            "required": ["proposal_id"],
        },
    },
    {
        "name": "get_quote",
        "description": "지정한 견적의 라인 아이템·총액·마진을 반환합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "quote_id": {"type": "string", "description": "quotes.id (UUID)"},
            },
            "required": ["quote_id"],
        },
    },
    {
        "name": "get_battlecard",
        "description": "지정한 경쟁사의 배틀카드(대응 모듈·최근 갱신)를 반환합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "competitor_id": {"type": "string", "description": "battlecards.id (UUID)"},
            },
            "required": ["competitor_id"],
        },
    },
    # -------- WRITE 3종 (Confirm 필수) --------
    {
        "name": "draft_slide_append",
        "description": (
            "제안서에 새 슬라이드(모듈)를 추가하는 드래프트를 생성합니다. "
            "실제 DB 변경은 사용자가 Confirm 한 뒤에만 적용됩니다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "proposal_id": {"type": "string"},
                "module_code": {"type": "string", "description": "proposal_slide_modules.code"},
                "reason": {"type": "string", "description": "추천 근거 (1-2문장)"},
            },
            "required": ["proposal_id", "module_code", "reason"],
        },
    },
    {
        "name": "draft_battlecard_update",
        "description": (
            "배틀카드의 특정 필드 변경 드래프트를 생성합니다. "
            "실제 변경은 Confirm 후에만 적용됩니다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "competitor_id": {"type": "string"},
                "field": {"type": "string", "description": "변경할 필드명"},
                "new_value": {"type": "string"},
            },
            "required": ["competitor_id", "field", "new_value"],
        },
    },
    {
        "name": "draft_quote_lineitem",
        "description": (
            "견적에 새 라인 아이템 추가 드래프트를 생성합니다. "
            "실제 변경은 Confirm 후에만 적용됩니다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "quote_id": {"type": "string"},
                "sku": {"type": "string"},
                "qty": {"type": "number"},
                "unit_price": {"type": "number"},
            },
            "required": ["quote_id", "sku", "qty", "unit_price"],
        },
    },
]


WRITE_TOOLS = {"draft_slide_append", "draft_battlecard_update", "draft_quote_lineitem"}


# ============================================================
# Read handlers
# ============================================================

def _verify_org(table: str, row_id: str, organization_id: str) -> dict[str, Any]:
    """주어진 테이블의 row 가 호출 organization 에 속하는지 검증 후 반환."""
    admin = get_supabase_admin()
    res = (
        admin.table(table)
        .select("*")
        .eq("id", row_id)
        .eq("organization_id", organization_id)
        .maybe_single()
        .execute()
    )
    if not res or not res.data:
        raise PermissionError(f"{table}.{row_id} not found in org {organization_id}")
    return res.data


def _handle_get_proposal(args: dict[str, Any], organization_id: str) -> dict[str, Any]:
    proposal_id = args["proposal_id"]
    proposal = _verify_org("proposals", proposal_id, organization_id)
    admin = get_supabase_admin()

    slides = (
        admin.table("proposal_slides")
        .select("id,code,name,phase,sort_order,ai_recommendation_event_id,ai_recommended_reason,is_enabled")
        .eq("proposal_id", proposal_id)
        .order("sort_order")
        .execute()
    ).data or []

    recent_events = (
        admin.table("proposal_recommendation_events")
        .select("id,model,summary,additions_count,removals_count,created_at")
        .eq("proposal_id", proposal_id)
        .order("created_at", desc=True)
        .limit(3)
        .execute()
    ).data or []

    return {
        "proposal": {
            "id": proposal["id"],
            "title": proposal.get("title"),
            "customer_company": proposal.get("customer_company"),
            "customer_industry": proposal.get("customer_industry"),
            "neuro_level": proposal.get("neuro_level"),
            "target_persona": proposal.get("target_persona"),
        },
        "slide_count": len(slides),
        "slides": slides,
        "recent_recommendation_events": recent_events,
    }


def _handle_get_quote(args: dict[str, Any], organization_id: str) -> dict[str, Any]:
    quote_id = args["quote_id"]
    quote = _verify_org("quotes", quote_id, organization_id)
    admin = get_supabase_admin()
    items = (
        admin.table("quote_items")
        .select("*")
        .eq("quote_id", quote_id)
        .order("sort_order")
        .execute()
    ).data or []
    return {"quote": quote, "line_items": items}


def _handle_get_battlecard(args: dict[str, Any], organization_id: str) -> dict[str, Any]:
    bc_id = args["competitor_id"]
    bc = _verify_org("battlecards", bc_id, organization_id)
    return {"battlecard": bc}


READ_HANDLERS = {
    "get_proposal": _handle_get_proposal,
    "get_quote": _handle_get_quote,
    "get_battlecard": _handle_get_battlecard,
}


# ============================================================
# Write handlers (드래프트 생성만 — 실제 DB 변경은 Confirm 시점)
# ============================================================

def _handle_draft_slide_append(
    args: dict[str, Any], organization_id: str
) -> dict[str, Any]:
    """드래프트 페이로드 빌드. 실제 슬라이드 INSERT 는 confirm 단계에서 수행."""
    _verify_org("proposals", args["proposal_id"], organization_id)
    return {
        "draft_kind": "slide_append",
        "preview": {
            "proposal_id": args["proposal_id"],
            "module_code": args["module_code"],
            "reason": args["reason"],
        },
        "confirm_hint": "사용자가 적용 버튼을 눌러야 슬라이드가 추가됩니다.",
    }


def _handle_draft_battlecard_update(
    args: dict[str, Any], organization_id: str
) -> dict[str, Any]:
    _verify_org("battlecards", args["competitor_id"], organization_id)
    return {
        "draft_kind": "battlecard_update",
        "preview": {
            "competitor_id": args["competitor_id"],
            "field": args["field"],
            "new_value": args["new_value"],
        },
        "confirm_hint": "사용자가 적용 버튼을 눌러야 배틀카드가 갱신됩니다.",
    }


def _handle_draft_quote_lineitem(
    args: dict[str, Any], organization_id: str
) -> dict[str, Any]:
    _verify_org("quotes", args["quote_id"], organization_id)
    return {
        "draft_kind": "quote_lineitem",
        "preview": {
            "quote_id": args["quote_id"],
            "sku": args["sku"],
            "qty": args["qty"],
            "unit_price": args["unit_price"],
            "line_total": args["qty"] * args["unit_price"],
        },
        "confirm_hint": "사용자가 적용 버튼을 눌러야 라인 아이템이 추가됩니다.",
    }


WRITE_HANDLERS = {
    "draft_slide_append": _handle_draft_slide_append,
    "draft_battlecard_update": _handle_draft_battlecard_update,
    "draft_quote_lineitem": _handle_draft_quote_lineitem,
}


# ============================================================
# Dispatcher (감사 로깅 포함)
# ============================================================

def execute_tool(
    *,
    tool_name: str,
    args: dict[str, Any],
    conversation_id: str,
    organization_id: str,
    requested_by: str,
    message_id: str | None = None,
) -> dict[str, Any]:
    """tool_name 에 맞는 핸들러를 호출하고 ai_tool_executions 에 기록한다.

    Returns:
        {
          "tool_execution_id": "...",
          "status": "applied" | "pending" | "failed",
          "result": <handler 결과>,
          "mutates_data": bool,
        }
    """
    is_write = tool_name in WRITE_TOOLS
    started = time.monotonic()

    try:
        if is_write:
            handler = WRITE_HANDLERS.get(tool_name)
        else:
            handler = READ_HANDLERS.get(tool_name)
        if handler is None:
            raise ValueError(f"Unknown tool: {tool_name}")
        result = handler(args, organization_id)
        latency = int((time.monotonic() - started) * 1000)

        # 읽기는 즉시 applied 로 기록, 쓰기는 pending (Confirm 대기)
        status = "pending" if is_write else "applied"
        rec = ai_persistence.record_tool_execution(
            conversation_id=conversation_id,
            organization_id=organization_id,
            tool_name=tool_name,
            args=args,
            result=result,
            status=status,
            mutates_data=is_write,
            requested_by=requested_by,
            message_id=message_id,
            latency_ms=latency,
        )
        return {
            "tool_execution_id": rec["id"],
            "status": status,
            "result": result,
            "mutates_data": is_write,
        }

    except PermissionError as e:
        logger.warning("Tool %s denied: %s", tool_name, e)
        rec = ai_persistence.record_tool_execution(
            conversation_id=conversation_id,
            organization_id=organization_id,
            tool_name=tool_name,
            args=args,
            result={"error_kind": "forbidden", "error_detail": str(e)},
            status="failed",
            mutates_data=is_write,
            requested_by=requested_by,
            message_id=message_id,
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        return {
            "tool_execution_id": rec["id"],
            "status": "failed",
            "result": {"error": "forbidden"},
            "mutates_data": is_write,
        }
    except Exception as e:  # noqa: BLE001
        logger.exception("Tool %s failed", tool_name)
        rec = ai_persistence.record_tool_execution(
            conversation_id=conversation_id,
            organization_id=organization_id,
            tool_name=tool_name,
            args=args,
            result={"error_kind": "internal", "error_detail": str(e)[:500]},
            status="failed",
            mutates_data=is_write,
            requested_by=requested_by,
            message_id=message_id,
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        return {
            "tool_execution_id": rec["id"],
            "status": "failed",
            "result": {"error": "internal_error"},
            "mutates_data": is_write,
        }


# ============================================================
# Confirm executor — 사용자 승인 후 실제 DB 변경 수행
# ============================================================

def apply_confirmed_tool(
    tool_execution_id: str,
    *,
    confirmed_by: str,
) -> dict[str, Any]:
    """ai_tool_executions 의 pending write 행을 실제 DB 변경에 반영하고 status='applied' 로 마감.

    실패 시 status='failed' + rejection_reason 으로 기록한다.
    """
    rec = ai_persistence.get_tool_execution(tool_execution_id)
    if not rec:
        raise ValueError("tool execution not found")
    if rec["status"] != "pending":
        raise ValueError(f"already finalized: status={rec['status']}")
    if not rec["mutates_data"]:
        # 읽기 도구는 Confirm 불필요 — 안전하게 applied 로만 마감
        return ai_persistence.confirm_tool_execution(
            tool_execution_id, confirmed_by=confirmed_by, new_status="applied"
        )

    tool_name = rec["tool_name"]
    args = rec["args"]
    org_id = rec["organization_id"]
    admin = get_supabase_admin()

    try:
        if tool_name == "draft_slide_append":
            applied = _apply_slide_append(admin, args, org_id)
        elif tool_name == "draft_battlecard_update":
            applied = _apply_battlecard_update(admin, args, org_id)
        elif tool_name == "draft_quote_lineitem":
            applied = _apply_quote_lineitem(admin, args, org_id)
        else:
            raise ValueError(f"unknown write tool: {tool_name}")

        merged = {**rec.get("result", {}), "applied": applied}
        return ai_persistence.confirm_tool_execution(
            tool_execution_id,
            confirmed_by=confirmed_by,
            new_status="applied",
            extra_result=merged,
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("apply_confirmed_tool %s failed", tool_name)
        return ai_persistence.confirm_tool_execution(
            tool_execution_id,
            confirmed_by=confirmed_by,
            new_status="failed",
            rejection_reason=str(e)[:500],
        )


def _apply_slide_append(admin, args: dict[str, Any], org_id: str) -> dict[str, Any]:
    """proposal_slides 끝에 module_code 기반 슬라이드를 append.

    스켈레톤: module catalog 에서 기본값을 끌어와 그대로 INSERT.
    추후 sprint 에서 ai_recommendation_event_id 연결 등 보강 예정.
    """
    proposal_id = args["proposal_id"]
    module_code = args["module_code"]
    # 1. module catalog 에서 default 값 조회
    mod = (
        admin.table("proposal_slide_modules")
        .select("*")
        .eq("organization_id", org_id)
        .eq("code", module_code)
        .maybe_single()
        .execute()
    ).data
    if not mod:
        raise ValueError(f"module {module_code} not in catalog")

    # 2. 가장 큰 sort_order 찾아서 +1
    last = (
        admin.table("proposal_slides")
        .select("sort_order")
        .eq("proposal_id", proposal_id)
        .order("sort_order", desc=True)
        .limit(1)
        .execute()
    ).data
    next_order = (last[0]["sort_order"] + 1) if last else 0

    payload = {
        "proposal_id": proposal_id,
        "module_id": mod["id"],
        "code": mod["code"],
        "name": mod["name"],
        "phase": mod["phase"],
        "neuro_dogma": mod.get("neuro_dogma"),
        "title": mod.get("name"),
        "body": mod.get("default_body") or {},
        "sort_order": next_order,
        "ai_generated": True,
        "ai_recommended_reason": args.get("reason"),
    }
    res = admin.table("proposal_slides").insert(payload).execute()
    return {"slide_id": res.data[0]["id"], "sort_order": next_order}


def _apply_battlecard_update(admin, args: dict[str, Any], org_id: str) -> dict[str, Any]:
    """battlecards 의 단일 필드 업데이트 — 화이트리스트 필드만 허용."""
    ALLOWED = {"summary", "key_advantages", "objection_handling", "competitor_name", "tier"}
    field = args["field"]
    if field not in ALLOWED:
        raise ValueError(f"field '{field}' not allowed for AI update")
    res = (
        admin.table("battlecards")
        .update({field: args["new_value"]})
        .eq("id", args["competitor_id"])
        .eq("organization_id", org_id)
        .execute()
    )
    if not res.data:
        raise ValueError("battlecard not found")
    return {"battlecard_id": res.data[0]["id"], "field": field}


def _apply_quote_lineitem(admin, args: dict[str, Any], org_id: str) -> dict[str, Any]:
    """quote_items 에 새 라인 아이템 추가."""
    quote_id = args["quote_id"]
    # 가장 큰 sort_order +1
    last = (
        admin.table("quote_items")
        .select("sort_order")
        .eq("quote_id", quote_id)
        .order("sort_order", desc=True)
        .limit(1)
        .execute()
    ).data
    next_order = (last[0]["sort_order"] + 1) if last else 0
    qty = float(args["qty"])
    unit_price = float(args["unit_price"])
    payload = {
        "quote_id": quote_id,
        "sku": args["sku"],
        "qty": qty,
        "unit_price": unit_price,
        "line_total": qty * unit_price,
        "sort_order": next_order,
    }
    res = admin.table("quote_items").insert(payload).execute()
    return {"line_item_id": res.data[0]["id"], "sort_order": next_order}
