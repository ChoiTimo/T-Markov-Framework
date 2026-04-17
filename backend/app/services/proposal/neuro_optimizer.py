"""Neuro-dogma optimizer — Phase 2 Sprint 2-3.

Turns raw selected modules into *content-ready* slide instances
by mapping business context (quote, battle cards, customer profile)
onto each slide's placeholder schema.

This is Phase 1 of the content pipeline; Claude API integration
(Phase 3 / Sprint 2-5) will enrich the `body` field further.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


# ------------------------------------------------------------------
# Data containers
# ------------------------------------------------------------------

@dataclass
class ProposalContext:
    """Business inputs that drive slide content."""
    proposal: dict                         # proposals row
    selected_modules: list[dict]           # ordered output of module_selector
    quote: dict | None = None              # quotes row (optional)
    quote_items: list[dict] | None = None  # quote_items rows (optional)
    battle_cards: list[dict] | None = None # battle_cards rows (optional)
    battle_points: list[dict] | None = None # battle_points rows (optional)
    customer_profile: dict | None = None   # 고객 정보 요약


# ------------------------------------------------------------------
# Slide content builders (per-phase / per-dogma)
# ------------------------------------------------------------------

def _cover_body(ctx: ProposalContext, module: dict) -> dict:
    p = ctx.proposal
    customer = p.get("customer_company") or p.get("customer_name") or "고객사"
    today = datetime.utcnow().strftime("%Y.%m.%d")
    return {
        "title": p.get("title") or "SmartWAN 제안서",
        "subtitle": p.get("subtitle") or f"{customer} 귀중",
        "date": today,
        "author_name": (ctx.customer_profile or {}).get("author_name", "제안팀"),
    }


def _narrative_body(ctx: ProposalContext, module: dict) -> dict:
    """N1: One-slide narrative. Uses customer problem + solution one-liner."""
    p = ctx.proposal
    battle_key_insight = None
    if ctx.battle_cards:
        for bc in ctx.battle_cards:
            if bc.get("key_insight"):
                battle_key_insight = bc["key_insight"]
                break
    narrative = (
        f"{p.get('customer_company') or '고객사'}의 네트워크 성능·보안·비용 이슈를 "
        "차세대 SD-WAN/SASE 통합 플랫폼으로 해소합니다."
    )
    return {
        "headline": "하나의 스토리",
        "narrative": narrative,
        "supporting_insight": battle_key_insight,
    }


def _agenda_body(ctx: ProposalContext, module: dict) -> dict:
    return {
        "headline": "목차",
        "sections": [
            "1. 시장 배경",
            "2. 고객사 이슈",
            "3. 제안 솔루션",
            "4. 기술 증명",
            "5. 도입 로드맵",
        ],
    }


def _context_body(ctx: ProposalContext, module: dict) -> dict:
    return {
        "headline": "시장 배경",
        "bullets": [
            "하이브리드 워크·멀티클라우드 전환으로 네트워크 경로가 복잡화",
            "SaaS/SASE 채택 가속화로 트래픽 패턴이 본사 중심에서 클라우드 분산형으로 이동",
            "보안 사고 비용 상승으로 제로트러스트/SASE 아키텍처 전환이 정책 과제로 부상",
        ],
    }


def _problem_body(ctx: ProposalContext, module: dict) -> dict:
    stakeholders = ctx.proposal.get("stakeholders") or []
    pains = []
    for sh in stakeholders:
        for interest in sh.get("interests", []) or []:
            pains.append(f"{sh.get('role') or '이해관계자'}: {interest}")
    if not pains:
        pains = [
            "대역폭 증설에 비해 체감 성능 개선이 제한적",
            "지사/해외 거점 품질 편차로 운영 부담 증가",
            "보안 정책 분산으로 TCO 및 사고 대응시간 악화",
        ]
    return {
        "headline": "고객사 현재 이슈",
        "pains": pains[:5],
    }


def _embodied_body(ctx: ProposalContext, module: dict) -> dict:
    customer = ctx.proposal.get("customer_company") or "고객사"
    return {
        "headline": "현장에서 보는 모습",
        "scenario": (
            f"{customer} 본사 IT팀 김 과장은 아침마다 해외 지사의 음성·영상 품질 문제를 "
            "처리하느라 반복 업무에 시간을 쓰고 있습니다. 이로 인해 전략 과제는 밀리고, "
            "실시간 트래픽 가시성이 없어 원인 분석도 사후약방문이 됩니다."
        ),
    }


def _competitive_body(ctx: ProposalContext, module: dict) -> dict:
    bullets = []
    for bc in (ctx.battle_cards or [])[:3]:
        insight = bc.get("key_insight") or bc.get("overview") or bc.get("title")
        if insight:
            bullets.append(insight)
    if not bullets:
        bullets = ["대체 솔루션 대비 단일 벤더 의존도/운영 리스크가 존재"]
    return {
        "headline": "경쟁 구도",
        "bullets": bullets,
    }


def _question_body(ctx: ProposalContext, module: dict, flavor: str) -> dict:
    if flavor == "risk":
        return {
            "headline": "지금, 이 선택을 미룰 수 있습니까?",
            "subtext": "보안 사고와 성능 이슈가 누적되는 속도를 고려해 보십시오.",
        }
    return {
        "headline": "무엇이 이 성과를 뒷받침합니까?",
        "subtext": "다음 장의 근거 자료를 함께 보시겠습니다.",
    }


def _surprise_body(ctx: ProposalContext, module: dict) -> dict:
    """N4: Prediction Error 유발 - 고객의 기존 가정을 반전시키는 한 장."""
    return {
        "headline": "예상과 다른 지점",
        "twist": (
            "'대역폭을 키우면 성능이 해결된다'는 가정이 더 이상 성립하지 않습니다. "
            "핵심은 경로 선택과 트래픽 인지형 제어입니다."
        ),
        "evidence_hint": "다음 슬라이드에서 검증 데이터를 제시합니다.",
    }


def _solution_body(ctx: ProposalContext, module: dict) -> dict:
    return {
        "headline": "제안 솔루션 요약",
        "bullets": [
            "차세대 SD-WAN 코어 + 통합 보안 오버레이",
            "지사·해외 거점까지 일관된 정책과 가시성",
            "SaaS 경로 최적화로 체감 성능 개선 + 백본 비용 절감",
        ],
    }


def _value_story_body(ctx: ProposalContext, module: dict) -> dict:
    return {
        "headline": "고객 관점 가치",
        "bullets": [
            "IT 운영: 티켓량 감소 및 평균 해결시간 단축",
            "비즈니스: SaaS 기반 업무 생산성 향상",
            "보안: 제로트러스트 적용으로 사고 대응 리스크 경감",
        ],
    }


def _architecture_body(ctx: ProposalContext, module: dict) -> dict:
    return {
        "headline": "참조 아키텍처",
        "bullets": [
            "코어: 차세대 SD-WAN Overlay (본사·지사·클라우드)",
            "보안: SASE 브로커 + 제로트러스트 정책 엔진",
            "운영: AI 기반 경로 최적화 + 통합 가시성 대시보드",
        ],
    }


def _capability_body(ctx: ProposalContext, module: dict) -> dict:
    return {
        "headline": "기능 비교",
        "matrix": [
            {"capability": "경로 최적화", "ours": "AI 기반 실시간", "legacy": "정적 라우팅"},
            {"capability": "통합 가시성", "ours": "트래픽·보안 단일 뷰", "legacy": "분리된 툴"},
            {"capability": "보안 정책", "ours": "중앙 통합 엔진", "legacy": "사이트별 분산"},
        ],
    }


def _performance_body(ctx: ProposalContext, module: dict) -> dict:
    return {
        "headline": "성능 근거",
        "metrics": [
            {"label": "지연", "before": "기준", "after": "큰 폭 개선"},
            {"label": "패킷 손실", "before": "기준", "after": "큰 폭 감소"},
            {"label": "SaaS 체감 성능", "before": "기준", "after": "유의미 개선"},
        ],
        "note": "고객 환경 PoC 기반 범위 제시 (실측은 설계 단계에서 합의)",
    }


def _roi_body(ctx: ProposalContext, module: dict) -> dict:
    quote = ctx.quote or {}
    return {
        "headline": "ROI / TCO",
        "monthly_amount": quote.get("monthly_amount"),
        "total_amount": quote.get("total_amount"),
        "contract_months": quote.get("contract_months") or 24,
        "bullets": [
            "운영 자동화로 OPEX 절감",
            "보안 사고 리스크 완화로 기대손실 축소",
            "SaaS 생산성 향상으로 매출 영향 기회 확대",
        ],
        "disclaimer": "수치는 PoC 가정 기반이며 실측 후 본 견적으로 확정합니다.",
    }


def _roadmap_body(ctx: ProposalContext, module: dict) -> dict:
    return {
        "headline": "도입 로드맵",
        "phases": [
            {"name": "Phase 1", "weeks": "0-4", "desc": "요구사항 합의 + PoC 설계"},
            {"name": "Phase 2", "weeks": "5-10", "desc": "파일럿 지사 구축 + 벤치마크"},
            {"name": "Phase 3", "weeks": "11-20", "desc": "전사 단계 확산 + 정책 통합"},
            {"name": "Phase 4", "weeks": "21+", "desc": "운영 체계화 + 지속 최적화"},
        ],
    }


def _cta_body(ctx: ProposalContext, module: dict) -> dict:
    return {
        "headline": "Next Step",
        "bullets": [
            "1) 의사결정자 합의 워크숍 (1회)",
            "2) 파일럿 대상 거점 선정 (2주)",
            "3) PoC 계약 및 설계 킥오프",
        ],
        "call_to_action": "이번 주 내 내부 의사결정 일정을 확정해 주시면, 다음 주 PoC 설계 초안을 공유드리겠습니다.",
    }


# ------------------------------------------------------------------
# Dispatch table (code → builder)
# ------------------------------------------------------------------

_BUILDERS: dict[str, Any] = {
    "P1_cover":          _cover_body,
    "N1_narrative":      _narrative_body,
    "P2_agenda":         _agenda_body,
    "P3_context":        _context_body,
    "P4_problem":        _problem_body,
    "N2_embodied":       _embodied_body,
    "P5_competitive":    _competitive_body,
    "N3_question_risk":  lambda ctx, m: _question_body(ctx, m, "risk"),
    "N4_surprise":       _surprise_body,
    "P6_solution":       _solution_body,
    "P7_value_story":    _value_story_body,
    "P8_architecture":   _architecture_body,
    "P9_capability":     _capability_body,
    "P10_performance":   _performance_body,
    "N5_question_proof": lambda ctx, m: _question_body(ctx, m, "proof"),
    "P11_roi":           _roi_body,
    "P12_roadmap":       _roadmap_body,
    "N6_call_to_action": _cta_body,
}


def _default_body(ctx: ProposalContext, module: dict) -> dict:
    return {
        "headline": module.get("name") or module.get("code"),
        "bullets": [module.get("description") or ""],
    }


# ------------------------------------------------------------------
# Main API
# ------------------------------------------------------------------

def build_slide_instances(ctx: ProposalContext) -> list[dict]:
    """Convert selected modules into content-ready slide instance dicts.

    Returned dicts are compatible with the `proposal_slides` table schema
    (code, name, phase, neuro_dogma, title, subtitle, body, speaker_notes,
    sort_order, ai_generated=false).
    """
    results: list[dict] = []

    for idx, module in enumerate(ctx.selected_modules):
        code = module.get("code") or ""
        builder = _BUILDERS.get(code, _default_body)
        try:
            body = builder(ctx, module)
        except Exception as exc:  # noqa: BLE001
            body = {"_error": str(exc), "fallback_name": module.get("name")}

        results.append({
            "module_id": module.get("id"),
            "code": code,
            "name": module.get("name"),
            "phase": module.get("phase"),
            "neuro_dogma": module.get("neuro_dogma"),
            "title": body.get("headline") or module.get("name"),
            "subtitle": body.get("subtext") or body.get("subtitle"),
            "body": body,
            "speaker_notes": module.get("body_hint"),
            "sort_order": (idx + 1) * 10,
            "is_enabled": True,
            "is_customized": False,
            "ai_generated": False,
        })

    return results


def attach_cross_references(
    slides: list[dict],
    quote_items: list[dict] | None,
    battle_points: list[dict] | None,
) -> list[dict]:
    """Populate linked_quote_item_id / linked_battle_point_id hints.

    Strategy:
      - ROI slides link to the top quote_item (if present)
      - Competitive slides link to top differentiator/weakness point
    """
    top_quote_item = (quote_items or [None])[0] if quote_items else None
    top_diff_point = None
    for p in (battle_points or []):
        if p.get("type") in ("differentiator", "weakness"):
            top_diff_point = p
            break

    for s in slides:
        if s.get("code") == "P11_roi" and top_quote_item:
            s["linked_quote_item_id"] = top_quote_item.get("id")
        if s.get("code") == "P5_competitive" and top_diff_point:
            s["linked_battle_point_id"] = top_diff_point.get("id")

    return slides
