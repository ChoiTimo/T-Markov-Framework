"""Proposal slide module selector — Phase 2 Sprint 2-3.

Pure selection layer: given (target_persona, neuro_level, industry, template)
returns an ordered list of slide modules to include.

No DB access here — this module operates on dicts fetched by the API layer.
Side-effect-free, fully unit-testable.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

# ------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------

NEURO_LEVEL_RANK = {
    "minimal":  1,
    "standard": 2,
    "full":     3,
}

PHASE_ORDER = ["frame", "tension", "surprise", "evidence", "conviction"]

# 5대 뉴로 도그마 - 각 단계의 핵심 도그마 (우선순위 가중치)
PHASE_DOGMA_WEIGHTS = {
    "frame":      {"narrative_structure": 3, "precision_anchoring": 2},
    "tension":    {"precision_anchoring": 3, "embodied_cognition": 2, "active_inference": 1},
    "surprise":   {"prediction_error": 3, "narrative_structure": 2},
    "evidence":   {"precision_anchoring": 3, "active_inference": 2},
    "conviction": {"active_inference": 3, "narrative_structure": 2, "precision_anchoring": 1},
}

# 타겟 페르소나별 가중치 조정
PERSONA_BIAS = {
    "c_level": {
        "preferred_dogmas": ["narrative_structure", "prediction_error", "active_inference"],
        "drop_codes": [],  # C-level은 질문 슬라이드 포함 OK
    },
    "practitioner": {
        "preferred_dogmas": ["precision_anchoring", "embodied_cognition"],
        "drop_codes": ["N3_question_risk", "N5_question_proof"],  # 실무자는 질문보다 증거
    },
    "overseas_partner": {
        "preferred_dogmas": ["narrative_structure", "precision_anchoring"],
        "drop_codes": ["N2_embodied"],  # 현지 공감대는 현지에서 만들어야
    },
    "public_sector": {
        "preferred_dogmas": ["precision_anchoring", "active_inference", "narrative_structure"],
        "drop_codes": [],  # 공공은 모든 근거를 포함
    },
}

# 업종별 보너스 도그마
INDUSTRY_DOGMA_HINT = {
    "semiconductor": "precision_anchoring",   # 정량 선호
    "manufacturing": "embodied_cognition",    # 현장 시나리오
    "finance":       "precision_anchoring",   # 리스크/정량
    "public":        "active_inference",      # 책임/프로세스
    "general":       None,
}


# ------------------------------------------------------------------
# Data containers
# ------------------------------------------------------------------

@dataclass
class SelectionInput:
    """Input parameters for module selection."""
    target_persona: str = "c_level"
    neuro_level: str = "standard"
    industry: str = "general"
    template_module_codes: list[str] | None = None   # 템플릿이 강제로 포함시키는 코드
    force_include_codes: list[str] | None = None     # 사용자가 추가로 강제 포함
    force_exclude_codes: list[str] | None = None     # 사용자가 제외


@dataclass
class SelectionResult:
    """Ordered selection result."""
    modules: list[dict]          # 최종 선택된 슬라이드 모듈 (정렬 완료)
    dropped: list[dict]          # 제외된 모듈 (이유와 함께)
    stats: dict                  # 도그마 커버리지 등 메트릭


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _neuro_level_rank(level: str) -> int:
    return NEURO_LEVEL_RANK.get((level or "standard").lower(), 2)


def _meets_level(min_level: str, target_level: str) -> bool:
    """Check if target neuro_level >= module's min_neuro_level."""
    return _neuro_level_rank(target_level) >= _neuro_level_rank(min_level)


def _phase_index(phase: str) -> int:
    try:
        return PHASE_ORDER.index(phase)
    except ValueError:
        return len(PHASE_ORDER)


# ------------------------------------------------------------------
# Core selection
# ------------------------------------------------------------------

def select_modules(
    available_modules: Iterable[dict],
    params: SelectionInput,
) -> SelectionResult:
    """Select slide modules for a proposal instance.

    Selection policy (priority order):
      1. 강제 제외 코드는 무조건 drop
      2. is_required = true AND neuro_level 요건 만족 → 반드시 포함
      3. 템플릿이 지정한 코드 (template_module_codes) → 포함 후보
      4. 강제 포함 코드 (force_include_codes) → 포함 (level 무시)
      5. 페르소나가 drop_codes로 지정한 것 → 제외
      6. min_neuro_level 요건 미달 → 제외

    Sorting:
      1차: PHASE_ORDER 순
      2차: sort_order 오름차순
      3차: is_required → True 먼저
    """
    modules = list(available_modules or [])
    persona_bias = PERSONA_BIAS.get(params.target_persona, PERSONA_BIAS["c_level"])
    force_exclude = set(params.force_exclude_codes or [])
    force_include = set(params.force_include_codes or [])
    persona_drop = set(persona_bias["drop_codes"])
    template_codes = set(params.template_module_codes or [])

    selected: list[dict] = []
    dropped: list[dict] = []

    for m in modules:
        code = m.get("code")
        if not code:
            continue
        if not m.get("is_active", True):
            dropped.append({**m, "_drop_reason": "inactive"})
            continue
        if code in force_exclude:
            dropped.append({**m, "_drop_reason": "force_exclude"})
            continue

        is_required = bool(m.get("is_required"))
        min_level = m.get("min_neuro_level") or "minimal"
        meets_level = _meets_level(min_level, params.neuro_level)

        # 강제 포함 > 필수 > 템플릿 > 레벨 기반
        if code in force_include:
            selected.append(m)
            continue
        if is_required and meets_level:
            selected.append(m)
            continue
        if code in persona_drop:
            dropped.append({**m, "_drop_reason": "persona_drop"})
            continue
        if not meets_level:
            dropped.append({**m, "_drop_reason": f"neuro_level<{min_level}"})
            continue
        if template_codes and code not in template_codes:
            # 템플릿이 있는 경우, 템플릿에 없는 선택적 모듈은 제외
            dropped.append({**m, "_drop_reason": "not_in_template"})
            continue
        selected.append(m)

    # 업종 힌트 기반 우선순위 부스트 (sort_order 안의 타이브레이크에만 영향)
    industry_dogma = INDUSTRY_DOGMA_HINT.get(params.industry)

    def _sort_key(m: dict):
        phase_idx = _phase_index(m.get("phase", ""))
        required_penalty = 0 if m.get("is_required") else 1
        industry_bonus = 0
        if industry_dogma and m.get("neuro_dogma") == industry_dogma:
            industry_bonus = -1   # 낮을수록 먼저
        return (
            phase_idx,
            m.get("sort_order") or 0,
            required_penalty,
            industry_bonus,
            m.get("code") or "",
        )

    selected.sort(key=_sort_key)

    # 도그마 커버리지 계산
    dogma_coverage: dict[str, int] = {}
    for m in selected:
        d = m.get("neuro_dogma")
        if d:
            dogma_coverage[d] = dogma_coverage.get(d, 0) + 1

    phase_distribution: dict[str, int] = {}
    for m in selected:
        p = m.get("phase") or "unknown"
        phase_distribution[p] = phase_distribution.get(p, 0) + 1

    return SelectionResult(
        modules=selected,
        dropped=dropped,
        stats={
            "total_selected": len(selected),
            "total_dropped": len(dropped),
            "dogma_coverage": dogma_coverage,
            "phase_distribution": phase_distribution,
            "neuro_level": params.neuro_level,
            "target_persona": params.target_persona,
            "industry": params.industry,
            "industry_boost_dogma": industry_dogma,
        },
    )


def validate_selection(result: SelectionResult) -> list[str]:
    """Return a list of warnings about the selection.

    Warnings (not errors): missing key phases, low dogma coverage, etc.
    """
    warnings: list[str] = []
    stats = result.stats
    phases = stats.get("phase_distribution") or {}

    for required_phase in ("frame", "surprise", "conviction"):
        if phases.get(required_phase, 0) == 0:
            warnings.append(f"phase '{required_phase}' 에 슬라이드가 없습니다")

    dogmas = stats.get("dogma_coverage") or {}
    if "prediction_error" not in dogmas:
        warnings.append("Prediction Error 도그마 슬라이드가 누락되었습니다 (Surprise 부재 가능)")
    if "narrative_structure" not in dogmas:
        warnings.append("Narrative Structure 도그마 슬라이드가 없어 스토리라인이 약할 수 있습니다")

    total = stats.get("total_selected", 0)
    if total < 8:
        warnings.append(f"슬라이드 수가 너무 적습니다 ({total}장) - 최소 8장 권장")
    if total > 22:
        warnings.append(f"슬라이드 수가 너무 많습니다 ({total}장) - 집중도 하락 우려")

    return warnings
