"""Claude API-backed slide module recommender — Phase 2 Sprint 2-5.

Given a proposal's customer context, the currently assembled slide list, and
the full module catalog, ask Claude to recommend:

  * additions   — modules that would strengthen the deck
  * removals    — modules that dilute the message for this audience
  * emphasis    — existing slides whose focus/angle should be adjusted
  * summary     — one-paragraph rationale describing the proposed direction

Output is a stable JSON schema the frontend can render directly; Claude is
instructed to answer with JSON only so we can parse deterministically.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from anthropic import Anthropic, APIError

from app.config import get_settings

logger = logging.getLogger(__name__)

# Keep prompts compact so a standard deck (≤ 18 slides + ≤ 18 modules) fits well
# under Claude's context window even with customer narrative attached.
_SYSTEM_PROMPT = """당신은 SKT B2B 네트워크·보안 솔루션 제안서 설계 전문가입니다.
뇌과학 기반 5단계 설득 플로우(프레임 → 긴장 → 서프라이즈 → 증명 → 확신)와
5대 도그마(예측 오류 / 정밀 앵커링 / 내러티브 / 체화 인지 / 능동 추론)를 활용해
의사결정권자의 뇌를 설득하는 제안서를 최적화합니다.

주어진 고객 맥락·현재 슬라이드 목록·모듈 카탈로그를 분석해
아래 JSON 스키마로만 답변하세요. 설명 문장을 앞뒤에 붙이지 마세요.

{
  "additions": [
    {"code": "<module_code>", "phase": "<slide_phase>", "reason": "<1~2문장 한국어>"}
  ],
  "removals": [
    {"code": "<slide_code>", "reason": "<1~2문장 한국어>"}
  ],
  "emphasis": [
    {"code": "<slide_code>", "suggestion": "<1~2문장 한국어, 구체 수치·맥락 포함>"}
  ],
  "summary": "<3~5문장 한국어, 전체 방향성 요약>"
}

규칙:
- additions 에 들어가는 code 는 반드시 available_modules 에 있어야 합니다.
- removals / emphasis 에 들어가는 code 는 반드시 current_slides 에 있어야 합니다.
- 각 리스트는 0~4개까지. 근거가 약하면 빈 배열을 허용합니다.
- 금융/공공 C레벨이면 ROI·회복력·컴플라이언스를, 제조/유통이면 지점망 통합·안정성을,
  실무자면 운영·정책 관리 편의성을 우선 고려합니다."""


@dataclass
class ModuleCatalogItem:
    code: str
    name: str
    phase: str
    neuro_dogma: str | None = None
    body_hint: str | None = None


@dataclass
class SlideSnapshot:
    code: str
    phase: str
    title: str | None = None
    is_enabled: bool = True


@dataclass
class CustomerContext:
    name: str | None = None
    company: str | None = None
    industry: str | None = None
    segment: str | None = None
    target_persona: str | None = None
    stakeholders: list[dict] = field(default_factory=list)
    notes: str | None = None
    quote_summary: list[str] = field(default_factory=list)
    battle_card_summary: list[str] = field(default_factory=list)


@dataclass
class RecommendationAddition:
    code: str
    phase: str
    reason: str


@dataclass
class RecommendationRemoval:
    code: str
    reason: str


@dataclass
class RecommendationEmphasis:
    code: str
    suggestion: str


@dataclass
class RecommendationResult:
    additions: list[RecommendationAddition]
    removals: list[RecommendationRemoval]
    emphasis: list[RecommendationEmphasis]
    summary: str
    model: str
    raw: dict[str, Any]


class RecommenderUnavailable(RuntimeError):
    """Raised when ANTHROPIC_API_KEY is not configured."""


class RecommenderInvalidResponse(RuntimeError):
    """Raised when Claude returns output we cannot parse."""


def _build_user_prompt(
    customer: CustomerContext,
    current_slides: list[SlideSnapshot],
    available_modules: list[ModuleCatalogItem],
) -> str:
    lines: list[str] = []
    lines.append("<customer>")
    if customer.company:
        lines.append(f"회사: {customer.company}")
    if customer.name:
        lines.append(f"담당자: {customer.name}")
    if customer.industry:
        lines.append(f"업종: {customer.industry}")
    if customer.segment:
        lines.append(f"세그먼트: {customer.segment}")
    if customer.target_persona:
        lines.append(f"타겟 페르소나: {customer.target_persona}")
    if customer.stakeholders:
        lines.append("이해관계자:")
        for s in customer.stakeholders[:6]:
            role = s.get("role") or "-"
            name = s.get("name") or "-"
            interests = ", ".join(s.get("interests") or []) or "-"
            lines.append(f"  · {name} ({role}) — 관심사: {interests}")
    if customer.notes:
        note = customer.notes.strip().replace("\n", " ")
        if len(note) > 400:
            note = note[:400] + "…"
        lines.append(f"노트: {note}")
    lines.append("</customer>")

    if customer.quote_summary:
        lines.append("")
        lines.append("<quote_summary>")
        for q in customer.quote_summary[:6]:
            lines.append(f"- {q}")
        lines.append("</quote_summary>")

    if customer.battle_card_summary:
        lines.append("")
        lines.append("<battle_card_summary>")
        for b in customer.battle_card_summary[:6]:
            lines.append(f"- {b}")
        lines.append("</battle_card_summary>")

    lines.append("")
    lines.append("<current_slides>")
    for s in current_slides:
        flag = "" if s.is_enabled else " [off]"
        title = f" — {s.title}" if s.title else ""
        lines.append(f"- {s.code} ({s.phase}){flag}{title}")
    lines.append("</current_slides>")

    lines.append("")
    lines.append("<available_modules>")
    for m in available_modules:
        dogma = f" / {m.neuro_dogma}" if m.neuro_dogma else ""
        hint = f" — {m.body_hint}" if m.body_hint else ""
        lines.append(f"- {m.code} ({m.phase}{dogma}) {m.name}{hint}")
    lines.append("</available_modules>")

    lines.append("")
    lines.append("응답은 위 스키마의 JSON 한 객체만 출력하세요.")
    return "\n".join(lines)


def _extract_json(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    # Claude may wrap JSON in ```json ... ``` fences; strip if present.
    if text.startswith("```"):
        # remove opening fence
        first_nl = text.find("\n")
        if first_nl > 0:
            text = text[first_nl + 1 :]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to locate the first {...} block
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            snippet = text[start : end + 1]
            try:
                return json.loads(snippet)
            except json.JSONDecodeError as exc:
                raise RecommenderInvalidResponse(
                    f"Claude response is not valid JSON: {exc}"
                )
        raise RecommenderInvalidResponse("Claude response did not contain a JSON object")


def _coerce_result(
    parsed: dict[str, Any],
    *,
    valid_module_codes: set[str],
    valid_slide_codes: set[str],
    module_phase_by_code: dict[str, str],
    model: str,
) -> RecommendationResult:
    additions: list[RecommendationAddition] = []
    for entry in parsed.get("additions") or []:
        if not isinstance(entry, dict):
            continue
        code = str(entry.get("code") or "").strip()
        reason = str(entry.get("reason") or "").strip()
        if not code or code not in valid_module_codes:
            continue
        phase = str(entry.get("phase") or module_phase_by_code.get(code) or "").strip()
        if not reason:
            continue
        additions.append(RecommendationAddition(code=code, phase=phase, reason=reason))

    removals: list[RecommendationRemoval] = []
    for entry in parsed.get("removals") or []:
        if not isinstance(entry, dict):
            continue
        code = str(entry.get("code") or "").strip()
        reason = str(entry.get("reason") or "").strip()
        if not code or code not in valid_slide_codes or not reason:
            continue
        removals.append(RecommendationRemoval(code=code, reason=reason))

    emphasis: list[RecommendationEmphasis] = []
    for entry in parsed.get("emphasis") or []:
        if not isinstance(entry, dict):
            continue
        code = str(entry.get("code") or "").strip()
        suggestion = str(entry.get("suggestion") or "").strip()
        if not code or code not in valid_slide_codes or not suggestion:
            continue
        emphasis.append(RecommendationEmphasis(code=code, suggestion=suggestion))

    summary = str(parsed.get("summary") or "").strip()

    return RecommendationResult(
        additions=additions[:4],
        removals=removals[:4],
        emphasis=emphasis[:4],
        summary=summary,
        model=model,
        raw=parsed,
    )


def recommend(
    *,
    customer: CustomerContext,
    current_slides: list[SlideSnapshot],
    available_modules: list[ModuleCatalogItem],
    max_tokens: int = 1600,
) -> RecommendationResult:
    settings = get_settings()
    api_key = settings.anthropic_api_key
    if not api_key:
        raise RecommenderUnavailable(
            "ANTHROPIC_API_KEY is not configured — recommendation disabled."
        )

    model = settings.claude_model or "claude-sonnet-4-20250514"

    client = Anthropic(api_key=api_key)

    user_prompt = _build_user_prompt(customer, current_slides, available_modules)

    try:
        resp = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
    except APIError as exc:
        logger.exception("Claude API call failed")
        raise RecommenderInvalidResponse(f"Claude API error: {exc}") from exc

    # Join all text blocks in the response
    text_parts: list[str] = []
    for block in resp.content or []:
        # Pydantic model (anthropic SDK) — use attribute access
        btype = getattr(block, "type", None)
        if btype == "text":
            text_parts.append(getattr(block, "text", "") or "")
    raw_text = "\n".join(text_parts).strip()

    if not raw_text:
        raise RecommenderInvalidResponse("Claude returned no text content")

    parsed = _extract_json(raw_text)

    return _coerce_result(
        parsed,
        valid_module_codes={m.code for m in available_modules},
        valid_slide_codes={s.code for s in current_slides},
        module_phase_by_code={m.code: m.phase for m in available_modules},
        model=model,
    )


__all__ = [
    "CustomerContext",
    "ModuleCatalogItem",
    "SlideSnapshot",
    "RecommendationAddition",
    "RecommendationEmphasis",
    "RecommendationRemoval",
    "RecommendationResult",
    "RecommenderInvalidResponse",
    "RecommenderUnavailable",
    "recommend",
]
