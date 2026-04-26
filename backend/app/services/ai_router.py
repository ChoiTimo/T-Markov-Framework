"""ModelRouter — Phase 3 Sprint 3-1.

Sonnet/Opus/Haiku 중 한 모델을 task kind 와 컨텍스트 토큰 길이로 골라준다.
모든 Claude 호출은 ModelRouter.pick() 을 경유하므로 모델 변경 시 라우터 한 곳만 수정한다.

설계 원칙 (PHASE3_MASTER_ARCHITECTURE.md §2.2):
  - summarize / classify / tagging  → Haiku (경량)
  - long_gen 또는 context > 80K     → Opus (에스컬레이션)
  - 그 외 chat / plan               → Sonnet (기본)
"""

from __future__ import annotations

from typing import Literal

from app.config import get_settings


TaskKind = Literal["chat", "summarize", "classify", "plan", "long_gen"]


class ModelRouter:
    """단순 분기 라우터. 향후 비용/지연 기반 가중치 추가 여지를 둔다."""

    LONG_CONTEXT_THRESHOLD = 80_000  # tokens

    def __init__(self) -> None:
        s = get_settings()
        self._haiku = s.claude_model_haiku
        self._sonnet = s.claude_model_sonnet
        self._opus = s.claude_model_opus

    def pick(self, task_kind: TaskKind, context_tokens: int = 0) -> str:
        """주어진 task kind 와 컨텍스트 길이에 맞는 모델 식별자를 반환."""
        if task_kind in ("summarize", "classify"):
            return self._haiku
        if task_kind == "long_gen" or context_tokens > self.LONG_CONTEXT_THRESHOLD:
            return self._opus
        return self._sonnet

    @property
    def haiku(self) -> str:
        return self._haiku

    @property
    def sonnet(self) -> str:
        return self._sonnet

    @property
    def opus(self) -> str:
        return self._opus


_router: ModelRouter | None = None


def get_router() -> ModelRouter:
    """프로세스 전역 싱글톤. 환경변수가 lru_cache 로 묶여 있어 재생성 비용 없음."""
    global _router
    if _router is None:
        _router = ModelRouter()
    return _router
