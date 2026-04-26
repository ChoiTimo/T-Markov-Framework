"""AI Assistant API — Phase 3 Sprint 3-1.

Endpoints:
  POST   /api/ai/chat
  GET    /api/ai/conversations
  GET    /api/ai/conversations/{id}
  POST   /api/ai/conversations/{id}/pin
  POST   /api/ai/conversations/{id}/tags
  POST   /api/ai/conversations/{id}/archive
  POST   /api/ai/confirm/{tool_execution_id}

스켈레톤 단계 (Sprint 3-1) — Anthropic SDK 도구 루프와 스트리밍은 Sprint 3-1.b 에서 보강 예정.
현재는 비-스트리밍 응답으로 도구 호출 1턴 + 메시지 영속 + Confirm 루프 골조만 동작.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Literal

from anthropic import Anthropic, APIError
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_user, CurrentUser
from app.config import get_settings
from app.db import get_supabase_admin
from app.services import ai_persistence, ai_tools
from app.services.ai_router import get_router


logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================
# Schemas
# ============================================================

Surface = Literal["proposal_editor", "quote", "battlecard", "dashboard", "global"]


class ChatRequest(BaseModel):
    organization_id: str
    surface: Surface
    surface_ref_id: str | None = None
    conversation_id: str | None = None  # null 이면 새 대화 시작
    message: str = Field(min_length=1, max_length=8000)
    task_kind: Literal["chat", "summarize", "classify", "plan", "long_gen"] = "chat"


class ToolCallOut(BaseModel):
    tool_execution_id: str
    tool_name: str
    status: str
    mutates_data: bool
    result: dict[str, Any]


class ChatResponse(BaseModel):
    conversation_id: str
    assistant_message_id: str
    text: str
    model: str
    tool_calls: list[ToolCallOut] = []
    usage: dict[str, int] = {}


class ConversationOut(BaseModel):
    id: str
    organization_id: str
    user_id: str
    surface: Surface
    surface_ref_id: str | None
    title: str | None
    pinned: bool
    tags: list[str]
    archived_at: str | None
    message_count: int
    updated_at: str


class ConversationDetailOut(ConversationOut):
    messages: list[dict[str, Any]]
    tool_executions: list[dict[str, Any]]


class PinBody(BaseModel):
    pinned: bool


class TagsBody(BaseModel):
    tags: list[str]


class ArchiveBody(BaseModel):
    archived: bool


class ConfirmBody(BaseModel):
    rejected: bool = False
    rejection_reason: str | None = None


# ============================================================
# Helpers
# ============================================================

def _check_org_membership(user: CurrentUser, organization_id: str) -> str:
    """user 가 해당 org 의 member 인지 확인하고 role 반환."""
    admin = get_supabase_admin()
    res = (
        admin.table("org_members")
        .select("role")
        .eq("organization_id", organization_id)
        .eq("user_id", user.id)
        .maybe_single()
        .execute()
    )
    if not res or not res.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )
    return res.data["role"]


def _system_prompt() -> str:
    return (
        "당신은 SKT B2B 네트워크·보안 솔루션의 세일즈 어시스턴트입니다. "
        "사용자가 보고 있는 화면(제안서·견적·배틀카드·대시보드)의 컨텍스트를 활용해 "
        "정확하고 사실 기반의 답변을 제공합니다. 추측보다는 도구를 호출해 실제 데이터를 확인하세요. "
        "쓰기 도구(draft_*) 결과는 사용자 확인 후에만 적용된다는 점을 명시하세요."
    )


def _claude_client() -> Anthropic:
    s = get_settings()
    return Anthropic(api_key=s.anthropic_api_key)


# ============================================================
# POST /api/ai/chat
# ============================================================

@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    user: CurrentUser = Depends(get_current_user),
):
    _check_org_membership(user, body.organization_id)

    # 1. 대화 세션 확보 (없으면 생성)
    if body.conversation_id:
        conv = ai_persistence.get_conversation(body.conversation_id)
        if not conv or conv["organization_id"] != body.organization_id:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        conv = ai_persistence.create_conversation(
            organization_id=body.organization_id,
            user_id=user.id,
            surface=body.surface,
            surface_ref_id=body.surface_ref_id,
        )

    conversation_id = conv["id"]

    # 2. 사용자 메시지 영속
    user_msg = ai_persistence.append_message(
        conversation_id=conversation_id,
        role="user",
        content={"text": body.message},
    )

    # 3. 모델 선택
    router_ = get_router()
    model = router_.pick(body.task_kind, context_tokens=conv.get("total_input_tokens", 0))

    # 4. 이전 메시지 히스토리 로드 → Anthropic message format
    history = ai_persistence.list_messages(conversation_id)
    anthropic_messages: list[dict[str, Any]] = []
    for m in history:
        if m["role"] == "system":
            continue
        text = (m.get("content") or {}).get("text") or ""
        anthropic_messages.append(
            {"role": "user" if m["role"] == "user" else "assistant", "content": text}
        )

    # 5. Claude 호출 + 도구 루프 (Sprint 3-1.b: second pass + max_iterations 가드)
    client = _claude_client()
    tool_calls_out: list[ToolCallOut] = []
    final_text = ""
    usage = {"input_tokens": 0, "output_tokens": 0}
    MAX_TOOL_ITERATIONS = 5

    try:
        for iteration in range(MAX_TOOL_ITERATIONS):
            response = client.messages.create(
                model=model,
                max_tokens=2048,
                system=_system_prompt(),
                tools=ai_tools.TOOL_SCHEMAS,
                messages=anthropic_messages,
            )
            usage["input_tokens"] += response.usage.input_tokens
            usage["output_tokens"] += response.usage.output_tokens

            tool_use_blocks = [
                b for b in response.content if getattr(b, "type", None) == "tool_use"
            ]
            text_blocks = [
                b for b in response.content if getattr(b, "type", None) == "text"
            ]

            # 마지막으로 본 자연어 텍스트가 최종 답변. 도구 결과 second pass 후의 텍스트가 우선됨.
            if text_blocks:
                final_text = "\n".join(b.text for b in text_blocks)

            # stop_reason='end_turn' 또는 도구 호출이 없으면 루프 종료
            if response.stop_reason != "tool_use" or not tool_use_blocks:
                break

            # 1) assistant 응답(tool_use 포함)을 messages 에 그대로 적재
            assistant_blocks: list[dict[str, Any]] = []
            for block in response.content:
                btype = getattr(block, "type", None)
                if btype == "text":
                    assistant_blocks.append({"type": "text", "text": block.text})
                elif btype == "tool_use":
                    assistant_blocks.append(
                        {
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": dict(block.input or {}),
                        }
                    )
            anthropic_messages.append({"role": "assistant", "content": assistant_blocks})

            # 2) 각 도구 실행 + tool_result 블록 수집
            tool_result_blocks: list[dict[str, Any]] = []
            for tu in tool_use_blocks:
                res = ai_tools.execute_tool(
                    tool_name=tu.name,
                    args=dict(tu.input or {}),
                    conversation_id=conversation_id,
                    organization_id=body.organization_id,
                    requested_by=user.id,
                )
                tool_calls_out.append(
                    ToolCallOut(
                        tool_execution_id=res["tool_execution_id"],
                        tool_name=tu.name,
                        status=res["status"],
                        mutates_data=res["mutates_data"],
                        result=res["result"],
                    )
                )
                # 쓰기 도구의 pending 상태는 모델에게도 그대로 전달 (Confirm 대기 정보 포함)
                tool_result_blocks.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tu.id,
                        "content": json.dumps(
                            {
                                "status": res["status"],
                                "mutates_data": res["mutates_data"],
                                "result": res["result"],
                            },
                            ensure_ascii=False,
                            default=str,
                        ),
                    }
                )

            # 3) tool_result 를 user role 메시지로 적재 → 모델이 결과를 보고 자연어 답변
            anthropic_messages.append({"role": "user", "content": tool_result_blocks})

        else:
            # for-else: MAX_TOOL_ITERATIONS 를 모두 소진했지만 break 없이 종료한 경우
            if not final_text:
                final_text = (
                    "(도구 호출이 반복 한도(%d회)에 도달하여 응답을 마감합니다.)"
                    % MAX_TOOL_ITERATIONS
                )

    except APIError as e:
        logger.exception("Claude API error")
        ai_persistence.append_message(
            conversation_id=conversation_id,
            role="assistant",
            content={"text": "(모델 호출 실패)"},
            model=model,
            error_kind="api_error",
            error_detail=str(e)[:500],
        )
        raise HTTPException(status_code=502, detail="Claude API error")

    # 6. assistant 메시지 영속
    assistant_msg = ai_persistence.append_message(
        conversation_id=conversation_id,
        role="assistant",
        content={
            "text": final_text,
            "tool_calls": [tc.model_dump() for tc in tool_calls_out],
        },
        model=model,
        input_tokens=usage["input_tokens"],
        output_tokens=usage["output_tokens"],
        parent_message_id=user_msg["id"],
    )

    return ChatResponse(
        conversation_id=conversation_id,
        assistant_message_id=assistant_msg["id"],
        text=final_text,
        model=model,
        tool_calls=tool_calls_out,
        usage=usage,
    )


# ============================================================
# Conversations CRUD
# ============================================================

@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations_endpoint(
    organization_id: str,
    surface: Surface | None = None,
    surface_ref_id: str | None = None,
    include_archived: bool = False,
    user: CurrentUser = Depends(get_current_user),
):
    _check_org_membership(user, organization_id)
    rows = ai_persistence.list_conversations(
        organization_id=organization_id,
        surface=surface,
        surface_ref_id=surface_ref_id,
        include_archived=include_archived,
    )
    return rows


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailOut)
async def get_conversation_detail(
    conversation_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    conv = ai_persistence.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    _check_org_membership(user, conv["organization_id"])
    msgs = ai_persistence.list_messages(conversation_id)
    admin = get_supabase_admin()
    tools = (
        admin.table("ai_tool_executions")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
    ).data or []
    return {**conv, "messages": msgs, "tool_executions": tools}


@router.post("/conversations/{conversation_id}/pin")
async def pin_conversation(
    conversation_id: str,
    body: PinBody,
    user: CurrentUser = Depends(get_current_user),
):
    conv = ai_persistence.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    _check_org_membership(user, conv["organization_id"])
    ai_persistence.update_conversation_meta(conversation_id, pinned=body.pinned)
    return {"ok": True}


@router.post("/conversations/{conversation_id}/tags")
async def set_conversation_tags(
    conversation_id: str,
    body: TagsBody,
    user: CurrentUser = Depends(get_current_user),
):
    conv = ai_persistence.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    _check_org_membership(user, conv["organization_id"])
    ai_persistence.update_conversation_meta(conversation_id, tags=body.tags)
    return {"ok": True}


@router.post("/conversations/{conversation_id}/archive")
async def archive_conversation(
    conversation_id: str,
    body: ArchiveBody,
    user: CurrentUser = Depends(get_current_user),
):
    conv = ai_persistence.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    _check_org_membership(user, conv["organization_id"])
    archived_at = "now()" if body.archived else None
    ai_persistence.update_conversation_meta(conversation_id, archived_at=archived_at)
    return {"ok": True, "archived": body.archived}


# ============================================================
# Confirm 루프
# ============================================================

@router.post("/confirm/{tool_execution_id}")
async def confirm_tool(
    tool_execution_id: str,
    body: ConfirmBody,
    user: CurrentUser = Depends(get_current_user),
):
    rec = ai_persistence.get_tool_execution(tool_execution_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    _check_org_membership(user, rec["organization_id"])

    if body.rejected:
        ai_persistence.confirm_tool_execution(
            tool_execution_id,
            confirmed_by=user.id,
            new_status="rejected",
            rejection_reason=body.rejection_reason,
        )
        return {"status": "rejected"}

    updated = ai_tools.apply_confirmed_tool(tool_execution_id, confirmed_by=user.id)
    return {"status": updated["status"], "result": updated.get("result")}
