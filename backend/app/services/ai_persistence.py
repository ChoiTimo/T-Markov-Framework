"""AI Persistence — Phase 3 Sprint 3-1.

ai_conversations / ai_messages / ai_tool_executions 테이블에 대한 단순 CRUD 헬퍼.
RLS 우회가 필요한 감사 로깅은 admin client 를 사용한다.
"""

from __future__ import annotations

import logging
from typing import Any, Literal
from uuid import UUID

from app.db import get_supabase_admin


logger = logging.getLogger(__name__)


Surface = Literal["proposal_editor", "quote", "battlecard", "dashboard", "global"]
Role = Literal["user", "assistant", "tool", "system"]
ExecStatus = Literal["pending", "applied", "rejected", "failed"]


# ------------------------------------------------------------------
# Conversations
# ------------------------------------------------------------------

def create_conversation(
    *,
    organization_id: str,
    user_id: str,
    surface: Surface,
    surface_ref_id: str | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    """신규 대화 세션 생성. 호출자는 surface 가 RLS 통과 가능한 org 임을 보장해야 한다."""
    admin = get_supabase_admin()
    payload = {
        "organization_id": organization_id,
        "user_id": user_id,
        "surface": surface,
        "surface_ref_id": surface_ref_id,
        "title": title,
    }
    result = admin.table("ai_conversations").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Failed to insert ai_conversations")
    return result.data[0]


def get_conversation(conversation_id: str) -> dict[str, Any] | None:
    admin = get_supabase_admin()
    result = (
        admin.table("ai_conversations")
        .select("*")
        .eq("id", conversation_id)
        .maybe_single()
        .execute()
    )
    return result.data if result and result.data else None


def list_conversations(
    *,
    organization_id: str,
    surface: Surface | None = None,
    surface_ref_id: str | None = None,
    include_archived: bool = False,
    limit: int = 50,
) -> list[dict[str, Any]]:
    admin = get_supabase_admin()
    q = (
        admin.table("ai_conversations")
        .select("*")
        .eq("organization_id", organization_id)
    )
    if surface:
        q = q.eq("surface", surface)
    if surface_ref_id:
        q = q.eq("surface_ref_id", surface_ref_id)
    if not include_archived:
        q = q.is_("archived_at", "null")
    q = q.order("updated_at", desc=True).limit(limit)
    result = q.execute()
    return result.data or []


def update_conversation_meta(
    conversation_id: str,
    *,
    title: str | None = None,
    pinned: bool | None = None,
    tags: list[str] | None = None,
    archived_at: str | None = None,  # ISO8601 또는 None 으로 unarchive
) -> dict[str, Any]:
    """대화 메타 (title/pinned/tags/archived_at) 업데이트."""
    admin = get_supabase_admin()
    update: dict[str, Any] = {}
    if title is not None:
        update["title"] = title
    if pinned is not None:
        update["pinned"] = pinned
    if tags is not None:
        update["tags"] = tags
    if archived_at is not None or archived_at is None:  # 명시적 None 도 허용 (clear)
        update["archived_at"] = archived_at
    if not update:
        raise ValueError("No fields to update")
    result = (
        admin.table("ai_conversations")
        .update(update)
        .eq("id", conversation_id)
        .execute()
    )
    if not result.data:
        raise RuntimeError("Conversation not found or update failed")
    return result.data[0]


def bump_conversation_counters(
    conversation_id: str,
    *,
    add_messages: int = 0,
    add_input_tokens: int = 0,
    add_output_tokens: int = 0,
) -> None:
    """message_count / token 누적 캐시 증분. 단순 read-modify-write (저빈도이므로 OK)."""
    if add_messages == 0 and add_input_tokens == 0 and add_output_tokens == 0:
        return
    admin = get_supabase_admin()
    cur = (
        admin.table("ai_conversations")
        .select("message_count,total_input_tokens,total_output_tokens")
        .eq("id", conversation_id)
        .maybe_single()
        .execute()
    )
    if not cur or not cur.data:
        return
    admin.table("ai_conversations").update(
        {
            "message_count": cur.data["message_count"] + add_messages,
            "total_input_tokens": cur.data["total_input_tokens"] + add_input_tokens,
            "total_output_tokens": cur.data["total_output_tokens"] + add_output_tokens,
        }
    ).eq("id", conversation_id).execute()


# ------------------------------------------------------------------
# Messages
# ------------------------------------------------------------------

def append_message(
    *,
    conversation_id: str,
    role: Role,
    content: dict[str, Any],
    model: str | None = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    parent_message_id: str | None = None,
    error_kind: str | None = None,
    error_detail: str | None = None,
) -> dict[str, Any]:
    admin = get_supabase_admin()
    payload = {
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "parent_message_id": parent_message_id,
        "error_kind": error_kind,
        "error_detail": error_detail,
    }
    result = admin.table("ai_messages").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Failed to insert ai_messages")
    msg = result.data[0]
    bump_conversation_counters(
        conversation_id,
        add_messages=1,
        add_input_tokens=input_tokens,
        add_output_tokens=output_tokens,
    )
    return msg


def list_messages(conversation_id: str, *, limit: int = 200) -> list[dict[str, Any]]:
    admin = get_supabase_admin()
    result = (
        admin.table("ai_messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return result.data or []


# ------------------------------------------------------------------
# Tool executions
# ------------------------------------------------------------------

def record_tool_execution(
    *,
    conversation_id: str,
    organization_id: str,
    tool_name: str,
    args: dict[str, Any],
    result: dict[str, Any] | None = None,
    status: ExecStatus = "pending",
    mutates_data: bool = False,
    requested_by: str | None = None,
    message_id: str | None = None,
    latency_ms: int | None = None,
) -> dict[str, Any]:
    admin = get_supabase_admin()
    payload = {
        "conversation_id": conversation_id,
        "organization_id": organization_id,
        "tool_name": tool_name,
        "args": args,
        "result": result or {},
        "status": status,
        "mutates_data": mutates_data,
        "requested_by": requested_by,
        "message_id": message_id,
        "latency_ms": latency_ms,
    }
    res = admin.table("ai_tool_executions").insert(payload).execute()
    if not res.data:
        raise RuntimeError("Failed to insert ai_tool_executions")
    return res.data[0]


def confirm_tool_execution(
    tool_execution_id: str,
    *,
    confirmed_by: str,
    new_status: ExecStatus = "applied",
    rejection_reason: str | None = None,
    extra_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """쓰기 도구 Confirm 루프 마감. status='applied' 또는 'rejected'."""
    admin = get_supabase_admin()
    update: dict[str, Any] = {
        "status": new_status,
        "confirmed_by": confirmed_by,
        "confirmed_at": "now()",
    }
    if rejection_reason is not None:
        update["rejection_reason"] = rejection_reason
    if extra_result is not None:
        # merge 가 아니라 replace — 호출자가 기존 result 와 합쳐서 넘긴다고 가정
        update["result"] = extra_result
    res = (
        admin.table("ai_tool_executions")
        .update(update)
        .eq("id", tool_execution_id)
        .execute()
    )
    if not res.data:
        raise RuntimeError("Tool execution not found or update failed")
    return res.data[0]


def get_tool_execution(tool_execution_id: str) -> dict[str, Any] | None:
    admin = get_supabase_admin()
    result = (
        admin.table("ai_tool_executions")
        .select("*")
        .eq("id", tool_execution_id)
        .maybe_single()
        .execute()
    )
    return result.data if result and result.data else None
